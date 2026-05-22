import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';
import { acceptMatchupInvite } from '@/lib/supabase/matchups';

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
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const appUser = await ensureAppUser(user);
    const result = await acceptMatchupInvite(inviteCode, appUser.id);

    if ('error' in result) {
      const statusMap = { not_found: 404, not_active: 409, full: 409 } as const;
      const messages = {
        not_found: 'Invite not found.',
        not_active: 'Matchup is not active.',
        full: 'This head-to-head matchup already has two participants.'
      };
      return NextResponse.json(
        { ok: false, error: messages[result.error] },
        { status: statusMap[result.error] }
      );
    }

    return NextResponse.json({ ok: true, matchupId: result.matchupId, alreadyJoined: result.alreadyJoined });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept invite.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
