import { createServiceRoleClient } from '@/lib/supabase/service';
import { isPickLocked } from '@/lib/domain/lock';

export type PickSide = 'HOME' | 'AWAY';

export interface BulkPickInput {
  matchupId: string;
  roundId: string;
  appUserId: string;
  picks: Array<{
    fixtureId: string;
    side: PickSide;
  }>;
}

interface MatchupRow {
  id: string;
  tournament_id: string;
  status: string;
}

interface ParticipantRow {
  id: string;
  matchup_id: string;
  user_id: string;
}

interface RoundRow {
  id: string;
  tournament_id: string;
  order_index: number;
  is_complete: boolean;
}

interface FixtureRow {
  id: string;
  starts_at: string;
}

interface ExistingPickRow {
  id: string;
  fixture_id: string;
  locked_at: string | null;
}

export class BulkPickError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function bulkUpsertRoundPicks(input: BulkPickInput) {
  const service = createServiceRoleClient();

  const { data: matchup, error: matchupError } = await service
    .from('matchup')
    .select('id, tournament_id, status')
    .eq('id', input.matchupId)
    .maybeSingle<MatchupRow>();

  if (matchupError) {
    throw new BulkPickError(matchupError.message, 500);
  }

  if (!matchup) {
    throw new BulkPickError('Matchup not found.', 404);
  }

  if (matchup.status !== 'ACTIVE') {
    throw new BulkPickError('Matchup is not active.', 409);
  }

  const { data: participant, error: participantError } = await service
    .from('matchup_participant')
    .select('id, matchup_id, user_id')
    .eq('matchup_id', input.matchupId)
    .eq('user_id', input.appUserId)
    .maybeSingle<ParticipantRow>();

  if (participantError) {
    throw new BulkPickError(participantError.message, 500);
  }

  if (!participant) {
    throw new BulkPickError('User is not a participant in this matchup.', 403);
  }

  const { data: round, error: roundError } = await service
    .from('round')
    .select('id, tournament_id, order_index, is_complete')
    .eq('id', input.roundId)
    .maybeSingle<RoundRow>();

  if (roundError) {
    throw new BulkPickError(roundError.message, 500);
  }

  if (!round) {
    throw new BulkPickError('Round not found.', 404);
  }

  if (round.tournament_id !== matchup.tournament_id) {
    throw new BulkPickError('Round does not belong to matchup tournament.', 400);
  }

  if (round.is_complete) {
    throw new BulkPickError('Round is already complete; picks are closed.', 409);
  }

  const { count: incompletePriorRoundCount, error: priorRoundError } = await service
    .from('round')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', round.tournament_id)
    .lt('order_index', round.order_index)
    .eq('is_complete', false);

  if (priorRoundError) {
    throw new BulkPickError(priorRoundError.message, 500);
  }

  if ((incompletePriorRoundCount ?? 0) > 0) {
    throw new BulkPickError('Round is gated until all earlier rounds are complete.', 409);
  }

  const fixtureIds = [...new Set(input.picks.map((pick) => pick.fixtureId))];
  const { data: fixtures, error: fixtureError } = await service
    .from('fixture')
    .select('id, starts_at')
    .eq('round_id', round.id)
    .in('id', fixtureIds);

  if (fixtureError) {
    throw new BulkPickError(fixtureError.message, 500);
  }

  const typedFixtures = (fixtures ?? []) as FixtureRow[];

  if (typedFixtures.length !== fixtureIds.length) {
    throw new BulkPickError('One or more fixtures are invalid for this round.', 400);
  }

  const fixtureById = new Map(typedFixtures.map((fixture) => [fixture.id, fixture]));
  const now = new Date();
  const lockedFixtureIds: string[] = [];

  for (const fixtureId of fixtureIds) {
    const fixture = fixtureById.get(fixtureId);

    if (!fixture) {
      lockedFixtureIds.push(fixtureId);
      continue;
    }

    if (isPickLocked(fixture.starts_at, now)) {
      lockedFixtureIds.push(fixtureId);
    }
  }

