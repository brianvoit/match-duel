'use client';

import { createClient } from '@/lib/supabase/client';
import type { Provider } from '@supabase/supabase-js';

interface AuthControlsProps {
  isLoggedIn: boolean;
  className?: string;
}

export function AuthControls({ isLoggedIn, className }: AuthControlsProps) {
  const supabase = createClient();

  async function signInWith(provider: Provider) {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
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
    <div className="wc-auth-buttons">
      <button
        type="button"
        className={className ?? 'wc-btn wc-btn-primary'}
        onClick={() => signInWith('google')}
      >
        Sign in with Google
      </button>
      <button
        type="button"
        className={className ?? 'wc-btn wc-btn-primary'}
        onClick={() => signInWith('apple')}
      >
        Sign in with Apple
      </button>
    </div>
  );
}
