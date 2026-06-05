/**
 * API-Football client (https://api-football.com)
 *
 * Free plan: historical data only (≤ 2024). Switch API_FOOTBALL_SEASON=2026
 * once the Starter plan is active — nothing else needs to change.
 *
 * Rate: 100 req/day (free) / 500 req/day (starter).
 * Cron fires every 30 min = 48 req/day — well within both limits.
 */

import { serverEnv } from '@/lib/supabase/env';
import { createServiceRoleClient } from '@/lib/supabase/service';
import type { ProviderFixture } from '@/lib/jobs/fixtureProvider';

const BASE_URL = 'https://v3.football.api-sports.io';
export const WC_LEAGUE_ID = 1; // FIFA World Cup is always league 1

// ── API response types ────────────────────────────────────────────────────────

interface ApiStatus {
  short: string;   // NS, 1H, HT, 2H, FT, AET, PEN, PST, CANC, …
  elapsed: number | null;
}

interface ApiFixture {
  fixture: {
    id: number;
    date: string;     // ISO-8601 UTC
    status: ApiStatus;
    venue: { name: string | null; city: string | null };
  };
  league: { round: string; season: number };
  teams: { home: { name: string }; away: { name: string } };
  goals: { home: number | null; away: number | null };
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

function mapStatus(
  short: string
): 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED' | 'CANCELED' {
  switch (short) {
    case 'NS':
    case 'TBD':
      return 'SCHEDULED';
    case '1H':
    case 'HT':
    case '2H':
    case 'ET':
    case 'BT':
    case 'P':
    case 'INT':
    case 'LIVE':
      return 'LIVE';
    case 'FT':
    case 'AET':
    case 'PEN':
    case 'AWD':
    case 'WO':
      return 'FINAL';
    case 'PST':
    case 'SUSP':
      return 'POSTPONED';
    default:
      return 'CANCELED';
  }
}

/**
 * Maps API-Football's round string to our internal stage name.
 *
 * WC 2022 examples: "Group Stage - 1", "Round of 16", "Quarter-finals"
 * WC 2026 additions: "Round of 32"
 */
function apiRoundToStage(round: string): string | null {
  if (round.startsWith('Group Stage')) return 'GROUP';
  if (round === 'Round of 32') return 'ROUND_OF_32';
  if (round === 'Round of 16') return 'ROUND_OF_16';
  if (round === 'Quarter-finals') return 'QUARTERFINAL';
  if (round === 'Semi-finals') return 'SEMIFINAL';
  if (round === '3rd Place Final') return 'THIRD_PLACE';
  if (round === 'Final') return 'FINAL';
  return null;
}

/** "Group Stage - 2" → matchday 2, knockout stages → null */
function apiRoundToMatchday(round: string): number | null {
  const match = round.match(/Group Stage - (\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all fixtures for a league+season from API-Football.
 * Pass `liveOnly: true` to only fetch LIVE matches (much cheaper during cron runs
 * when no match is in progress). Pass `date` to fetch a specific day's fixtures.
 */
export async function fetchApiFootballFixtures(
  leagueId: number,
  season: number,
  options: { liveOnly?: boolean; date?: string } = {}
): Promise<ApiFixture[]> {
  const key = serverEnv.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY is not configured.');

  let url: string;
  if (options.liveOnly) {
    // Only in-progress matches (1H, HT, 2H, ET, BT, P) — very cheap
    url = `${BASE_URL}/fixtures?live=all&league=${leagueId}&timezone=UTC`;
  } else if (options.date) {
    // All matches on a specific date — used to sync results same day
    url = `${BASE_URL}/fixtures?league=${leagueId}&season=${season}&date=${options.date}&timezone=UTC`;
  } else {
    url = `${BASE_URL}/fixtures?league=${leagueId}&season=${season}&timezone=UTC`;
  }
  const res = await fetch(url, {
    headers: { 'x-apisports-key': key },
    // Bypass Cloudflare/Next.js caches — we always want fresh data
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`API-Football request failed: HTTP ${res.status}`);

  const data = await res.json() as {
    response: ApiFixture[];
    errors?: Record<string, string>;
  };

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
  }

  return data.response ?? [];
}

/**
 * Convert API-Football fixtures to ProviderFixture format, looking up
 * round IDs from the active tournament in the DB.
 */
export async function mapToProviderFixtures(
  apiFixtures: ApiFixture[],
  tournamentId: string
): Promise<{ fixtures: ProviderFixture[]; skipped: number }> {
  const service = createServiceRoleClient();

  // Load all rounds for this tournament once
  const { data: rounds } = await service
    .from('round')
    .select('id, stage')
    .eq('tournament_id', tournamentId) as {
      data: Array<{ id: string; stage: string }> | null;
    };

  const roundIdByStage = new Map((rounds ?? []).map(r => [r.stage, r.id]));

  const fixtures: ProviderFixture[] = [];
  let skipped = 0;

  for (const f of apiFixtures) {
    const stage = apiRoundToStage(f.league.round);
    if (!stage) { skipped++; continue; }

    const roundId = roundIdByStage.get(stage);
    if (!roundId) { skipped++; continue; }

    fixtures.push({
      externalProviderId: String(f.fixture.id),
      roundId,
      startsAt:  f.fixture.date,
      homeTeam:  f.teams.home.name,
      awayTeam:  f.teams.away.name,
      homeScore: f.goals.home  ?? null,
      awayScore: f.goals.away  ?? null,
      status:    mapStatus(f.fixture.status.short),
      matchday:  apiRoundToMatchday(f.league.round),
      groupName: null,  // available via /standings if needed later
      venue:     f.fixture.venue.name ?? null,
      city:      f.fixture.venue.city ?? null,
    });
  }

  return { fixtures, skipped };
}
