'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────────

type Matchup = {
  matchupId: string;
  inviteCode: string;
  status: string;
  tournamentId: string;
  opponentDisplayName: string | null;
  opponentEmail: string | null;
};

type ActionState = {
  loading: boolean;
  result: string | null;
  error: string | null;
};

const idle: ActionState = { loading: false, result: null, error: null };

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [loadingMatchups, setLoadingMatchups] = useState(true);
  const [fixtureState, setFixtureState] = useState<ActionState>(idle);
  const [joinState, setJoinState] = useState<Record<string, ActionState>>({});

  // ── Load matchups ──────────────────────────────────────────────────────────

  const loadMatchups = useCallback(async () => {
    setLoadingMatchups(true);
    try {
      const res = await fetch('/api/matchups', { cache: 'no-store' });
      const data = await res.json();
      if (data.ok) setMatchups(data.matchups ?? []);
    } finally {
      setLoadingMatchups(false);
    }
  }, []);

  useEffect(() => {
    loadMatchups();
  }, [loadMatchups]);

  // ── Seed fixtures ──────────────────────────────────────────────────────────

  async function seedFixtures() {
    setFixtureState({ loading: true, result: null, error: null });
    try {
      const res = await fetch('/api/admin/demo/fixtures', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setFixtureState({
          loading: false,
          result: `✓ Seeded ${data.fixturesSeeded} fixtures for round ${data.roundId} (${data.stage})`,
          error: null
        });
      } else {
        setFixtureState({ loading: false, result: null, error: data.error ?? 'Unknown error' });
      }
    } catch (e) {
      setFixtureState({ loading: false, result: null, error: String(e) });
    }
  }

  // ── Add bot opponent ───────────────────────────────────────────────────────

  async function addBot(matchupId: string) {
    setJoinState((prev) => ({ ...prev, [matchupId]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch('/api/admin/demo/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchupId })
      });
      const data = await res.json();
      if (data.ok) {
        setJoinState((prev) => ({
          ...prev,
          [matchupId]: {
            loading: false,
            result: `✓ Bot joined as participant ${data.botParticipantId}`,
            error: null
          }
        }));
        // Refresh matchup list so the pending badge updates
        await loadMatchups();
      } else {
        setJoinState((prev) => ({
          ...prev,
          [matchupId]: { loading: false, result: null, error: data.error ?? 'Unknown error' }
        }));
      }
    } catch (e) {
      setJoinState((prev) => ({
        ...prev,
        [matchupId]: { loading: false, result: null, error: String(e) }
      }));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const pendingMatchups = matchups.filter(
    (m) => !m.opponentEmail && m.status !== 'COMPLETE'
  );
  const activeMatchups = matchups.filter((m) => m.opponentEmail);

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <Link
          href="/play"
          style={{
            fontSize: 14,
            color: '#64748b',
            textDecoration: 'none',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: '4px 10px'
          }}
        >
          ← Back to app
        </Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Admin Tools</h1>
      </div>

      {/* ── Section: Fixtures ─────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Group Stage Fixtures</h2>
        <p style={descStyle}>
          Seeds all 12 Group Stage Round 1 fixtures (June 12–15, 2026) onto the active tournament.
          Safe to run multiple times — uses upsert.
        </p>
        <button
          style={btnStyle(fixtureState.loading)}
          disabled={fixtureState.loading}
          onClick={seedFixtures}
        >
          {fixtureState.loading ? 'Seeding…' : 'Seed Group Stage Fixtures'}
        </button>
        {fixtureState.result && <p style={successStyle}>{fixtureState.result}</p>}
        {fixtureState.error && <p style={errorStyle}>✗ {fixtureState.error}</p>}
      </section>

      {/* ── Section: Bot Opponent ─────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Add Bot Opponent</h2>
        <p style={descStyle}>
          Join a pending matchup as a demo bot (<code>bot@demo.local</code>) so you can
          test the full two-player experience on your own.
        </p>

        {loadingMatchups && <p style={{ color: '#64748b', fontSize: 14 }}>Loading matchups…</p>}

        {!loadingMatchups && pendingMatchups.length === 0 && (
          <p style={{ color: '#64748b', fontSize: 14 }}>
            No pending matchups found.{' '}
            {matchups.length === 0
              ? 'Create a matchup from the app first.'
              : 'All matchups already have an opponent.'}
          </p>
        )}

        {pendingMatchups.map((m) => {
          const state = joinState[m.matchupId] ?? idle;
          return (
            <div key={m.matchupId} style={matchupRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  Invite code: <code style={codeStyle}>{m.inviteCode}</code>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Status: {m.status} · ID: {m.matchupId.slice(0, 8)}…
                </div>
                {state.result && <div style={successStyle}>{state.result}</div>}
                {state.error && <div style={errorStyle}>✗ {state.error}</div>}
              </div>
              <button
                style={btnSmallStyle(state.loading || !!state.result)}
                disabled={state.loading || !!state.result}
                onClick={() => addBot(m.matchupId)}
              >
                {state.loading ? 'Joining…' : state.result ? 'Joined' : 'Add Bot'}
              </button>
            </div>
          );
        })}
      </section>

      {/* ── Section: Active Matchups ──────────────────────────────────────── */}
      {activeMatchups.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={headingStyle}>Active Matchups</h2>
          <p style={descStyle}>Matchups that already have both participants.</p>
          {activeMatchups.map((m) => (
            <div key={m.matchupId} style={{ ...matchupRowStyle, opacity: 0.7 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  vs {m.opponentDisplayName ?? m.opponentEmail}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Status: {m.status} · Invite: <code style={codeStyle}>{m.inviteCode}</code>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '20px 24px',
  marginBottom: 20
};

const headingStyle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: 16,
  fontWeight: 700,
  color: '#0f172a'
};

const descStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 13,
  color: '#475569',
  lineHeight: 1.5
};

const matchupRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '12px 14px',
  marginBottom: 8
};

const codeStyle: React.CSSProperties = {
  background: '#f1f5f9',
  border: '1px solid #e2e8f0',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: 12,
  fontFamily: 'monospace'
};

const successStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: '#16a34a',
  fontWeight: 500
};

const errorStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: '#dc2626',
  fontWeight: 500
};

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#94a3b8' : '#1e40af',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 150ms'
  };
}

function btnSmallStyle(disabled: boolean): React.CSSProperties {
  return {
    ...btnStyle(disabled),
    padding: '6px 12px',
    flexShrink: 0,
    fontSize: 12
  };
}
