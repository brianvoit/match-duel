import { NextRequest, NextResponse } from 'next/server';
import { fetchApiFootballFixtures, mapToProviderFixtures, WC_LEAGUE_ID, ApiFootballRateLimitError } from '@/lib/jobs/apiFootballClient';
import { runFixtureSync } from '@/lib/jobs/fixtureSync';
import { runRoundTransitions, runLockedPickDefaults } from '@/lib/jobs/roundTransitions';
import { ensureBracketSeeded, runBracketResolution, reconcileBracketFromApi } from '@/lib/jobs/resolveBracket';
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
    // Find the active tournament + its API-Football target (per-tournament league
    // and season, falling back to the men's WC defaults if unset).
    const service = createServiceRoleClient();
    const { data: tournament } = await service
      .from('tournament')
      .select('id, year, league_id, season')
      .eq('is_active', true)
      .maybeSingle() as { data: { id: string; year: number; league_id: number | null; season: number | null } | null };

    if (!tournament) {
      return NextResponse.json({ ok: false, error: 'No active tournament.' }, { status: 404 });
    }

    const leagueId = tournament.league_id ?? WC_LEAGUE_ID;
    const season = tournament.season ?? serverEnv.API_FOOTBALL_SEASON;

    // 1. Fetch from API-Football
    const searchParams = new URL(req.url).searchParams;
    const forceFullSync = searchParams.get('full') === '1';

    // Once every round has settled, there is nothing left for API-Football to
    // tell us — but the "nothing today, nothing live" branch below would
    // otherwise fall back to a full-season sync on every single cron tick
    // (every 2 minutes), burning API quota indefinitely for zero benefit. Skip
    // the sync entirely in that case; ?full=1 still forces a real run (e.g. to
    // pull in a late correction from the provider).
    if (!forceFullSync) {
      const { data: openRounds } = await service
        .from('round')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('is_complete', false)
        .limit(1);
      if (!openRounds || openRounds.length === 0) {
        return NextResponse.json({
          ok: true,
          message: 'Tournament fully complete — nothing to sync.',
          season,
        });
      }
    }

    const mergeById = (...lists: Awaited<ReturnType<typeof fetchApiFootballFixtures>>[]) => {
      const byId = new Map<number, (typeof lists)[number][number]>();
      for (const list of lists) for (const f of list) byId.set(f.fixture.id, f);
      return [...byId.values()];
    };

    let apiFixtures: Awaited<ReturnType<typeof fetchApiFootballFixtures>>;

    if (forceFullSync) {
      apiFixtures = await fetchApiFootballFixtures(leagueId, season);
    } else {
      // Always fetch today's fixtures (live + finished) AND any currently-live
      // matches — fetched together, not gated on one another. Previously today's
      // results were skipped whenever any match was live, which left finished
      // matches stuck on "LIVE" for hours during back-to-back games.
      const today = new Date().toISOString().split('T')[0];
      const [todayRaw, liveRaw] = await Promise.all([
        fetchApiFootballFixtures(leagueId, season, { date: today }),
        fetchApiFootballFixtures(leagueId, season, { liveOnly: true }),
      ]);
      apiFixtures = mergeById(todayRaw, liveRaw);

      // Safety net: settle any fixture the feeds above didn't return but that
      // should have a result by now, by fetching its current state directly by id:
      //   - still marked LIVE (ended on a previous UTC day, FINAL transition missed)
      //   - still SCHEDULED yet already past kickoff (e.g. it kicked off and
      //     finished during an API outage, so it never advanced to LIVE and the
      //     incremental "today + live" feeds no longer cover it).
      const nowIso = new Date().toISOString();
      const covered = new Set(apiFixtures.map((f) => String(f.fixture.id)));
      const { data: stuckLive } = await service
        .from('fixture')
        .select('external_provider_id')
        .not('external_provider_id', 'is', null)
        .or(`status.eq.LIVE,and(status.eq.SCHEDULED,starts_at.lt.${nowIso})`) as { data: Array<{ external_provider_id: string | null }> | null };
      const stuckIds = (stuckLive ?? [])
        .map((r) => r.external_provider_id)
        .filter((id): id is string => Boolean(id) && !covered.has(id as string));
      for (let i = 0; i < stuckIds.length; i += 20) {
        const batch = await fetchApiFootballFixtures(leagueId, season, { ids: stuckIds.slice(i, i + 20).join('-') });
        apiFixtures = mergeById(apiFixtures, batch);
      }

      // Off-season / nothing today and nothing live → fall back to a full sync.
      if (!apiFixtures.length) {
        apiFixtures = await fetchApiFootballFixtures(leagueId, season);
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

    // 7. Knockout bracket: ensure the skeleton exists and fill teams from results
    //    so far. These are DB-only (no API calls), so they run every tick.
    const bracketSeed = await ensureBracketSeeded({ tournamentId: tournament.id });
    const bracket = await runBracketResolution({ tournamentId: tournament.id });

    //    The API reconcile fetches the ENTIRE season to match our slots to the
    //    real draw — far too expensive to run every minute (it exhausts the
    //    API-Football daily request quota, which freezes all score syncing).
    //    The published draw barely changes, so run it only every 15 min or on
    //    the daily full sync. Score sync (today + live) still runs every tick.
    const runReconcile = forceFullSync || new Date().getUTCMinutes() % 15 === 0;
    const bracketApi = runReconcile
      ? await reconcileBracketFromApi({ tournamentId: tournament.id })
      : { linked: 0, skipped: 'throttled' as const };

    return NextResponse.json({
      ok: true,
      season,
      tournament: { id: tournament.id, year: tournament.year },
      api: { total: apiFixtures.length, mapped: fixtures.length, skipped },
      sync: syncResult,
      lockedDefaults,
      transitions,
      bracket: { ...bracketSeed, ...bracket, ...bracketApi },
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
