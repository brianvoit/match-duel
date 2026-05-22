import { createServiceRoleClient } from '@/lib/supabase/service';

export interface ParticipantStanding {
  participantId: string;
  appUserId: string;
  displayName: string | null;
  email: string;
  tournamentPoints: number;
  totalGoalsTiebreak: number;
}

export interface RoundResultEntry {
  roundId: string;
  stage: string;
  orderIndex: number;
  participants: Array<{
    participantId: string;
    displayName: string | null;
    email: string;
    points: number;
    tiebreakGoals: number;
  }>;
}

export async function getMatchupStanding(matchupId: string): Promise<ParticipantStanding[]> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from('matchup_standing')
    .select(
      `
      participant_id,
      tournament_points,
      total_goals_tiebreak,
      matchup_participant:participant_id (
        user_id,
        app_user:user_id (
          display_name,
          email
        )
      )
    `
    )
    .eq('matchup_id', matchupId)
    .order('tournament_points', { ascending: false });

  if (error) {
    throw new Error(`Failed to load matchup standing: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const participant = Array.isArray(row.matchup_participant)
      ? row.matchup_participant[0]
      : row.matchup_participant;
    const appUser = participant
      ? Array.isArray(participant.app_user)
        ? participant.app_user[0]
        : participant.app_user
      : null;

    return {
      participantId: row.participant_id as string,
      appUserId: (participant?.user_id as string) ?? '',
      displayName: (appUser?.display_name as string | null) ?? null,
      email: (appUser?.email as string) ?? '',
      tournamentPoints: row.tournament_points as number,
      totalGoalsTiebreak: row.total_goals_tiebreak as number
    };
  });
}

export async function getRoundResultsForMatchup(matchupId: string): Promise<RoundResultEntry[]> {
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from('round_result')
    .select(
      `
      round_id,
      participant_id,
      points,
      tiebreak_goals,
      round:round_id (
        stage,
        order_index
      ),
      matchup_participant:participant_id (
        app_user:user_id (
          display_name,
          email
        )
      )
    `
    )
    .eq('matchup_id', matchupId)
    .order('round(order_index)', { ascending: true });

  if (error) {
    throw new Error(`Failed to load round results: ${error.message}`);
  }

  const byRound = new Map<string, RoundResultEntry>();

  for (const row of data ?? []) {
    const roundId = row.round_id as string;
    const round = Array.isArray(row.round) ? row.round[0] : row.round;
    const participant = Array.isArray(row.matchup_participant)
      ? row.matchup_participant[0]
      : row.matchup_participant;
    const appUser = participant
      ? Array.isArray(participant.app_user)
        ? participant.app_user[0]
        : participant.app_user
      : null;

    if (!byRound.has(roundId)) {
      byRound.set(roundId, {
        roundId,
        stage: (round?.stage as string) ?? '',
        orderIndex: (round?.order_index as number) ?? 0,
        participants: []
      });
    }

    byRound.get(roundId)!.participants.push({
      participantId: row.participant_id as string,
      displayName: (appUser?.display_name as string | null) ?? null,
      email: (appUser?.email as string) ?? '',
      points: row.points as number,
      tiebreakGoals: row.tiebreak_goals as number
    });
  }

  return Array.from(byRound.values()).sort((a, b) => a.orderIndex - b.orderIndex);
}