  if (lockedFixtureIds.length > 0) {
    throw new BulkPickError(
      `Picks are locked for fixture(s): ${lockedFixtureIds.join(', ')}`,
      409
    );
  }

  const { data: existingPicks, error: existingError } = await service
    .from('pick')
    .select('id, fixture_id, locked_at')
    .eq('matchup_id', input.matchupId)
    .eq('round_id', input.roundId)
    .eq('participant_id', participant.id)
    .in('fixture_id', fixtureIds);

  if (existingError) {
    throw new BulkPickError(existingError.message, 500);
  }

  const immutableExisting = ((existingPicks ?? []) as ExistingPickRow[])
    .filter((pick) => pick.locked_at !== null)
    .map((pick) => pick.fixture_id);

  if (immutableExisting.length > 0) {
    throw new BulkPickError(
      `Existing picks are immutable for fixture(s): ${immutableExisting.join(', ')}`,
      409
    );
  }

  // Load pick order assignments for all submitted fixtures
  const { data: assignments, error: assignmentError } = await service
    .from('pick_order_assignment')
    .select('fixture_id, first_picker_participant_id')
    .eq('matchup_id', input.matchupId)
    .in('fixture_id', fixtureIds);

  if (assignmentError) {
    throw new BulkPickError(assignmentError.message, 500);
  }

  const assignmentMap = new Map(
    (assignments ?? []).map((a) => [a.fixture_id, a.first_picker_participant_id])
  );

  // If pick order is assigned, reject second-picker manual submissions
  for (const pick of input.picks) {
    const firstPickerId = assignmentMap.get(pick.fixtureId);
    if (firstPickerId && firstPickerId !== participant.id) {
      throw new BulkPickError(
        `Your pick for fixture ${pick.fixtureId} is auto-assigned based on your opponent's choice.`,
        409
      );
    }
  }

  // Find the opponent participant (for auto-assignment)
  const { data: allParticipants, error: allParticipantsError } = await service
    .from('matchup_participant')
    .select('id, user_id')
    .eq('matchup_id', input.matchupId);

  if (allParticipantsError) {
    throw new BulkPickError(allParticipantsError.message, 500);
  }

  const opponent = (allParticipants ?? []).find((p) => p.id !== participant.id) ?? null;

  const submittedAt = new Date().toISOString();
  const rows = input.picks.map((pick) => ({
    matchup_id: input.matchupId,
    round_id: input.roundId,
    fixture_id: pick.fixtureId,
    participant_id: participant.id,
    side: pick.side,
    submitted_at: submittedAt,
    locked_at: null
  }));

  const { data: upserted, error: upsertError } = await service
    .from('pick')
    .upsert(rows, { onConflict: 'fixture_id,participant_id' })
    .select('id, fixture_id, side, submitted_at');

  if (upsertError) {
    throw new BulkPickError(upsertError.message, 500);
  }

  // Auto-assign opponent's pick (opposite side) for fixtures where pick order is assigned
  if (opponent) {
    const oppositeRows = input.picks
      .filter((pick) => assignmentMap.has(pick.fixtureId))
      .map((pick) => ({
        matchup_id: input.matchupId,
        round_id: input.roundId,
        fixture_id: pick.fixtureId,
        participant_id: opponent.id,
        side: (pick.side === 'HOME' ? 'AWAY' : 'HOME') as PickSide,
        submitted_at: submittedAt,
        locked_at: null
      }));

    if (oppositeRows.length > 0) {
      const { error: oppUpsertError } = await service
        .from('pick')
        .upsert(oppositeRows, { onConflict: 'fixture_id,participant_id' });

      if (oppUpsertError) {
        throw new BulkPickError(
          `Failed to auto-assign opponent pick: ${oppUpsertError.message}`,
          500
        );
      }
    }
  }

  return {
    matchupId: input.matchupId,
    roundId: input.roundId,
    participantId: participant.id,
    picks: upserted ?? []
  };
}
