import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { evaluatePick, WORLD_CUP_2026_SCORING } from '@/lib/domain/scoring';
import { getScoringConfigForTournament } from '@/lib/supabase/scoring';
import type { StageName } from '@/lib/domain/types';

/**
 * Live duel tally for every matchup the authenticated user is in, in a single
 * call. "Live" = points from ALL finished fixtures (settled rounds + in-progress
 * round), so the numbers match the top scorebug (settled standing + provisional)
 * rather than the settled-only `matchup_standing` table.
 *
 * Returns: { ok, tallies: { [matchupId]: { mine, opp } } }
 */
export async function GET() {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const service = createServiceRoleClient();

  // Matchups I'm in
  const { data: mineRows } = await service
    .from('matchup_participant')
    .select('matchup_id')
    .eq('user_id', appUser.id) as { data: { matchup_id: string }[] | null };
  const matchupIds = [...new Set((mineRows ?? []).map(m => m.matchup_id))];
  if (matchupIds.length === 0) return NextResponse.json({ ok: true, tallies: {} });

  // Every participant of those matchups (to map participant → me/opponent)
  const { data: parts } = await service
    .from('matchup_participant')
    .select('id, user_id, matchup_id')
    .in('matchup_id', matchupIds) as {
      data: { id: string; user_id: string; matchup_id: string }[] | null;
    };

  // Every pick across those matchups. PostgREST caps a single response at 1000
  // rows, and a user in several matchups can easily exceed that (e.g. 6 matchups
  // × ~200 picks) — so page through the full set. Missing the tail silently drops
  // the most-recently-added (knockout) picks and freezes the tally in the past.
  type PickRow = { participant_id: string; fixture_id: string; side: 'HOME' | 'AWAY' };
  const picks: PickRow[] = [];
  const PICK_PAGE = 1000;
  for (let from = 0; from < 100_000; from += PICK_PAGE) {
    const { data, error } = await service
      .from('pick')
      .select('participant_id, fixture_id, side')
      .in('matchup_id', matchupIds)
      .range(from, from + PICK_PAGE - 1) as { data: PickRow[] | null; error: unknown };
    if (error) break;
    const rows = data ?? [];
    picks.push(...rows);
    if (rows.length < PICK_PAGE) break;
  }

  // Finished fixtures referenced by those picks, plus their stage
  const fixtureIds = [...new Set((picks ?? []).map(p => p.fixture_id))];
  const { data: fixtures } = fixtureIds.length
    ? await service
        .from('fixture')
        .select('id, home_score, away_score, home_pen_score, away_pen_score, status, round_id')
        .in('id', fixtureIds)
        .eq('status', 'FINAL') as {
          data: { id: string; home_score: number | null; away_score: number | null; home_pen_score: number | null; away_pen_score: number | null; status: string; round_id: string }[] | null;
        }
    : { data: [] };

  const roundIds = [...new Set((fixtures ?? []).map(f => f.round_id))];
  const { data: rounds } = roundIds.length
    ? await service.from('round').select('id, stage').in('id', roundIds) as {
        data: { id: string; stage: string }[] | null;
      }
    : { data: [] };

  const stageByRound = new Map((rounds ?? []).map(r => [r.id, r.stage]));
  const fixtureById = new Map((fixtures ?? []).map(f => [f.id, f]));

  // Scoring can differ per tournament — resolve each matchup's tournament and its
  // scoring config so provisional tallies match how that round actually settles
  // (both go through getScoringConfigForTournament; men's default is the fallback).
  const { data: matchupRows } = await service
    .from('matchup').select('id, tournament_id').in('id', matchupIds) as {
      data: { id: string; tournament_id: string }[] | null;
    };
  const tournamentByMatchup = new Map((matchupRows ?? []).map(m => [m.id, m.tournament_id]));
  const matchupByParticipant = new Map((parts ?? []).map(p => [p.id, p.matchup_id]));
  const uniqueTournamentIds = [...new Set((matchupRows ?? []).map(m => m.tournament_id))];
  const configByTournament = new Map(
    await Promise.all(
      uniqueTournamentIds.map(async (tid) => [tid, await getScoringConfigForTournament(tid)] as const)
    )
  );

  // Points per participant across all their finished picks
  const pointsByParticipant = new Map<string, number>();
  for (const pk of picks ?? []) {
    const f = fixtureById.get(pk.fixture_id);
    if (!f) continue;
    const stage = stageByRound.get(f.round_id) as StageName | undefined;
    if (!stage) continue;
    const mid = matchupByParticipant.get(pk.participant_id);
    const config = (mid ? configByTournament.get(tournamentByMatchup.get(mid) ?? '') : undefined) ?? WORLD_CUP_2026_SCORING;
    const pts = evaluatePick({
      fixture: {
        homeGoals: f.home_score ?? 0,
        awayGoals: f.away_score ?? 0,
        homePenalty: f.home_pen_score,
        awayPenalty: f.away_pen_score,
        status: 'FINAL',
      },
      pickedTeamSide: pk.side,
      stage,
      scoringConfig: config,
    });
    pointsByParticipant.set(pk.participant_id, (pointsByParticipant.get(pk.participant_id) ?? 0) + pts);
  }

  // Assemble mine vs opp per matchup
  const partsByMatchup = new Map<string, { id: string; user_id: string }[]>();
  for (const p of parts ?? []) {
    if (!partsByMatchup.has(p.matchup_id)) partsByMatchup.set(p.matchup_id, []);
    partsByMatchup.get(p.matchup_id)!.push(p);
  }

  const tallies: Record<string, { mine: number; opp: number }> = {};
  for (const mid of matchupIds) {
    const ps = partsByMatchup.get(mid) ?? [];
    const meP = ps.find(p => p.user_id === appUser.id);
    const oppP = ps.find(p => p.user_id !== appUser.id);
    tallies[mid] = {
      mine: meP ? (pointsByParticipant.get(meP.id) ?? 0) : 0,
      opp: oppP ? (pointsByParticipant.get(oppP.id) ?? 0) : 0,
    };
  }

  return NextResponse.json({ ok: true, tallies });
}
