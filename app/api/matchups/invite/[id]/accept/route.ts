import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { MatchupRow, MatchupParticipantRow } from '@/lib/supabase/types';
import { ensureAppUser } from '@/lib/supabase/user';
import { initializeFirstRoundPickOrder } from '@/lib/supabase/pickOrder';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const inviteCode = id.trim().toUpperCase();

  if (!inviteCode) {
    return NextResponse.json({ ok: false, error: 'Invite id is required.' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const appUser = await ensureAppUser(user);
    const service = createServiceRoleClient();

    const { data: matchup, error: matchupError } = await service
      .from('matchup')
      .select('id, tournament_id, invite_code, status, created_by, created_at')
      .eq('invite_code', inviteCode)
      .maybeSingle<MatchupRow>();

    if (matchupError) {
      return NextResponse.json({ ok: false, error: matchupError.message }, { status: 500 });
    }

    if (!matchup) {
      return NextResponse.json({ ok: false, error: 'Invite not found.' }, { status: 404 });
    }

    if (matchup.status !== 'ACTIVE') {
      return NextResponse.json({ ok: false, error: 'Matchup is not active.' }, { status: 409 });
    }

    const { data: existingMembership, error: memberReadError } = await service
      .from('matchup_participant')
      .select('id, matchup_id, user_id, joined_at')
      .eq('matchup_id', matchup.id)
      .eq('user_id', appUser.id)
      .maybeSingle<MatchupParticipantRow>();

    if (memberReadError) {
      return NextResponse.json({ ok: false, error: memberReadError.message }, { status: 500 });
    }

    if (existingMembership) {
      return NextResponse.json({ ok: true, matchupId: matchup.id, alreadyJoined: true });
    }

    const { count, error: countError } = await service
      .from('matchup_participant')
      .select('*', { count: 'exact', head: true })
      .eq('matchup_id', matchup.id);

    if (countError) {
      return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
    }

    if ((count ?? 0) >= 2) {
      return NextResponse.json(
        { ok: false, error: 'This head-to-head matchup already has two participants.' },
        { status: 409 }
      );
    }

    const { data: newParticipant, error: joinError } = await service
      .from('matchup_participant')
      .insert({ matchup_id: matchup.id, user_id: appUser.id })
      .select('id')
      .single();

    if (joinError) {
      return NextResponse.json({ ok: false, error: joinError.message }, { status: 500 });
    }

    // Resolve the creator's participant row so we can assign Round 1 pick order
    const { data: creatorParticipant } = await service
      .from('matchup_participant')
      .select('id')
      .eq('matchup_id', matchup.id)
      .eq('user_id', matchup.created_by)
      .maybeSingle<{ id: string }>();

    if (newParticipant && creatorParticipant) {
      await initializeFirstRoundPickOrder({
        matchupId: matchup.id,
        tournamentId: matchup.tournament_id,
        joinerParticipantId: newParticipant.id as string,
        creatorParticipantId: creatorParticipant.id
      });
    }

    return NextResponse.json({ ok: true, matchupId: matchup.id, alreadyJoined: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept invite.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
