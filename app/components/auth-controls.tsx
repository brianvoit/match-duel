'use client';

import { createClient } from '@/lib/supabase/client';

interface AuthControlsProps {
  isLoggedIn: boolean;
  className?: string;
}

export function AuthControls({ isLoggedIn, className }: AuthControlsProps) {
  const supabase = createClient();

  async function signInWithGoogle() {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (isLoggedIn) {
    return (
      <button type="button" className={className ?? 'wc-btn'} onClick={signOut}>
        Sign Out
      </button>
    );
  }

  return (
    <button type="button" className={className ?? 'wc-btn wc-btn-primary'} onClick={signInWithGoogle}>
      Sign In with Google
    </button>
  );
}
