import { redirect } from 'next/navigation';
import { Playground } from '@/app/components/playground';
import { getAuthenticatedUser } from '@/lib/supabase/get-user';

export const dynamic = 'force-dynamic';

export default async function PlayPage() {
  // getAuthenticatedUser() already handles the BYPASS_AUTH=true dev path
  // (looks up DEV_USER_EMAIL) as well as real OAuth — routing both through it
  // here keeps this page's identity in sync with what every API route sees,
  // instead of a separately hard-coded dev placeholder that could drift.
  const appUser = await getAuthenticatedUser();
  if (!appUser) redirect('/');

  return (
    <Playground
      userEmail={appUser.email}
      userAvatarUrl={appUser.avatar_url}
    />
  );
}
