import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';
import { acceptMatchupInvite } from '@/lib/supabase/matchups';
import { isAdminEmail } from '@/lib/auth/access';
import { serverEnv } from '@/lib/supabase/env';

function hashCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
}

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
    const appUser = await ensureAppUser(user);
    if (inviteCode) {
      await acceptMatchupInvite(inviteCode, appUser.id);
    }
    return NextResponse.redirect(new URL('/play', requestUrl.origin));
  }

  // Check beta cookie
  const store = await cookies();
  const betaSession = store.get('beta_session')?.value;
  const betaCode = serverEnv.BETA_CODE;
  const validHash = betaCode ? hashCode(betaCode) : null;

  if (!validHash || betaSession !== validHash) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/?error=no_access', requestUrl.origin));
  }

  const appUser = await ensureAppUser(user);

  if (inviteCode) {
    await acceptMatchupInvite(inviteCode, appUser.id);
  }

  return NextResponse.redirect(new URL('/play', requestUrl.origin));
}
