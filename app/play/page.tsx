import { redirect } from 'next/navigation';
import { Playground } from '@/app/components/playground';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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

  const avatarUrl = (data.user.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <Playground
      userEmail={data.user.email ?? 'user'}
      userAvatarUrl={avatarUrl}
    />
  );
}
