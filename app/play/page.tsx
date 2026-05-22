import { redirect } from 'next/navigation';
import { Playground } from '@/app/components/playground';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isAdminEmail, userHasAccess } from '@/lib/auth/access';

export default async function PlayPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect('/');
  }

  if (!isAdminEmail(data.user.email) && !(await userHasAccess(data.user.id))) {
    await supabase.auth.signOut();
    redirect('/?error=no_access');
  }

  const avatarUrl = (data.user.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <Playground
      userEmail={data.user.email ?? 'user'}
      userAvatarUrl={avatarUrl}
    />
  );
}
