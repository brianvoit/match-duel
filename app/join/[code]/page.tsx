import { notFound } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { JoinButton } from './join-button';

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const { code } = await params;
  const inviteCode = code.trim().toUpperCase();

  const service = createServiceRoleClient();
  const { data: matchup } = await service
    .from('matchup')
    .select('id, status, created_by, created_at, app_user!matchup_created_by_fkey(display_name, email)')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (!matchup || matchup.status !== 'ACTIVE') {
    notFound();
  }

  const creator = (Array.isArray(matchup.app_user) ? matchup.app_user[0] : matchup.app_user) as { display_name: string | null; email: string } | null;
  const creatorName = creator?.display_name ?? creator?.email ?? 'Someone';

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="wc-landing">
      <nav className="wc-landing-nav">
        <span className="wc-landing-nav-logo">⚽ Pick&apos;Em</span>
      </nav>

      <section className="wc-landing-hero">
        <div className="wc-landing-ball">🏆</div>
        <h1 className="wc-landing-title">
          You&apos;ve been<br />challenged!
        </h1>
        <p className="wc-landing-sub">
          <strong>{creatorName}</strong> has challenged you to a<br />
          head-to-head World Cup Pick&apos;Em duel.
        </p>
        <p className="wc-landing-sub" style={{ fontSize: '0.9rem', opacity: 0.7 }}>
          Take turns claiming teams on every match. The one who calls more winners takes the cup.
        </p>
        <JoinButton inviteCode={inviteCode} isLoggedIn={!!user} />
        {!user && (
          <p className="wc-landing-hint">Sign in with Google to accept this challenge</p>
        )}
      </section>
    </div>
  );
}
