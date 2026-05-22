import Link from 'next/link';
import { AuthControls } from '@/app/components/auth-controls';
import { Playground } from '@/app/components/playground';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function PlayPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return (
      <main className="wc-page">
        <section className="wc-center">
          <h1 className="wc-title">World Cup Pick&apos;Em</h1>
          <p className="wc-subtitle">You need to sign in before accessing the app shell.</p>
          <div className="wc-pill-row" style={{ marginTop: 14 }}>
            <AuthControls isLoggedIn={false} className="wc-btn wc-btn-primary" />
            <Link className="wc-btn" href="/">
              Back
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const avatarUrl =
    (data.user.user_metadata?.avatar_url as string | undefined) ?? null;

  return (
    <Playground
      userEmail={data.user.email ?? 'user'}
      userAvatarUrl={avatarUrl}
    />
  );
}
