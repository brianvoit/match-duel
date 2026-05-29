import { redirect } from 'next/navigation';
import { Playground } from '@/app/components/playground';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function PlayPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect('/');
  }

  const avatarUrl = (data.user.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <Playground
      userEmail={data.user.email ?? 'user'}
      userAvatarUrl={avatarUrl}
    />
  );
}
