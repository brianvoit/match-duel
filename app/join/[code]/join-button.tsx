'use client';

import { createClient } from '@/lib/supabase/client';
import type { Provider } from '@supabase/supabase-js';

interface JoinButtonProps {
  inviteCode: string;
  isLoggedIn: boolean;
}

export function JoinButton({ inviteCode, isLoggedIn }: JoinButtonProps) {
  async function handleAccept() {
    const res = await fetch(`/api/matchups/invite/${inviteCode}/accept`, { method: 'POST' });
    if (res.ok) {
      window.location.href = '/play';
    } else {
      const { error } = await res.json();
      alert(error ?? 'Failed to accept invite.');
    }
  }

  async function handleSignIn(provider: Provider) {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?invite=${inviteCode}`;
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  }

  if (isLoggedIn) {
    return (
      <button type="button" className="wc-btn wc-btn-lg wc-btn-primary" onClick={handleAccept}>
        Accept Challenge
      </button>
    );
  }

  return (
    <div className="wc-auth-buttons">
      <button
        type="button"
        className="wc-btn wc-btn-lg wc-btn-primary"
        onClick={() => handleSignIn('google')}
      >
        Accept with Google
      </button>
      <button
        type="button"
        className="wc-btn wc-btn-lg wc-btn-primary"
        onClick={() => handleSignIn('apple')}
      >
        Accept with Apple
      </button>
    </div>
  );
}
