import { createServiceRoleClient } from '@/lib/supabase/service';
import { assignAlternatingFirstPicker } from '@/lib/domain/pickOrder';

export interface PickOrderEntry {
  fixtureId: string;
  firstPickerParticipantId: string;
}

export async function getPickOrderForRound(
  matchupId: string,
  roundId: string
): Promise<PickOrderEntry[]> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from('pick_order_assignment')
    .select('fixture_id, first_picker_participant_id')
    .eq('matchup_id', matchupId)
    .eq('round_id', roundId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load pick order: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    fixtureId: row.fixture_id as string,
    firstPickerParticipantId: row.first_picker_participant_id as string
  }));
}

/**
 * Called once when the second player joins a matchup.
 * Assigns alternating pick order for Round 1 fixtures, with the joiner picking first.
 */
export async function initializeFirstRoundPickOrder(input: {
  matchupId: string;
  tournamentId: string;
  joinerParticipantId: string;
  creatorParticipantId: string;
}): Promise<void> {
  const service = createServiceRoleClient();

  const { data: firstRound, error: roundError } = await service
    .from('round')
    .select('id')
    .eq('tournament_id', input.tournamentId)
    .eq('is_complete', false)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (roundError || !firstRound) {
    return;
  }

  const { data: fixtures, error: fixtureError } = await service
    .from('fixture')
    .select('id')
    .eq('round_id', firstRound.id)
    .order('starts_at', { ascending: true }) as {
    data: Array<{ id: string }> | null;
    error: { message: string } | null;
  };

  if (fixtureError || !fixtures || fixtures.length === 0) {
    return;
  }

  // Joiner picks first for fixture 0, alternates from there
  const assignments = assignAlternatingFirstPicker({
    previousStageStandings: [
      {
        participantId: input.joinerParticipantId,
        stagePoints: 0,
        stageTiebreakGoals: 0,
        tournamentPoints: 0
      },
      {
        participantId: input.creatorParticipantId,
        stagePoints: 1, // creator has higher points so joiner wins the sort (loser picks first)
        stageTiebreakGoals: 0,
        tournamentPoints: 1
      }
    ],
    fixtureIdsChronological: fixtures.map((f) => f.id)
  });

  const rows = assignments.map((a) => ({
    matchup_id: input.matchupId,
    round_id: firstRound.id,
    fixture_id: a.fixtureId,
    first_picker_participant_id: a.firstPickerParticipantId
  }));

  await service
    .from('pick_order_assignment')
    .upsert(rows, { onConflict: 'matchup_id,fixture_id' });
}
