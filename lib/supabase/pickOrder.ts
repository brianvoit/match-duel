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
 * Find the round a newly-formed matchup should start picking in: the earliest
 * round whose fixtures are ALL still in the future. Before the tournament this
 * is the first round (group stage); once it's underway a late-joining matchup
 * starts at the next round that hasn't kicked off yet (e.g. Round of 32).
 */
async function findStartingRound(
  service: ReturnType<typeof createServiceRoleClient>,
  tournamentId: string,
): Promise<{ id: string } | null> {
  const { data: rounds } = await service
    .from('round')
    .select('id, order_index')
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true }) as {
      data: Array<{ id: string; order_index: number }> | null;
    };

  const nowMs = Date.now();
  for (const round of rounds ?? []) {
    const { data: firstFixture } = await service
      .from('fixture')
      .select('starts_at')
      .eq('round_id', round.id)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle<{ starts_at: string | null }>();
    // A round is "not started" iff its earliest fixture is still in the future.
    if (firstFixture?.starts_at && new Date(firstFixture.starts_at).getTime() > nowMs) {
      return { id: round.id };
    }
  }
  return null;
}

/**
 * The id of the round a new matchup would start in right now, or null if none is
 * available yet (e.g. mid-group-stage before the knockout bracket is scheduled).
 * Used to block forming a matchup until its starting round's fixtures exist.
 */
export async function getStartingRoundId(tournamentId: string): Promise<string | null> {
  const service = createServiceRoleClient();
  const round = await findStartingRound(service, tournamentId);
  return round?.id ?? null;
}

/**
 * Called once when the second player joins a matchup. Assigns alternating pick
 * order (joiner picks first) for the matchup's starting round — the next round
 * that hasn't kicked off yet, so matchups formed mid-tournament begin at the
 * upcoming round rather than retroactively at the group stage.
 */
export async function initializeFirstRoundPickOrder(input: {
  matchupId: string;
  tournamentId: string;
  joinerParticipantId: string;
  creatorParticipantId: string;
}): Promise<void> {
  const service = createServiceRoleClient();

  const firstRound = await findStartingRound(service, input.tournamentId);

  if (!firstRound) {
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

  // Joiner picks first for fixture 0 (stand-in for "loser of previous World Cup")
  const assignments = assignAlternatingFirstPicker({
    previousStageStandings: [
      {
        participantId: input.joinerParticipantId,
        stagePoints: 0,
        stageTiebreakGoals: 0,
        totalGoalsTiebreak: 0,
        tournamentPoints: 0,
        pickedSecondPreviously: false
      },
      {
        participantId: input.creatorParticipantId,
        stagePoints: 1, // creator has higher points so joiner wins the sort (loser picks first)
        stageTiebreakGoals: 0,
        totalGoalsTiebreak: 0,
        tournamentPoints: 1,
        pickedSecondPreviously: false
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
