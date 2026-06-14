import { redirect } from 'next/navigation';
import { Playground } from '@/app/components/playground';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';

export const dynamic = 'force-dynamic';

export default async function PlayPage() {
  // Dev bypass — skip auth on localhost when BYPASS_AUTH=true
  if (process.env.BYPASS_AUTH === 'true') {
    return <Playground userEmail="dev@local" userAvatarUrl={null} />;
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect('/');
  }

  // Prefer the stored app_user avatar (which includes custom uploads) over the
  // raw OAuth photo, so an uploaded avatar persists across reloads.
  const appUser = await ensureAppUser(data.user);
  const avatarUrl =
    appUser.avatar_url ??
    (data.user.user_metadata?.avatar_url as string | undefined) ??
    null;

  return (
    <Playground
      userEmail={data.user.email ?? 'user'}
      userAvatarUrl={avatarUrl}
    />
  );
}
