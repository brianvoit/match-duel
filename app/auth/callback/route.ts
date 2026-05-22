import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';
import { acceptMatchupInvite } from '@/lib/supabase/matchups';
import { isAdminEmail, userHasAccess } from '@/lib/auth/access';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const inviteCode = requestUrl.searchParams.get('invite');

  if (!code) {
    return NextResponse.redirect(new URL('/?auth=missing_code', requestUrl.origin));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/?auth=failed', requestUrl.origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/?auth=failed', requestUrl.origin));
  }

  // Admins always get through
  if (isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL('/play', requestUrl.origin));
  }

  const appUser = await ensureAppUser(user);

  // If an invite code was passed through OAuth, accept the matchup
  if (inviteCode) {
    const result = await acceptMatchupInvite(inviteCode, appUser.id);
    // Accepted (or already joined) — they now have access
    if (!('error' in result)) {
      return NextResponse.redirect(new URL('/play', requestUrl.origin));
    }
    // Invalid/full invite — fall through to access check below
  }

  // Check if user is already a participant in any matchup
  const hasAccess = await userHasAccess(user.id);
  if (hasAccess) {
    return NextResponse.redirect(new URL('/play', requestUrl.origin));
  }

  // No invite, no existing access — bounce them
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/?error=no_access', requestUrl.origin));
}
