import { randomBytes } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { MatchupRow, MatchupParticipantRow, TournamentRow } from '@/lib/supabase/types';
import { initializeFirstRoundPickOrder } from '@/lib/supabase/pickOrder';

function buildInviteCode(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += alphabet[bytes[index] % alphabet.length];
  }

  return code;
}

export async function resolveTournamentId(preferredYear?: number): Promise<string> {
  const service = createServiceRoleClient();

  if (preferredYear) {
    const { data, error } = await service
      .from('tournament')
      .select('id, year, is_active')
      .eq('year', preferredYear)
      .maybeSingle<TournamentRow>();

    if (error) {
      throw new Error(`Failed to fetch tournament by year: ${error.message}`);
    }

    if (data) {
      return data.id;
    }

    throw new Error(`Tournament year ${preferredYear} was not found.`);
  }

  const { data: active, error: activeError } = await service
    .from('tournament')
    .select('id, year, is_active')
    .eq('is_active', true)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle<TournamentRow>();

  if (activeError) {
    throw new Error(`Failed to fetch active tournament: ${activeError.message}`);
  }

  if (active) {
    return active.id;
  }

  const { data: latest, error: latestError } = await service
    .from('tournament')
    .select('id, year, is_active')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle<TournamentRow>();

  if (latestError) {
    throw new Error(`Failed to fetch latest tournament: ${latestError.message}`);
  }

  if (!latest) {
    throw new Error('No tournaments exist. Seed a tournament first.');
  }

  return latest.id;
}

export async function createMatchupWithInvite(input: {
  tournamentId: string;
  createdByAppUserId: string;
}): Promise<MatchupRow> {
  const service = createServiceRoleClient();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = buildInviteCode();

    const { data: matchup, error: matchupError } = await service
      .from('matchup')
      .insert({
        tournament_id: input.tournamentId,
        invite_code: inviteCode,
        created_by: input.createdByAppUserId
      })
      .select('id, tournament_id, invite_code, status, created_by, created_at')
      .maybeSingle<MatchupRow>();

    if (matchupError) {
      if (matchupError.code === '23505') {
        continue;
      }

      throw new Error(`Failed to create matchup: ${matchupError.message}`);
    }

    if (!matchup) {
      throw new Error('Matchup insert returned no row.');
    }

    const { error: participantError } = await service.from('matchup_participant').insert({
      matchup_id: matchup.id,
      user_id: input.createdByAppUserId
    });

    if (!participantError) {
      return matchup;
    }

    await service.from('matchup').delete().eq('id', matchup.id);
    throw new Error(`Failed to add creator as participant: ${participantError.message}`);
  }

  throw new Error('Unable to create unique invite code after retries.');
}

export interface AcceptInviteResult {
  matchupId: string;
  alreadyJoined: boolean;
}

export type AcceptInviteError =
  | { error: 'not_found' }
  | { error: 'not_active' }
  | { error: 'full' };

export async function acceptMatchupInvite(
  rawInviteCode: string,
  appUserId: string
): Promise<AcceptInviteResult | AcceptInviteError> {
  const service = createServiceRoleClient();
  const inviteCode = rawInviteCode.trim().toUpperCase();

  const { data: matchup } = await service
    .from('matchup')
    .select('id, tournament_id, invite_code, status, created_by, created_at')
    .eq('invite_code', inviteCode)
    .maybeSingle<MatchupRow>();

  if (!matchup) return { error: 'not_found' };
  if (matchup.status !== 'ACTIVE') return { error: 'not_active' };

  const { count: existingCount } = await service
    .from('matchup_participant')
    .select('id', { count: 'exact', head: true })
    .eq('matchup_id', matchup.id)
    .eq('user_id', appUserId);

  if ((existingCount ?? 0) > 0) {
    return { matchupId: matchup.id, alreadyJoined: true };
  }

  const { count: totalCount } = await service
    .from('matchup_participant')
    .select('id', { count: 'exact', head: true })
    .eq('matchup_id', matchup.id);

  if ((totalCount ?? 0) >= 2) return { error: 'full' };

  const { data: newParticipant, error: joinError } = await service
    .from('matchup_participant')
    .insert({ matchup_id: matchup.id, user_id: appUserId })
    .select('id')
    .single<Pick<MatchupParticipantRow, 'id'>>();

  if (joinError) throw new Error(`Failed to join matchup: ${joinError.message}`);

  const { data: creatorParticipant } = await service
    .from('matchup_participant')
    .select('id')
    .eq('matchup_id', matchup.id)
    .eq('user_id', matchup.created_by)
    .maybeSingle<Pick<MatchupParticipantRow, 'id'>>();

  if (newParticipant && creatorParticipant) {
    await initializeFirstRoundPickOrder({
      matchupId: matchup.id,
      tournamentId: matchup.tournament_id,
      joinerParticipantId: newParticipant.id,
      creatorParticipantId: creatorParticipant.id
    });
  }

  return { matchupId: matchup.id, alreadyJoined: false };
}
