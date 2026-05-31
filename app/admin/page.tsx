'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────────

type RoundRow = {
  id: string;
  stage: string;
  order_index: number;
  is_complete: boolean;
  fixtureCount: number;
};

type Status = {
  tournament: { id: string; year: number; is_active: boolean } | null;
  currentRound: RoundRow | null;
  rounds: RoundRow[];
  fixtures: { total: number; byStatus: Record<string, number> };
  matchups: number;
  participants: number;
  lastSynced: string | null;
  season: number;
};

type Matchup = {
  matchupId: string;
  inviteCode: string;
  status: string;
  tournamentId: string;
  opponentDisplayName: string | null;
  opponentEmail: string | null;
};

type ActionResult = Record<string, unknown>;
type ActionState = { loading: boolean; result: ActionResult | null; error: string | null };
const idle: ActionState = { loading: false, result: null, error: null };

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage', ROUND_OF_32: 'Round of 32', ROUND_OF_16: 'Round of 16',
  QUARTERFINAL: 'Quarter-Finals', SEMIFINAL: 'Semi-Finals',
  THIRD_PLACE: 'Third Place', FINAL: 'Final',
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [syncState, setSyncState] = useState<ActionState>(idle);
  const [transitionState, setTransitionState] = useState<ActionState>(idle);
  const [fixtureState, setFixtureState] = useState<ActionState>(idle);
  const [joinState, setJoinState] = useState<Record<string, ActionState>>({});

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const [statusRes, matchupsRes] = await Promise.all([
        fetch('/api/admin/status', { cache: 'no-store' }),
        fetch('/api/matchups', { cache: 'no-store' }),
      ]);
      const [statusData, matchupsData] = await Promise.all([
        statusRes.json(),
        matchupsRes.json(),
      ]);
      if (statusData.ok) setStatus(statusData);
      if (matchupsData.ok) setMatchups(matchupsData.matchups ?? []);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function runSync() {
    setSyncState({ loading: true, result: null, error: null });
    try {
      const res = await fetch('/api/admin/fixtures/live-sync', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setSyncState({ loading: false, result: data, error: null });
        await loadStatus();
      } else {
        setSyncState({ loading: false, result: null, error: data.error ?? 'Unknown error' });
      }
    } catch (e) {
      setSyncState({ loading: false, result: null, error: String(e) });
    }
  }

  async function runTransitions() {
    setTransitionState({ loading: true, result: null, error: null });
    try {
      const res = await fetch('/api/admin/rounds/transitions', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setTransitionState({ loading: false, result: data, error: null });
        await loadStatus();
      } else {
        setTransitionState({ loading: false, result: null, error: data.error ?? 'Unknown error' });
      }
    } catch (e) {
      setTransitionState({ loading: false, result: null, error: String(e) });
    }
  }

  async function seedFixtures() {
    setFixtureState({ loading: true, result: null, error: null });
    try {
      const res = await fetch('/api/admin/demo/fixtures', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setFixtureState({ loading: false, result: data, error: null });
        await loadStatus();
      } else {
        setFixtureState({ loading: false, result: null, error: data.error ?? 'Unknown error' });
      }
    } catch (e) {
      setFixtureState({ loading: false, result: null, error: String(e) });
    }
  }

  async function addBot(matchupId: string) {
    setJoinState(p => ({ ...p, [matchupId]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch('/api/admin/demo/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchupId }),
      });
      const data = await res.json();
      if (data.ok) {
        setJoinState(p => ({ ...p, [matchupId]: { loading: false, result: data, error: null } }));
        await loadStatus();
      } else {
        setJoinState(p => ({ ...p, [matchupId]: { loading: false, result: null, error: data.error ?? 'Unknown error' } }));
      }
    } catch (e) {
      setJoinState(p => ({ ...p, [matchupId]: { loading: false, result: null, error: String(e) } }));
    }
  }

  const pending  = matchups.filter(m => !m.opponentEmail && m.status !== 'COMPLETE');
  const active   = matchups.filter(m => m.opponentEmail);
  const totalFix = status?.fixtures.total ?? 0;
  const finalFix = status?.fixtures.byStatus['FINAL'] ?? 0;
  const liveFix  = status?.fixtures.byStatus['LIVE'] ?? 0;

  return (
    <main style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Link href="/play" style={backLinkStyle}>← Back to app</Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Admin</h1>
      </div>

      {/* ── Tournament Status ──────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Tournament Status</h2>

        {loadingStatus ? (
          <p style={mutedStyle}>Loading…</p>
        ) : !status?.tournament ? (
          <p style={mutedStyle}>No active tournament found.</p>
        ) : (
          <>
            <div style={statGridStyle}>
              <Stat label="Season" value={`WC ${status.tournament.year}`} />
              <Stat label="API season" value={String(status.season)} accent={status.season !== status.tournament.year} />
              <Stat label="Fixtures" value={totalFix === 0 ? '—' : `${finalFix}/${totalFix} final`} />
              <Stat label="Live" value={liveFix > 0 ? `${liveFix} live` : '—'} accent={liveFix > 0} />
              <Stat label="Matchups" value={String(status.matchups)} />
              <Stat label="Players" value={String(status.participants)} />
            </div>

            {status.lastSynced && (
              <p style={{ ...mutedStyle, fontSize: 11, marginTop: 8 }}>
                Last synced: {new Date(status.lastSynced).toLocaleString()}
              </p>
            )}

            {/* Round progress */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {status.rounds.map(r => (
                <div key={r.id} style={roundRowStyle(r.is_complete)}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.is_complete ? '#16a34a' : '#0f172a' }}>
                    {r.is_complete ? '✓ ' : r.id === status.currentRound?.id ? '▶ ' : '  '}
                    {STAGE_LABELS[r.stage] ?? r.stage}
                  </span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {r.fixtureCount} fixtures
                  </span>
                </div>
              ))}
            </div>

            {status.season !== status.tournament.year && (
              <p style={{ ...errorStyle, marginTop: 10 }}>
                ⚠ API_FOOTBALL_SEASON={status.season} doesn&apos;t match tournament year {status.tournament.year}.
                Change to {status.tournament.year} once the Starter plan is active.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── API-Football Sync ──────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>API-Football Sync</h2>
        <p style={descStyle}>
          Fetches all fixtures from API-Football, upserts scores and statuses,
          then runs round transitions to settle completed rounds and award points.
          The cron worker runs this automatically every 30 minutes.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnStyle(syncState.loading)} disabled={syncState.loading} onClick={runSync}>
            {syncState.loading ? 'Syncing…' : '↻ Run Live Sync'}
          </button>
          <button style={btnOutlineStyle(transitionState.loading)} disabled={transitionState.loading} onClick={runTransitions}>
            {transitionState.loading ? 'Running…' : 'Settle Rounds'}
          </button>
        </div>
        {syncState.result && (
          <p style={successStyle}>
            ✓ Sync complete — {(syncState.result as { api?: { mapped?: number } }).api?.mapped ?? 0} fixtures mapped
            {(syncState.result as { transitions?: { completedRoundIds?: string[] } }).transitions?.completedRoundIds?.length
              ? `, ${(syncState.result as { transitions: { completedRoundIds: string[] } }).transitions.completedRoundIds.length} round(s) settled`
              : ''}
          </p>
        )}
        {syncState.error && <p style={errorStyle}>✗ {syncState.error}</p>}
        {transitionState.result && (
          <p style={successStyle}>
            ✓ Transitions complete — {(transitionState.result as { completedRoundIds?: string[] }).completedRoundIds?.length ?? 0} round(s) settled
          </p>
        )}
        {transitionState.error && <p style={errorStyle}>✗ {transitionState.error}</p>}
      </section>

      {/* ── Dev Tools ─────────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Dev Tools</h2>
        <p style={descStyle}>
          Seed demo fixtures or add a bot opponent for local testing.
        </p>

        <div style={{ marginBottom: 12 }}>
          <button style={btnStyle(fixtureState.loading)} disabled={fixtureState.loading} onClick={seedFixtures}>
            {fixtureState.loading ? 'Seeding…' : 'Seed Demo Fixtures'}
          </button>
          {fixtureState.result && <p style={successStyle}>✓ Demo fixtures seeded.</p>}
          {fixtureState.error && <p style={errorStyle}>✗ {fixtureState.error}</p>}
        </div>

        {pending.length > 0 && (
          <div>
            <p style={{ ...mutedStyle, marginBottom: 6 }}>Pending matchups (no opponent yet):</p>
            {pending.map(m => {
              const s = joinState[m.matchupId] ?? idle;
              return (
                <div key={m.matchupId} style={matchupRowStyle}>
                  <div style={{ flex: 1, fontSize: 13, color: '#1e293b' }}>
                    <code style={codeStyle}>{m.inviteCode}</code>
                    <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>{m.matchupId.slice(0, 8)}…</span>
                    {s.result && <span style={successStyle}> ✓ Bot joined</span>}
                    {s.error && <span style={errorStyle}> ✗ {s.error}</span>}
                  </div>
                  <button style={btnSmStyle(s.loading || !!s.result)} disabled={s.loading || !!s.result}
                    onClick={() => addBot(m.matchupId)}>
                    {s.loading ? '…' : s.result ? 'Done' : 'Add Bot'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {active.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ ...mutedStyle, marginBottom: 4 }}>Active matchups:</p>
            {active.map(m => (
              <div key={m.matchupId} style={{ ...matchupRowStyle, opacity: 0.65 }}>
                <span style={{ fontSize: 13, color: '#1e293b' }}>
                  vs {m.opponentDisplayName ?? m.opponentEmail}
                </span>
                <code style={codeStyle}>{m.inviteCode}</code>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={statStyle}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? '#dc2626' : '#0f172a' }}>{value}</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  maxWidth: 640, margin: '0 auto', padding: '32px 20px',
  fontFamily: "'Helvetica Neue', Arial, sans-serif",
};
const sectionStyle: React.CSSProperties = {
  background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 12, padding: '20px 22px', marginBottom: 16,
};
const headingStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' };
const descStyle: React.CSSProperties = { margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 };
const mutedStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: '#64748b' };
const successStyle: React.CSSProperties = { marginTop: 6, fontSize: 12, color: '#16a34a', fontWeight: 500 };
const errorStyle: React.CSSProperties = { marginTop: 6, fontSize: 12, color: '#dc2626', fontWeight: 500 };
const backLinkStyle: React.CSSProperties = {
  fontSize: 13, color: '#64748b', textDecoration: 'none',
  border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px',
};
const statGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 };
const statStyle: React.CSSProperties = {
  background: 'white', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '10px 12px',
};
const matchupRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  background: '#fff', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '8px 12px', marginBottom: 6,
};
const codeStyle: React.CSSProperties = {
  background: '#f1f5f9', border: '1px solid #e2e8f0',
  borderRadius: 4, padding: '1px 5px', fontSize: 12, fontFamily: 'monospace',
};

function roundRowStyle(complete: boolean): React.CSSProperties {
  return {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 8px', borderRadius: 6,
    background: complete ? '#f0fdf4' : '#fff',
    border: `1px solid ${complete ? '#bbf7d0' : '#e2e8f0'}`,
  };
}

function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? '#94a3b8' : '#1e40af', color: '#fff',
    border: 'none', borderRadius: 7, padding: '8px 16px',
    fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  };
}
function btnOutlineStyle(disabled: boolean): React.CSSProperties {
  return {
    ...btnStyle(disabled),
    background: 'white', color: disabled ? '#94a3b8' : '#1e40af',
    border: `1px solid ${disabled ? '#cbd5e1' : '#1e40af'}`,
  };
}
function btnSmStyle(disabled: boolean): React.CSSProperties {
  return { ...btnStyle(disabled), padding: '5px 10px', fontSize: 12, flexShrink: 0 };
}
