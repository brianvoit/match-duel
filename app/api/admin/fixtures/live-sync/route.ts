import { NextRequest, NextResponse } from 'next/server';
import { fetchApiFootballFixtures, mapToProviderFixtures, WC_LEAGUE_ID, ApiFootballRateLimitError } from '@/lib/jobs/apiFootballClient';
import { runFixtureSync } from '@/lib/jobs/fixtureSync';
import { runRoundTransitions, runLockedPickDefaults } from '@/lib/jobs/roundTransitions';
import { invalidateCache } from '@/lib/jobs/fixtureApiCache';
import { notifyMatchFinished } from '@/lib/jobs/notifyMatchFinished';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';

/**
 * POST /api/admin/fixtures/live-sync
 *
 * Full pipeline:
 *   1. Fetch all WC fixtures from API-Football
 *   2. Upsert into the fixture table (scores + status)
 *   3. Run round transitions (mark complete rounds, settle scores, send notifications)
 *
 * Called every 30 minutes by the match-duel-cron Cloudflare Worker.
 * Can also be triggered manually for testing.
 *
 * Switch between seasons via the API_FOOTBALL_SEASON env var:
 *   2022 = free plan (historical, for dev/testing)
 *   2026 = requires Starter plan (production)
 */
export async function POST(req: NextRequest) {
  const token = process.env.JOB_ADMIN_TOKEN;
  if (token) {
    const auth = req.headers.get('Authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const season = serverEnv.API_FOOTBALL_SEASON;

    // Find the active tournament
    const service = createServiceRoleClient();
    const { data: tournament } = await service
      .from('tournament')
      .select('id, year')
      .eq('is_active', true)
      .maybeSingle() as { data: { id: string; year: number } | null };

    if (!tournament) {
      return NextResponse.json({ ok: false, error: 'No active tournament.' }, { status: 404 });
    }

    // 1. Fetch from API-Football
    const searchParams = new URL(req.url).searchParams;
    const forceFullSync = searchParams.get('full') === '1';

    const mergeById = (...lists: Awaited<ReturnType<typeof fetchApiFootballFixtures>>[]) => {
      const byId = new Map<number, (typeof lists)[number][number]>();
      for (const list of lists) for (const f of list) byId.set(f.fixture.id, f);
      return [...byId.values()];
    };

    let apiFixtures: Awaited<ReturnType<typeof fetchApiFootballFixtures>>;

    if (forceFullSync) {
      apiFixtures = await fetchApiFootballFixtures(WC_LEAGUE_ID, season);
    } else {
      // Always fetch today's fixtures (live + finished) AND any currently-live
      // matches — fetched together, not gated on one another. Previously today's
      // results were skipped whenever any match was live, which left finished
      // matches stuck on "LIVE" for hours during back-to-back games.
      const today = new Date().toISOString().split('T')[0];
      const [todayRaw, liveRaw] = await Promise.all([
        fetchApiFootballFixtures(WC_LEAGUE_ID, season, { date: today }),
        fetchApiFootballFixtures(WC_LEAGUE_ID, season, { liveOnly: true }),
      ]);
      apiFixtures = mergeById(todayRaw, liveRaw);

      // Safety net: settle any fixture still marked LIVE in our DB that the feeds
      // above didn't return (e.g. it ended on a previous UTC day and the FINAL
      // transition was missed) by fetching its current state directly by id.
      const covered = new Set(apiFixtures.map((f) => String(f.fixture.id)));
      const { data: stuckLive } = await service
        .from('fixture')
        .select('external_provider_id')
        .eq('status', 'LIVE')
        .not('external_provider_id', 'is', null) as { data: Array<{ external_provider_id: string | null }> | null };
      const stuckIds = (stuckLive ?? [])
        .map((r) => r.external_provider_id)
        .filter((id): id is string => Boolean(id) && !covered.has(id as string));
      for (let i = 0; i < stuckIds.length; i += 20) {
        const batch = await fetchApiFootballFixtures(WC_LEAGUE_ID, season, { ids: stuckIds.slice(i, i + 20).join('-') });
        apiFixtures = mergeById(apiFixtures, batch);
      }

      // Off-season / nothing today and nothing live → fall back to a full sync.
      if (!apiFixtures.length) {
        apiFixtures = await fetchApiFootballFixtures(WC_LEAGUE_ID, season);
      }
    }

    if (!apiFixtures.length) {
      return NextResponse.json({
        ok: true,
        message: 'No fixtures to sync right now.',
        season,
      });
    }

    // 2. Map to our format
    const { fixtures, skipped } = await mapToProviderFixtures(apiFixtures, tournament.id);

    if (!fixtures.length) {
      return NextResponse.json({
        ok: false,
        error: `All ${apiFixtures.length} API fixtures were skipped (round mapping failed). Check round names.`,
      }, { status: 400 });
    }

    // 3. Upsert fixtures
    const syncResult = await runFixtureSync({
      provider: 'API_FOOTBALL',
      dryRun: false,
      fixtures,
    });

    // 4. Fire per-match notifications for newly-final fixtures (respects user prefs)
    notifyMatchFinished(syncResult.newlyFinal).catch(() => {});

    // 4b. Drop LIVE-era stats/events snapshots for matches that just went FINAL,
    //     so the post-match recap fetches the complete final data (incl. stoppage
    //     time goals/cards) instead of a frozen pre-whistle snapshot.
    if (syncResult.newlyFinal.length > 0) {
      await invalidateCache(syncResult.newlyFinal.map((f) => f.id), ['stats', 'events']);
    }

    // 5. Materialise default picks for matches that have now locked, so auto-picks
    //    count toward the live scorebug immediately (not just at round settlement).
    const lockedDefaults = await runLockedPickDefaults({ tournamentId: tournament.id });

    // 6. Settle any rounds that are now complete
    const transitions = await runRoundTransitions({ tournamentId: tournament.id });

    return NextResponse.json({
      ok: true,
      season,
      tournament: { id: tournament.id, year: tournament.year },
      api: { total: apiFixtures.length, mapped: fixtures.length, skipped },
      sync: syncResult,
      lockedDefaults,
      transitions,
    });
  } catch (err) {
    // Per-minute rate limit: skip this run cleanly (200) so the cron doesn't
    // retry-storm and pile more requests onto an already-throttled API.
    if (err instanceof ApiFootballRateLimitError) {
      return NextResponse.json({ ok: true, skipped: 'rate_limit' });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error('[live-sync] FAILED:', message, err instanceof Error ? err.stack : '');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
