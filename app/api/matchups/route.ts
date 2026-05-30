import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

interface MatchupListItem {
  matchupId: string;
  inviteCode: string;
  status: string;
  tournamentId: string;
  createdAt: string;
  joinedAt: string;
  isCreator: boolean;
  opponentDisplayName: string | null;
  opponentEmail: string | null;
  opponentAvatarUrl: string | null;
}

export async function GET() {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const service = createServiceRoleClient();

    // Step 1: get the current user's matchup memberships + matchup metadata
    const { data, error } = await service
      .from('matchup_participant')
      .select(
        `
        joined_at,
        matchup:matchup_id (
          id,
          invite_code,
          status,
          tournament_id,
          created_at,
          created_by
        )
      `
      )
      .eq('user_id', appUser.id)
      .order('joined_at', { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = data ?? [];

    // Collect matchup IDs so we can batch-fetch opponent info
    const matchupIds = rows
      .map((row) => {
        const matchup = Array.isArray(row.matchup) ? row.matchup[0] : row.matchup;
        return matchup?.id as string | undefined;
      })
      .filter((id): id is string => Boolean(id));

    // Step 2: fetch the other participant (not the current user) for each matchup
    const opponentMap = new Map<string, { displayName: string | null; email: string; avatarUrl: string | null }>();

    if (matchupIds.length > 0) {
      const { data: opponents, error: opponentError } = await service
        .from('matchup_participant')
        .select(
          `
          matchup_id,
          app_user:user_id (
            display_name,
            email,
            avatar_url
          )
        `
        )
        .in('matchup_id', matchupIds)
        .neq('user_id', appUser.id);

      if (!opponentError) {
        for (const row of opponents ?? []) {
          const appUserData = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
          if (appUserData) {
            opponentMap.set(row.matchup_id as string, {
              displayName: (appUserData.display_name as string | null) ?? null,
              email: (appUserData.email as string) ?? '',
              avatarUrl: (appUserData.avatar_url as string | null) ?? null
            });
          }
        }
      }
    }

    // Step 3: assemble the response
    const matchups: MatchupListItem[] = rows
      .map((row) => {
        const matchup = Array.isArray(row.matchup) ? row.matchup[0] : row.matchup;
        if (!matchup) return null;

        const matchupId = matchup.id as string;
        const opponent = opponentMap.get(matchupId) ?? null;

        return {
          matchupId,
          inviteCode: matchup.invite_code as string,
          status: matchup.status as string,
          tournamentId: matchup.tournament_id as string,
          createdAt: matchup.created_at as string,
          joinedAt: row.joined_at as string,
          isCreator: (matchup.created_by as string) === appUser.id,
          opponentDisplayName: opponent?.displayName ?? null,
          opponentEmail: opponent?.email ?? null,
          opponentAvatarUrl: opponent?.avatarUrl ?? null
        };
      })
      .filter((item): item is MatchupListItem => item !== null);

    return NextResponse.json({ ok: true, matchups });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list matchups.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
