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

  // ── Check cache ───────────────────────────────────────────────────────────
  // Pre-match data: cache for 6 hours; skip cache if fixture is FINAL
  const fixtureStatus = (await (async () => {
    const { data } = await (createServiceRoleClient()).from('fixture').select('status').eq('id', id).maybeSingle() as { data: { status: string } | null };
    return data?.status ?? 'SCHEDULED';
  })());
  const cachedPre = await getCached(id, 'pre_match', fixtureStatus as never);
  if (cachedPre) return NextResponse.json({ ok: true, ...base, ...cachedPre });

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

  if (groupLetter) {
    // Try to find live standings from the API first
    let liveRows: GroupStandingRow[] | null = null;
    if (standRaw) {
      const allGroups: Array<{ group: string; all: unknown[] }> = Array.isArray(standRaw)
        ? standRaw.flat()
        : [];
      const targetGroup = allGroups.find(g =>
        g.group === `Group ${groupLetter}` || g.group === groupLetter
      );
      if (targetGroup) {
        liveRows = (targetGroup.all as Array<{
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
      }
    }

    if (liveRows && liveRows.length > 0) {
      // Sort: points desc → goal diff desc → alphabetical (so all-zero sorts A-Z)
      liveRows.sort((a, b) =>
        b.points - a.points || b.goalDiff - a.goalDiff || a.teamName.localeCompare(b.teamName)
      );
      standings = { group: `Group ${groupLetter}`, rows: liveRows };
    } else {
      // Build a zero-filled placeholder from our own DB (all teams in this group)
      const { data: groupFixtures } = await service
        .from('fixture')
        .select('home_team, away_team')
        .eq('round_id', fixture.round_id)
        .eq('group_name', groupLetter);

      const teamSet = new Set<string>();
      for (const f of (groupFixtures ?? [])) {
        teamSet.add(f.home_team);
        teamSet.add(f.away_team);
      }
      const placeholderRows: GroupStandingRow[] = [...teamSet]
        .sort()
        .map(name => ({
          teamName: name, played: 0, won: 0, drawn: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
          isHome: name === fixture.home_team,
          isAway: name === fixture.away_team,
        }));
      if (placeholderRows.length > 0) {
        standings = { group: `Group ${groupLetter}`, rows: placeholderRows };
      }
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

  const payload = { predictions, standings, homeGoals, awayGoals, injuries, odds, topScorers, comparison };
  await setCached(id, 'pre_match', payload as unknown as Record<string, unknown>);
  return NextResponse.json({ ok: true, ...base, ...payload } satisfies PreMatchData & { ok: boolean });
}
