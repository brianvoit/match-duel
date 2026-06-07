'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Provider } from '@supabase/supabase-js';

export function BetaGate() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await fetch('/api/auth/beta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    setLoading(false);

    if (res.ok) {
      setUnlocked(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Invalid code. Try again.');
    }
  }

  if (unlocked) {
    return <OAuthButtons />;
  }

  return (
    <form className="wc-beta-gate" onSubmit={handleSubmit}>
      <p className="wc-beta-gate-label">Enter your beta access code to continue</p>
      <div className="wc-beta-gate-row">
        <input
          className="wc-beta-gate-input"
          type="text"
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button
          type="submit"
          className="wc-btn wc-btn-primary"
          disabled={loading || code.length === 0}
        >
          {loading ? 'Checking…' : 'Continue'}
        </button>
      </div>
      {error && <p className="wc-beta-gate-error">{error}</p>}
    </form>
  );
}

function OAuthButtons() {
  const supabase = createClient();

  async function signInWith(provider: Provider) {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  }

  return (
    <div className="wc-auth-buttons">
      <button
        type="button"
        className="wc-btn wc-btn-lg wc-btn-primary"
        onClick={() => signInWith('google')}
      >
        Sign in with Google
      </button>
    </div>
  );
}
