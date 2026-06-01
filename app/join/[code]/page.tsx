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
    .select('id, status, created_by, app_user!matchup_created_by_fkey(display_name, email, avatar_url)')
    .eq('invite_code', inviteCode)
    .maybeSingle();

  if (!matchup || matchup.status !== 'ACTIVE') {
    notFound();
  }

  const creator = (Array.isArray(matchup.app_user) ? matchup.app_user[0] : matchup.app_user) as {
    display_name: string | null; email: string; avatar_url: string | null;
  } | null;

  const creatorName = creator?.display_name ?? creator?.email?.split('@')[0] ?? 'Someone';
  const creatorInitial = creatorName.charAt(0).toUpperCase();
  const creatorAvatar = creator?.avatar_url;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="wc-invite-page">
      <nav className="wc-landing-nav">
        <span className="wc-landing-nav-logo">⚽ Match Duel</span>
      </nav>

      <main className="wc-invite-main">

        {/* Challenge card */}
        <div className="wc-invite-card">
          {/* Challenger */}
          <div className="wc-invite-challenger">
            <div className="wc-invite-avatar">
              {creatorAvatar
                ? <img src={creatorAvatar} alt={creatorName} className="wc-invite-avatar-img" referrerPolicy="no-referrer" />
                : <span className="wc-invite-avatar-init">{creatorInitial}</span>
              }
            </div>
            <div className="wc-invite-challenger-text">
              <h1 className="wc-invite-title">{creatorName} challenged you!</h1>
              <p className="wc-invite-sub">FIFA World Cup &lsquo;26 · Head-to-Head</p>
            </div>
          </div>

          {/* How it works */}
          <div className="wc-invite-how">
            <div className="wc-invite-step">
              <span className="wc-invite-step-icon">🔄</span>
              <div>
                <strong>You alternate picks</strong>
                <p>For every match, one of you picks a team — the other gets the opponent automatically.</p>
              </div>
            </div>
            <div className="wc-invite-step">
              <span className="wc-invite-step-icon">📉</span>
              <div>
                <strong>Lose a round, pick first next</strong>
                <p>The weaker player gets first pick in the next stage — the built-in comeback mechanic.</p>
              </div>
            </div>
            <div className="wc-invite-step">
              <span className="wc-invite-step-icon">📈</span>
              <div>
                <strong>Points escalate</strong>
                <p>1pt per group match rising to 32pts for the Final — every stage matters more than the last.</p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="wc-invite-cta">
            <JoinButton inviteCode={inviteCode} isLoggedIn={!!user} />
            {!user && (
              <p className="wc-invite-hint">Sign in to accept — takes 10 seconds</p>
            )}
          </div>
        </div>

        <p className="wc-invite-footer">
          FIFA World Cup 2026 · USA · Canada · Mexico
        </p>
      </main>
    </div>
  );
}
