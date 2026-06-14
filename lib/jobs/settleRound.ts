import { createServiceRoleClient } from '@/lib/supabase/service';
import { getScoringConfigForTournament } from '@/lib/supabase/scoring';
import { evaluatePick } from '@/lib/domain/scoring';
import { assignAlternatingFirstPicker } from '@/lib/domain/pickOrder';
import { StageName } from '@/lib/domain/types';

interface RoundRow {
  id: string;
  stage: string;
  tournament_id: string;
  is_complete: boolean;
}

interface FixtureRow {
  id: string;
  home_score: number | null;
  away_score: number | null;
  home_pen_score: number | null;
  away_pen_score: number | null;
  status: string;
}

interface ParticipantRow {
  id: string;
  user_id: string;
}

interface PickRow {
  fixture_id: string;
  side: 'HOME' | 'AWAY';
}

interface RoundResultRow {
  participant_id: string;
  points: number;
  tiebreak_goals: number;
}

export interface RoundSettlementSummary {
  settledMatchups: number;
  totalPicksEvaluated: number;
}

export async function runRoundSettlement(input: {
  roundId: string;
  matchupId?: string;
}): Promise<RoundSettlementSummary> {
  const service = createServiceRoleClient();

  const { data: round, error: roundError } = await service
    .from('round')
    .select('id, stage, tournament_id, is_complete')
    .eq('id', input.roundId)
    .maybeSingle<RoundRow>();

  if (roundError) {
    throw new Error(`Failed to load round: ${roundError.message}`);
  }

  if (!round) {
    throw new Error(`Round not found: ${input.roundId}`);
  }

  if (!round.is_complete) {
    throw new Error(`Round is not complete; cannot settle picks.`);
  }

  const { data: fixtures, error: fixtureError } = await service
    .from('fixture')
    .select('id, home_score, away_score, home_pen_score, away_pen_score, status')
    .eq('round_id', input.roundId)
    .eq('status', 'FINAL');

  if (fixtureError) {
    throw new Error(`Failed to load fixtures: ${fixtureError.message}`);
  }

  const finalFixtures = (fixtures ?? []) as FixtureRow[];
  const fixtureMap = new Map(finalFixtures.map((f) => [f.id, f]));

  const scoringConfig = await getScoringConfigForTournament(round.tournament_id);

  let matchupQuery = service
    .from('matchup')
    .select('id')
    .eq('tournament_id', round.tournament_id)
    .eq('status', 'ACTIVE');

  if (input.matchupId) {
    matchupQuery = matchupQuery.eq('id', input.matchupId);
  }

  const { data: matchups, error: matchupError } = await matchupQuery;

  if (matchupError) {
    throw new Error(`Failed to load matchups: ${matchupError.message}`);
  }

  let settledMatchups = 0;
  let totalPicksEvaluated = 0;

  for (const matchup of matchups ?? []) {
    const { data: participants, error: participantError } = await service
      .from('matchup_participant')
      .select('id, user_id')
      .eq('matchup_id', matchup.id);

    if (participantError) {
      throw new Error(`Failed to load participants for matchup ${matchup.id}: ${participantError.message}`);
    }

    const typedParticipants = (participants ?? []) as ParticipantRow[];

    if (typedParticipants.length < 2) {
      continue;
    }

    const roundResultRows = [];

    for (const participant of typedParticipants) {
      const { data: picks, error: picksError } = await service
        .from('pick')
        .select('fixture_id, side')
        .eq('matchup_id', matchup.id)
        .eq('round_id', input.roundId)
        .eq('participant_id', participant.id);

      if (picksError) {
        throw new Error(`Failed to load picks for participant ${participant.id}: ${picksError.message}`);
      }

      let points = 0;
      let tiebreakGoals = 0;

      for (const pick of (picks ?? []) as PickRow[]) {
        const fixture = fixtureMap.get(pick.fixture_id);
        if (!fixture) continue;

        points += evaluatePick({
          fixture: {
            homeGoals: fixture.home_score ?? 0,
            awayGoals: fixture.away_score ?? 0,
            homePenalty: fixture.home_pen_score,
            awayPenalty: fixture.away_pen_score,
            status: 'FINAL'
          },
          pickedTeamSide: pick.side,
          stage: round.stage as StageName,
          scoringConfig
        });

        // Tiebreak: goals scored by the team this participant picked
        tiebreakGoals +=
          pick.side === 'HOME'
            ? (fixture.home_score ?? 0)
            : (fixture.away_score ?? 0);

        totalPicksEvaluated++;
      }

      roundResultRows.push({
        matchup_id: matchup.id,
        round_id: input.roundId,
        participant_id: participant.id,
        points,
        tiebreak_goals: tiebreakGoals,
        settled_at: new Date().toISOString()
      });
    }

    const { error: resultUpsertError } = await service
      .from('round_result')
      .upsert(roundResultRows, { onConflict: 'matchup_id,round_id,participant_id' });

    if (resultUpsertError) {
      throw new Error(`Failed to upsert round_result for matchup ${matchup.id}: ${resultUpsertError.message}`);
    }

    const { data: allResults, error: allResultsError } = await service
      .from('round_result')
      .select('participant_id, points, tiebreak_goals')
      .eq('matchup_id', matchup.id);

    if (allResultsError) {
      throw new Error(`Failed to load round results for standing: ${allResultsError.message}`);
    }

    const standingByParticipant = new Map<string, { tournament_points: number; total_goals_tiebreak: number }>();

    for (const result of (allResults ?? []) as RoundResultRow[]) {
      const existing = standingByParticipant.get(result.participant_id) ?? {
        tournament_points: 0,
        total_goals_tiebreak: 0
      };
      standingByParticipant.set(result.participant_id, {
        tournament_points: existing.tournament_points + result.points,
        total_goals_tiebreak: existing.total_goals_tiebreak + result.tiebreak_goals
      });
    }

    const standingRows = Array.from(standingByParticipant.entries()).map(
      ([participant_id, totals]) => ({
        matchup_id: matchup.id,
        participant_id,
        tournament_points: totals.tournament_points,
        total_goals_tiebreak: totals.total_goals_tiebreak,
        updated_at: new Date().toISOString()
      })
    );

    const { error: standingUpsertError } = await service
      .from('matchup_standing')
      .upsert(standingRows, { onConflict: 'matchup_id,participant_id' });

    if (standingUpsertError) {
      throw new Error(`Failed to upsert matchup_standing for matchup ${matchup.id}: ${standingUpsertError.message}`);
    }

    await assignPickOrderForNextRound(service, matchup.id, round, typedParticipants);

    settledMatchups++;
  }

  return { settledMatchups, totalPicksEvaluated };
}

