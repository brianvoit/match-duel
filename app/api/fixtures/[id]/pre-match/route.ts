import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
import { getCached, setCached } from '@/lib/jobs/fixtureApiCache';
import type {
  PreMatchData, PreMatchPredictions, GroupStandingRow,
  TeamGoals, InjuryEntry, MatchOdds, TopScorer, StyleComparison,
} from '@/app/components/playground-types';

interface RouteContext { params: Promise<{ id: string }> }

const BASE = 'https://v3.football.api-sports.io';

async function apiFetch(key: string, path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-apisports-key': key },
      next: { revalidate: 3600 }, // 1-hour cache
    });
    const data = await res.json();
    if (data.errors && Object.keys(data.errors).length) return null;
    return data.response ?? null;
  } catch { return null; }
}

function pct(s: string | undefined): number {
  return parseInt((s ?? '0').replace('%', '')) || 0;
}

/**
 * Group standings computed from our own fixture results (not the API standings
 * endpoint). Uses our canonical team names and our synced scores, so it's always
 * consistent with what's shown elsewhere and updates the moment a match goes
 * FINAL. Computed fresh on every request (cheap DB query) — never cached — so it
 * never lags behind results the way the 6h pre_match cache would.
 */
async function computeGroupStandings(
  service: ReturnType<typeof createServiceRoleClient>,
  fixture: { home_team: string; away_team: string; group_name: string | null; round_id: string }
): Promise<PreMatchData['standings']> {
  const groupLetter = fixture.group_name;
  if (!groupLetter) return null;

  const { data: groupFixtures } = await service
    .from('fixture')
    .select('home_team, away_team, home_score, away_score, status')
    .eq('round_id', fixture.round_id)
    .eq('group_name', groupLetter) as {
      data: Array<{ home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string }> | null;
    };

  if (!groupFixtures || groupFixtures.length === 0) return null;

  type Tally = { played: number; won: number; drawn: number; lost: number; gf: number; ga: number; points: number };
  const table = new Map<string, Tally>();
  const ensure = (t: string): Tally => {
    let row = table.get(t);
    if (!row) { row = { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }; table.set(t, row); }
    return row;
  };

  for (const f of groupFixtures) {
    ensure(f.home_team);
    ensure(f.away_team);
    if (f.status === 'FINAL' && f.home_score !== null && f.away_score !== null) {
      const h = ensure(f.home_team);
      const a = ensure(f.away_team);
      h.played++; a.played++;
      h.gf += f.home_score; h.ga += f.away_score;
      a.gf += f.away_score; a.ga += f.home_score;
      if (f.home_score > f.away_score) { h.won++; h.points += 3; a.lost++; }
      else if (f.home_score < f.away_score) { a.won++; a.points += 3; h.lost++; }
      else { h.drawn++; a.drawn++; h.points++; a.points++; }
    }
  }

  const rows: GroupStandingRow[] = [...table.entries()].map(([name, s]) => ({
    teamName: name,
    played: s.played, won: s.won, drawn: s.drawn, lost: s.lost,
    goalsFor: s.gf, goalsAgainst: s.ga, goalDiff: s.gf - s.ga, points: s.points,
    isHome: name === fixture.home_team,
    isAway: name === fixture.away_team,
  }));

  rows.sort((a, b) =>
    b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName)
  );

  return { group: `Group ${groupLetter}`, rows };
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const service = createServiceRoleClient();

  const { data: fixture } = await service
    .from('fixture')
    .select('external_provider_id, home_team, away_team, group_name, round_id, starts_at, status')
    .eq('id', id)
    .maybeSingle() as {
      data: {
        external_provider_id: string | null;
        home_team: string; away_team: string;
        group_name: string | null; round_id: string;
        starts_at: string | null; status: string;
      } | null;
    };

  if (!fixture) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  // Always include team names even if no API data
  const base: PreMatchData = {
    homeTeam: fixture.home_team, awayTeam: fixture.away_team,
    predictions: null, standings: null, homeGoals: null, awayGoals: null,
    injuries: null, odds: null, topScorers: null, comparison: null,
  };

  const key = serverEnv.API_FOOTBALL_KEY;
  const extId = fixture.external_provider_id;
  const season = serverEnv.API_FOOTBALL_SEASON;

  if (!key || !extId) return NextResponse.json({ ok: true, ...base });

  // ── Check cache ───────────────────────────────────────────────────────────
  const fixtureStatus = fixture.status ?? 'SCHEDULED';

  // Pre-match context (odds/injuries) moves as kickoff nears, so tighten the cache
  // to 30 min once a match is within 3 hours of kickoff; stays 6h otherwise.
  const msToKickoff = fixture.starts_at ? new Date(fixture.starts_at).getTime() - Date.now() : Infinity;
  const preMatchTtl = (fixtureStatus === 'SCHEDULED' && msToKickoff > 0 && msToKickoff < 3 * 60 * 60 * 1000)
    ? 30 * 60 * 1000
    : undefined;

  // Standings are computed from our own results on every request (never cached),
  // so they reflect the latest scores even when the rest of pre-match is cached.
  const standings = await computeGroupStandings(service, fixture);

  const cachedPre = await getCached(id, 'pre_match', fixtureStatus as never, preMatchTtl);
  if (cachedPre) return NextResponse.json({ ok: true, ...base, ...cachedPre, standings });

  // Fire all API calls in parallel
  const [predRaw, injRaw, oddsRaw, scorersRaw] = await Promise.all([
    apiFetch(key, `/predictions?fixture=${extId}`),
    apiFetch(key, `/injuries?fixture=${extId}`),
    apiFetch(key, `/odds?fixture=${extId}&bookmaker=6`), // Bet365
    apiFetch(key, `/players/topscorers?league=1&season=${season}`),
  ]);

  // Phase 2: fetch last-5 team fixtures using IDs from predictions (needed for national team form)
  const pred = Array.isArray(predRaw) ? predRaw[0] : predRaw;
  const homeTeamId: number | null = pred?.teams?.home?.id ?? null;
  const awayTeamId: number | null = pred?.teams?.away?.id ?? null;
  const [homeFixRaw, awayFixRaw] = await Promise.all([
    homeTeamId ? apiFetch(key, `/fixtures?team=${homeTeamId}&last=5`) : Promise.resolve(null),
    awayTeamId ? apiFetch(key, `/fixtures?team=${awayTeamId}&last=5`) : Promise.resolve(null),
  ]);

  /** Build a W/D/L string (oldest → newest) from recent team fixtures */
  function buildForm(fixtures: unknown, teamId: number): string {
    if (!Array.isArray(fixtures)) return '';
    return fixtures
      .slice()
      .sort((a, b) =>
        new Date((a as { fixture: { date: string } }).fixture.date).getTime() -
        new Date((b as { fixture: { date: string } }).fixture.date).getTime()
      )
      .map((m: {
        teams: { home: { id: number; winner: boolean | null }; away: { id: number } };
      }) => {
        const isHome = m.teams.home.id === teamId;
        const homeWon = m.teams.home.winner;
        if (homeWon === null) return 'D';
        if (isHome) return homeWon ? 'W' : 'L';
        return homeWon ? 'L' : 'W';
      })
      .join('');
  }

  // ── Predictions ────────────────────────────────────────────────────────────
  let predictions: PreMatchPredictions | null = null;
  let homeGoals: TeamGoals | null = null;
  let awayGoals: TeamGoals | null = null;
  let comparison: StyleComparison | null = null;

  if (pred?.predictions) {
    const p = pred.predictions;
    // Prefer cross-competition recent form; fall back to league form if API provides it
    const homeForm = homeTeamId ? buildForm(homeFixRaw, homeTeamId) : (pred.teams?.home?.league?.form ?? '');
    const awayForm = awayTeamId ? buildForm(awayFixRaw, awayTeamId) : (pred.teams?.away?.league?.form ?? '');
    predictions = {
      homePercent: pct(p.percent?.home),
      drawPercent: pct(p.percent?.draw),
      awayPercent: pct(p.percent?.away),
      advice: p.advice ?? '',
      homeForm,
      awayForm,
    };
    const hg = pred.teams?.home?.last_5?.goals;
    const ag = pred.teams?.away?.last_5?.goals;
    if (hg) homeGoals = { avgFor: hg.for?.average ?? '0', avgAgainst: hg.against?.average ?? '0' };
    if (ag) awayGoals = { avgFor: ag.for?.average ?? '0', avgAgainst: ag.against?.average ?? '0' };
    const cmp = pred.comparison;
    if (cmp) {
      comparison = {
        form: { home: pct(cmp.form?.home), away: pct(cmp.form?.away) },
        att:  { home: pct(cmp.att?.home),  away: pct(cmp.att?.away)  },
        def:  { home: pct(cmp.def?.home),  away: pct(cmp.def?.away)  },
      };
    }
  }

  // ── Standings ──────────────────────────────────────────────────────────────
  // (computed above via computeGroupStandings — from our own results, always fresh)

  // ── Injuries ───────────────────────────────────────────────────────────────
  let injuries: PreMatchData['injuries'] = null;
  if (Array.isArray(injRaw) && injRaw.length) {
    const mapInj = (teamName: string): InjuryEntry[] =>
      injRaw
        .filter((i: { team: { name: string } }) => i.team.name === teamName)
        .map((i: { player: { name: string }; type: string; reason: string }) => ({
          playerName: i.player.name,
          type: i.type,
          reason: i.reason ?? '',
        }));
    injuries = { home: mapInj(fixture.home_team), away: mapInj(fixture.away_team) };
  }

  // ── Odds ───────────────────────────────────────────────────────────────────
  let odds: MatchOdds | null = null;
  if (Array.isArray(oddsRaw) && oddsRaw.length) {
    const bookmaker = oddsRaw[0]?.bookmakers?.[0];
    if (bookmaker) {
      const matchWinner = bookmaker.bets?.find((b: { name: string }) => b.name === 'Match Winner');
      if (matchWinner?.values) {
        const find = (label: string) =>
          matchWinner.values.find((v: { value: string }) => v.value === label)?.odd ?? '—';
        odds = {
          home: find('Home'), draw: find('Draw'), away: find('Away'),
          bookmaker: bookmaker.name ?? 'Bet365',
        };
      }
    }
  }

  // ── Top scorers ────────────────────────────────────────────────────────────
  let topScorers: TopScorer[] | null = null;
  if (Array.isArray(scorersRaw) && scorersRaw.length) {
    topScorers = scorersRaw.slice(0, 30).map((s: {
      player: { name: string };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      statistics: any[];
    }) => {
      const stats = s.statistics?.[0];
      return {
        playerName: s.player.name,
        teamName: stats?.team?.name ?? '',
        goals: stats?.goals?.total ?? 0,
        assists: stats?.goals?.assists ?? 0,
      };
    });
  }

  // Cache everything EXCEPT standings (standings stays fresh per-request).
  const payload = { predictions, standings: null, homeGoals, awayGoals, injuries, odds, topScorers, comparison };
  await setCached(id, 'pre_match', payload as unknown as Record<string, unknown>);
  return NextResponse.json({ ok: true, ...base, ...payload, standings } satisfies PreMatchData & { ok: boolean });
}
