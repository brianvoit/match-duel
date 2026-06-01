import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
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

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const service = createServiceRoleClient();

  const { data: fixture } = await service
    .from('fixture')
    .select('external_provider_id, home_team, away_team, group_name, round_id')
    .eq('id', id)
    .maybeSingle() as {
      data: {
        external_provider_id: string | null;
        home_team: string; away_team: string;
        group_name: string | null; round_id: string;
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

  // Fire all API calls in parallel
  const [predRaw, standRaw, injRaw, oddsRaw, scorersRaw] = await Promise.all([
    apiFetch(key, `/predictions?fixture=${extId}`),
    apiFetch(key, `/standings?league=1&season=${season}`),
    apiFetch(key, `/injuries?fixture=${extId}`),
    apiFetch(key, `/odds?fixture=${extId}&bookmaker=6`), // Bet365
    apiFetch(key, `/players/topscorers?league=1&season=${season}`),
  ]);

  // ── Predictions ────────────────────────────────────────────────────────────
  let predictions: PreMatchPredictions | null = null;
  let homeGoals: TeamGoals | null = null;
  let awayGoals: TeamGoals | null = null;
  let comparison: StyleComparison | null = null;

  const pred = Array.isArray(predRaw) ? predRaw[0] : predRaw;
  if (pred?.predictions) {
    const p = pred.predictions;
    predictions = {
      homePercent: pct(p.percent?.home),
      drawPercent: pct(p.percent?.draw),
      awayPercent: pct(p.percent?.away),
      advice: p.advice ?? '',
      homeForm: pred.teams?.home?.league?.form ?? '',
      awayForm: pred.teams?.away?.league?.form ?? '',
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
  let standings: PreMatchData['standings'] = null;
  const groupLetter = fixture.group_name; // "A", "B", etc.
  if (standRaw && groupLetter) {
    // API returns standings grouped per group; find the matching group
    const allGroups: Array<{ group: string; all: unknown[] }> = Array.isArray(standRaw)
      ? standRaw.flat()
      : [];
    const targetGroup = allGroups.find(g =>
      g.group === `Group ${groupLetter}` || g.group === groupLetter
    );
    if (targetGroup) {
      const rows: GroupStandingRow[] = (targetGroup.all as Array<{
        team: { name: string };
        all: { played: number; win: number; draw: number; lose: number };
        goals: { for: number; against: number };
        goalsDiff: number; points: number;
      }>).map(r => ({
        teamName: r.team.name,
        played: r.all.played, won: r.all.win, drawn: r.all.draw, lost: r.all.lose,
        goalsFor: r.goals.for, goalsAgainst: r.goals.against,
        goalDiff: r.goalsDiff, points: r.points,
        isHome: r.team.name === fixture.home_team,
        isAway: r.team.name === fixture.away_team,
      }));
      standings = { group: `Group ${groupLetter}`, rows };
    }
  }

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

  return NextResponse.json({
    ok: true,
    ...base,
    predictions, standings, homeGoals, awayGoals,
    injuries, odds, topScorers, comparison,
  } satisfies PreMatchData & { ok: boolean });
}
