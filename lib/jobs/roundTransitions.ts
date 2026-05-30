import { createServiceRoleClient } from '@/lib/supabase/service';
import { runRoundSettlement } from '@/lib/jobs/settleRound';
import { createNotificationEvents } from '@/lib/notifications';

interface RoundRow {
  id: string;
  stage: string;
  order_index: number;
  tournament_id: string;
  is_complete: boolean;
}

interface RoundTransitionSummary {
  checkedRounds: number;
  completedRoundIds: string[];
}

export async function runRoundTransitions(input?: {
  tournamentId?: string;
}): Promise<RoundTransitionSummary> {
  const service = createServiceRoleClient();

  let roundQuery = service
    .from('round')
    .select('id, stage, order_index, tournament_id, is_complete')
    .eq('is_complete', false)
    .order('tournament_id', { ascending: true })
    .order('order_index', { ascending: true });

  if (input?.tournamentId) {
    roundQuery = roundQuery.eq('tournament_id', input.tournamentId);
  }

  const { data: rounds, error: roundError } = await roundQuery as {
    data: RoundRow[] | null;
    error: { message: string } | null;
  };

  if (roundError) {
    throw new Error(`Failed to list candidate rounds: ${roundError.message}`);
  }

  const completedRoundIds: string[] = [];

  for (const round of rounds ?? []) {
    const { count: totalFixtures, error: totalError } = await service
      .from('fixture')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', round.id);

    if (totalError) {
      throw new Error(`Failed to count fixtures for round ${round.id}: ${totalError.message}`);
    }

    if (!totalFixtures || totalFixtures === 0) {
      continue;
    }

    const { count: finalFixtures, error: finalError } = await service
      .from('fixture')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', round.id)
      .eq('status', 'FINAL');

    if (finalError) {
      throw new Error(`Failed to count final fixtures for round ${round.id}: ${finalError.message}`);
    }

    if (finalFixtures !== totalFixtures) {
      continue;
    }

    const { error: updateError } = await service
      .from('round')
      .update({
        is_complete: true,
        ends_at: new Date().toISOString()
      })
      .eq('id', round.id)
      .eq('is_complete', false);

    if (updateError) {
      throw new Error(`Failed to complete round ${round.id}: ${updateError.message}`);
    }

    completedRoundIds.push(round.id);

    await applyMissedPickDefaults(service, round.id);
    await runRoundSettlement({ roundId: round.id });

    // Notify all matchup participants that results are in — fire-and-forget
    notifyResultsSettled(service, round.id, round.tournament_id, round.stage).catch(() => {});
  }

  return {
    checkedRounds: (rounds ?? []).length,
    completedRoundIds
  };
}

// For any fixture where the first picker never submitted, materialise their default
// pick and auto-assign the opponent the opposite side before settlement runs.
async function applyMissedPickDefaults(
  service: ReturnType<typeof createServiceRoleClient>,
  roundId: string
) {
  // Load all fixtures in the round
  const { data: fixtures } = await service
    .from('fixture')
    .select('id, round_id')
    .eq('round_id', roundId) as { data: Array<{ id: string; round_id: string }> | null };

  if (!fixtures || fixtures.length === 0) return;
  const fixtureIds = fixtures.map((f) => f.id);

  // Load all pick_order_assignments for these fixtures
  const { data: assignments } = await service
    .from('pick_order_assignment')
    .select('fixture_id, matchup_id, first_picker_participant_id')
    .in('fixture_id', fixtureIds) as {
    data: Array<{ fixture_id: string; matchup_id: string; first_picker_participant_id: string }> | null;
  };

  if (!assignments || assignments.length === 0) return;

  // Load all existing picks for these fixtures
  const { data: existingPicks } = await service
    .from('pick')
    .select('fixture_id, participant_id, side')
    .in('fixture_id', fixtureIds) as {
    data: Array<{ fixture_id: string; participant_id: string; side: string }> | null;
  };

  const pickedSet = new Set(
    (existingPicks ?? []).map((p) => `${p.fixture_id}:${p.participant_id}`)
  );

  const now = new Date().toISOString();
  const rowsToInsert: Array<{
    matchup_id: string;
    round_id: string;
    fixture_id: string;
    participant_id: string;
    side: string;
    submitted_at: string;
    locked_at: string;
  }> = [];

  for (const assignment of assignments) {
    const firstPickerId = assignment.first_picker_participant_id;
    const fixtureId = assignment.fixture_id;
    const matchupId = assignment.matchup_id;

    // Skip if first picker already has a pick
    if (pickedSet.has(`${fixtureId}:${firstPickerId}`)) continue;

    // Load first picker's default_pick_side from app_user via matchup_participant
    const { data: participantRow } = await service
      .from('matchup_participant')
      .select('user_id, app_user:user_id(default_pick_side)')
      .eq('id', firstPickerId)
      .maybeSingle() as {
      data: { user_id: string; app_user: { default_pick_side: string } | null } | null;
    };

    const defaultSide = participantRow?.app_user?.default_pick_side ?? 'HOME';
    const oppositeSide = defaultSide === 'HOME' ? 'AWAY' : 'HOME';

    // Find opponent participant
    const { data: allParticipants } = await service
      .from('matchup_participant')
      .select('id')
      .eq('matchup_id', matchupId) as { data: Array<{ id: string }> | null };

    const opponent = (allParticipants ?? []).find((p) => p.id !== firstPickerId);
    if (!opponent) continue;

    rowsToInsert.push({
      matchup_id: matchupId,
      round_id: roundId,
      fixture_id: fixtureId,
      participant_id: firstPickerId,
      side: defaultSide,
      submitted_at: now,
      locked_at: now
    });

    // Auto-assign opponent only if they also have no pick
    if (!pickedSet.has(`${fixtureId}:${opponent.id}`)) {
      rowsToInsert.push({
        matchup_id: matchupId,
        round_id: roundId,
        fixture_id: fixtureId,
        participant_id: opponent.id,
        side: oppositeSide,
        submitted_at: now,
        locked_at: now
      });
    }
  }

  if (rowsToInsert.length > 0) {
    await service
      .from('pick')
      .upsert(rowsToInsert, { onConflict: 'fixture_id,participant_id' });
  }
}

async function notifyResultsSettled(
  service: ReturnType<typeof createServiceRoleClient>,
  roundId: string,
  tournamentId: string,
  stage: string
) {
  const { data: participants } = await service
    .from('matchup_participant')
    .select('user_id, matchup:matchup_id(tournament_id)')
    .eq('matchup.tournament_id', tournamentId) as {
    data: Array<{ user_id: string; matchup: { tournament_id: string } | null }> | null;
  };

  const userIds = [...new Set(
    (participants ?? [])
      .filter((p) => p.matchup !== null)
      .map((p) => p.user_id)
  )];

  if (!userIds.length) return;

  const stageLabel = stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  await createNotificationEvents(
    userIds.map((userId) => ({
      userId,
      eventType: 'RESULTS_SETTLED' as const,
      payload: {
        title: 'Results are in!',
        body: `${stageLabel} results are settled — open the app to see your score.`,
        url: '/play',
        tag: `results-settled-${roundId}`,
      },
    }))
  );
}
