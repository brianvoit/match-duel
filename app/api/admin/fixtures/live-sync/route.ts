import { NextRequest, NextResponse } from 'next/server';
import { fetchApiFootballFixtures, mapToProviderFixtures, WC_LEAGUE_ID } from '@/lib/jobs/apiFootballClient';
import { runFixtureSync } from '@/lib/jobs/fixtureSync';
import { runRoundTransitions } from '@/lib/jobs/roundTransitions';
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
    const apiFixtures = await fetchApiFootballFixtures(WC_LEAGUE_ID, season);

    if (!apiFixtures.length) {
      return NextResponse.json({
        ok: false,
        error: `API-Football returned 0 fixtures for league=${WC_LEAGUE_ID} season=${season}. Check your plan — the free tier only covers historical seasons.`,
      }, { status: 400 });
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

    // 4. Settle any rounds that are now complete
    const transitions = await runRoundTransitions({ tournamentId: tournament.id });

    return NextResponse.json({
      ok: true,
      season,
      tournament: { id: tournament.id, year: tournament.year },
      api: { total: apiFixtures.length, mapped: fixtures.length, skipped },
      sync: syncResult,
      transitions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
