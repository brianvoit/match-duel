import { redirect } from 'next/navigation';
import { BetaGate } from '@/app/components/beta-gate';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect('/play');
  }

  const { error } = await searchParams;
  const noAccess = error === 'no_access';

  return (
    <div className="wc-landing">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="wc-landing-nav">
        <span className="wc-landing-nav-logo">⚽ Pick&apos;Em</span>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="wc-landing-hero">
        <div className="wc-landing-ball">⚽</div>
        <h1 className="wc-landing-title">
          World Cup<br />Pick&apos;Em &lsquo;26
        </h1>
        {noAccess ? (
          <p className="wc-landing-sub" style={{ color: '#ef4444' }}>
            Your beta code didn&apos;t grant access. Make sure you&apos;ve entered it correctly and try again.
          </p>
        ) : (
          <p className="wc-landing-sub">
            Invite a friend. Claim a team on every match.<br />
            The one who calls more winners takes the cup.
          </p>
        )}
        <BetaGate />
        <p className="wc-landing-hint">Beta access · Sign in with Google or Apple</p>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="wc-landing-how">
        <h2 className="wc-landing-section-title">How it works</h2>
        <div className="wc-landing-cards">

          <div className="wc-landing-card">
            <div className="wc-landing-card-icon">🤝</div>
            <h3 className="wc-landing-card-title">Challenge a friend</h3>
            <p className="wc-landing-card-body">
              Create a matchup and share your invite code. One link, one opponent — nobody else can join.
            </p>
          </div>

          <div className="wc-landing-card">
            <div className="wc-landing-card-icon">🏆</div>
            <h3 className="wc-landing-card-title">Alternate picks</h3>
            <p className="wc-landing-card-body">
              You and your opponent take turns choosing a team on each match. Pick wisely — your opponent is automatically assigned the other side.
            </p>
          </div>

          <div className="wc-landing-card">
            <div className="wc-landing-card-icon">📈</div>
            <h3 className="wc-landing-card-title">Follow the tournament</h3>
            <p className="wc-landing-card-body">
              Points accumulate as matches go final. Group stage, knockouts, all the way to the final — whoever calls more winners wins.
            </p>
          </div>

        </div>
      </section>

      {/* ── Details strip ───────────────────────────────────────────────── */}
      <section className="wc-landing-details">
        <div className="wc-landing-detail">
          <span className="wc-landing-detail-num">48</span>
          <span className="wc-landing-detail-label">Group stage matches</span>
        </div>
        <div className="wc-landing-detail-div" />
        <div className="wc-landing-detail">
          <span className="wc-landing-detail-num">32</span>
          <span className="wc-landing-detail-label">Knockout matches</span>
        </div>
        <div className="wc-landing-detail-div" />
        <div className="wc-landing-detail">
          <span className="wc-landing-detail-num">32</span>
          <span className="wc-landing-detail-label">Nations competing</span>
        </div>
        <div className="wc-landing-detail-div" />
        <div className="wc-landing-detail">
          <span className="wc-landing-detail-num">1</span>
          <span className="wc-landing-detail-label">Champion crowned</span>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="wc-landing-footer">
        <span>FIFA World Cup 2026 · USA · Canada · Mexico</span>
      </footer>

    </div>
  );
}
