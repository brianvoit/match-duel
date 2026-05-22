'use client';

import { createClient } from '@/lib/supabase/client';

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

  async function handleSignIn() {
    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?invite=${inviteCode}`;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  }

  if (isLoggedIn) {
    return (
      <button type="button" className="wc-btn wc-btn-lg wc-btn-primary" onClick={handleAccept}>
        Accept Challenge
      </button>
    );
  }

  return (
    <button type="button" className="wc-btn wc-btn-lg wc-btn-primary" onClick={handleSignIn}>
      Sign in with Google to Accept
    </button>
  );
}
