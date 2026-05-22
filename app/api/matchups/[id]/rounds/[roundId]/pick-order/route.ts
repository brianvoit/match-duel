import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';
import { getPickOrderForRound } from '@/lib/supabase/pickOrder';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; roundId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: matchupId, roundId } = await params;
    const appUser = await ensureAppUser(user);
    const service = createServiceRoleClient();

    const { data: participant, error: participantError } = await service
      .from('matchup_participant')
      .select('id')
      .eq('matchup_id', matchupId)
      .eq('user_id', appUser.id)
      .maybeSingle();

    if (participantError) {
      return NextResponse.json({ ok: false, error: participantError.message }, { status: 500 });
    }

    if (!participant) {
      return NextResponse.json(
        { ok: false, error: 'You are not a participant in this matchup.' },
        { status: 403 }
      );
    }

    const pickOrder = await getPickOrderForRound(matchupId, roundId);

    return NextResponse.json({ ok: true, pickOrder, myParticipantId: participant.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load pick order.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
