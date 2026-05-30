import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getMatchupStanding, getRoundResultsForMatchup } from '@/lib/supabase/standings';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { id: matchupId } = await params;
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

    const [standing, roundResults] = await Promise.all([
      getMatchupStanding(matchupId),
      getRoundResultsForMatchup(matchupId)
    ]);

    return NextResponse.json({ ok: true, standing, roundResults });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load standings.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