async function assignPickOrderForNextRound(
  service: ReturnType<typeof createServiceRoleClient>,
  matchupId: string,
  completedRound: RoundRow,
  participants: ParticipantRow[]
) {
  const { data: nextRound, error: nextRoundError } = await service
    .from('round')
    .select('id')
    .eq('tournament_id', completedRound.tournament_id)
    .eq('is_complete', false)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (nextRoundError || !nextRound) {
    return;
  }

  const { data: nextFixtures, error: nextFixtureError } = await service
    .from('fixture')
    .select('id')
    .eq('round_id', nextRound.id)
    .order('starts_at', { ascending: true }) as {
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  };

  if (nextFixtureError || !nextFixtures || nextFixtures.length === 0) {
    return;
  }

  const { data: currentStandings, error: standingError } = await service
    .from('matchup_standing')
    .select('participant_id, tournament_points, total_goals_tiebreak')
    .eq('matchup_id', matchupId) as {
    data: Array<{ participant_id: string; tournament_points: number; total_goals_tiebreak: number }> | null;
    error: { message: string } | null;
  };

  if (standingError || !currentStandings || currentStandings.length < 2) {
    return;
  }

  const { data: lastRoundResults, error: lastRoundError } = await service
    .from('round_result')
    .select('participant_id, points, tiebreak_goals')
    .eq('matchup_id', matchupId)
    .eq('round_id', completedRound.id) as {
    data: Array<{ participant_id: string; points: number; tiebreak_goals: number }> | null;
    error: { message: string } | null;
  };

  if (lastRoundError || !lastRoundResults || lastRoundResults.length < 2) {
    return;
  }

  // Determine who picked second in the completed round (first fixture's second picker)
  const { data: lastRoundPickOrder } = await service
    .from('pick_order_assignment')
    .select('first_picker_participant_id')
    .eq('matchup_id', matchupId)
    .eq('round_id', completedRound.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle() as { data: { first_picker_participant_id: string } | null };

  const firstPickerLastRound = lastRoundPickOrder?.first_picker_participant_id ?? null;

  const standingMap = new Map(currentStandings.map((s) => [s.participant_id, s]));
  const lastRoundMap = new Map(lastRoundResults.map((r) => [r.participant_id, r]));

  const participantIds = participants.map((p) => p.id);
  if (participantIds.length < 2) return;

  const [pA, pB] = participantIds;
  const standingA = standingMap.get(pA);
  const standingB = standingMap.get(pB);
  const lastA = lastRoundMap.get(pA);
  const lastB = lastRoundMap.get(pB);

  if (!standingA || !standingB || !lastA || !lastB) return;

  const assignments = assignAlternatingFirstPicker({
    previousStageStandings: [
      {
        participantId: pA,
        stagePoints: lastA.points,
        stageTiebreakGoals: lastA.tiebreak_goals,
        totalGoalsTiebreak: standingA.total_goals_tiebreak,
        tournamentPoints: standingA.tournament_points,
        pickedSecondPreviously: firstPickerLastRound !== null && firstPickerLastRound !== pA
      },
      {
        participantId: pB,
        stagePoints: lastB.points,
        stageTiebreakGoals: lastB.tiebreak_goals,
        totalGoalsTiebreak: standingB.total_goals_tiebreak,
        tournamentPoints: standingB.tournament_points,
        pickedSecondPreviously: firstPickerLastRound !== null && firstPickerLastRound !== pB
      }
    ],
    fixtureIdsChronological: nextFixtures.map((f) => f.id)
  });

  const rows = assignments.map((a) => ({
    matchup_id: matchupId,
    round_id: nextRound.id,
    fixture_id: a.fixtureId,
    first_picker_participant_id: a.firstPickerParticipantId
  }));

  await service
    .from('pick_order_assignment')
    .upsert(rows, { onConflict: 'matchup_id,fixture_id' });
}
