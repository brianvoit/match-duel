'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────────

type RoundRow = { id: string; stage: string; order_index: number; is_complete: boolean; fixtureCount: number };
type LiveFixture = { id: string; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; startsAt: string };
type PickRow = { fixtureId: string; homeTeam: string; awayTeam: string; startsAt: string; totalPickers: number; submittedPicks: number };
type Matchup = { matchupId: string; inviteCode: string; status: string; opponentDisplayName: string | null; opponentEmail: string | null };

type Status = {
  tournament: { id: string; year: number } | null;
  currentRound: RoundRow | null;
  rounds: RoundRow[];
  fixtures: { total: number; byStatus: Record<string, number> };
  liveFixtures: LiveFixture[];
  pickCompletion: PickRow[];
  matchups: number;
  participants: number;
  lastSynced: string | null;
  season: number;
};

type Quota = { plan: string; current: number; limit: number };
type ActionResult = Record<string, unknown>;
type ActionState = { loading: boolean; result: ActionResult | null; error: string | null };

const idle: ActionState = { loading: false, result: null, error: null };

// Fixture editor state
type EditingFixture = { id: string; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; status: string };

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage', ROUND_OF_32: 'Round of 32', ROUND_OF_16: 'Round of 16',
  QUARTERFINAL: 'Quarter-Finals', SEMIFINAL: 'Semi-Finals', THIRD_PLACE: 'Third Place', FINAL: 'Final',
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [loading, setLoading] = useState(true);

  const [syncState, setSyncState] = useState<ActionState>(idle);
  const [transitionState, setTransitionState] = useState<ActionState>(idle);
  const [testPushState, setTestPushState] = useState<ActionState>(idle);
  const [fixtureState, setFixtureState] = useState<ActionState>(idle);
  const [joinState, setJoinState] = useState<Record<string, ActionState>>({});
  const [forceState, setForceState] = useState<Record<string, ActionState>>({});
  const [editingFixture, setEditingFixture] = useState<EditingFixture | null>(null);
  const [editState, setEditState] = useState<ActionState>(idle);

  const liveInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, quotaRes, matchupsRes] = await Promise.all([
        fetch('/api/admin/status', { cache: 'no-store' }),
        fetch('/api/admin/api-football/quota', { cache: 'no-store' }),
        fetch('/api/matchups', { cache: 'no-store' }),
      ]);
      const [s, q, m] = await Promise.all([statusRes.json(), quotaRes.json(), matchupsRes.json()]);
      if (s.ok) setStatus(s);
      if (q.ok) setQuota(q);
      if (m.ok) setMatchups(m.matchups ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-refresh status every 30s when there are live fixtures
  useEffect(() => {
    if (status?.liveFixtures.length) {
      liveInterval.current = setInterval(() => {
        fetch('/api/admin/status', { cache: 'no-store' }).then(r => r.json()).then(s => { if (s.ok) setStatus(s); }).catch(() => {});
      }, 30_000);
    }
    return () => { if (liveInterval.current) clearInterval(liveInterval.current); };
  }, [status?.liveFixtures.length]);

  async function run(
    url: string, setState: (s: ActionState) => void,
    opts?: RequestInit
  ) {
    setState({ loading: true, result: null, error: null });
    try {
      const res = await fetch(url, { method: 'POST', ...opts });
      const data = await res.json();
      if (data.ok || res.ok) { setState({ loading: false, result: data, error: null }); await loadAll(); }
      else setState({ loading: false, result: null, error: data.error ?? 'Unknown error' });
    } catch (e) { setState({ loading: false, result: null, error: String(e) }); }
  }

  async function forceComplete(roundId: string) {
    setForceState(p => ({ ...p, [roundId]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch(`/api/admin/rounds/${roundId}/complete`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) { setForceState(p => ({ ...p, [roundId]: { loading: false, result: data, error: null } })); await loadAll(); }
      else setForceState(p => ({ ...p, [roundId]: { loading: false, result: null, error: data.error ?? 'Failed' } }));
    } catch (e) { setForceState(p => ({ ...p, [roundId]: { loading: false, result: null, error: String(e) } })); }
  }

  async function saveEdit() {
    if (!editingFixture) return;
    setEditState({ loading: true, result: null, error: null });
    try {
      const res = await fetch(`/api/admin/fixtures/${editingFixture.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeScore: editingFixture.homeScore,
          awayScore: editingFixture.awayScore,
          status: editingFixture.status,
        }),
      });
      const data = await res.json();
      if (data.ok) { setEditState({ loading: false, result: data, error: null }); setEditingFixture(null); await loadAll(); }
      else setEditState({ loading: false, result: null, error: data.error ?? 'Failed' });
    } catch (e) { setEditState({ loading: false, result: null, error: String(e) }); }
  }

  const totalFix = status?.fixtures.total ?? 0;
  const finalFix = status?.fixtures.byStatus['FINAL'] ?? 0;
  const liveFix  = status?.liveFixtures.length ?? 0;
  const pending  = matchups.filter(m => !m.opponentEmail && m.status !== 'COMPLETE');
  const active   = matchups.filter(m => m.opponentEmail);

  return (
    <main style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <Link href="/play" style={backLinkStyle}>← Back to app</Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Admin</h1>
        <button style={{ ...btnSmStyle(loading), marginLeft: 'auto' }} onClick={loadAll} disabled={loading}>
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* ── Tournament Status ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Tournament Status</h2>
        {loading && !status ? <p style={mutedStyle}>Loading…</p> : !status?.tournament ? (
          <p style={mutedStyle}>No active tournament found.</p>
        ) : (
          <>
            <div style={statGridStyle}>
              <Stat label="Tournament" value={`WC ${status.tournament.year}`} />
              <Stat label="Fixtures" value={totalFix ? `${finalFix}/${totalFix} final` : '—'} />
              <Stat label="Live now" value={liveFix ? `${liveFix} live 🔴` : '—'} accent={liveFix > 0} />
              <Stat label="Matchups" value={String(status.matchups)} />
              <Stat label="Players" value={String(status.participants)} />
              {quota && (
                <Stat
                  label={`API (${quota.plan})`}
                  value={`${quota.current}/${quota.limit} req`}
                  accent={quota.current / quota.limit > 0.8}
                />
              )}
            </div>
            {status.lastSynced && (
              <p style={{ ...mutedStyle, fontSize: 11, marginTop: 8 }}>
                Last synced: {new Date(status.lastSynced).toLocaleString()}
              </p>
            )}
            {status.season !== status.tournament.year && (
              <p style={{ ...errorStyle, marginTop: 8 }}>
                ⚠ API_FOOTBALL_SEASON={status.season} — change to {status.tournament.year} after upgrading the plan.
              </p>
            )}

            {/* Round rows with force-complete */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {status.rounds.map(r => {
                const fs = forceState[r.id] ?? idle;
                return (
                  <div key={r.id} style={roundRowStyle(r.is_complete, r.id === status.currentRound?.id)}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: r.is_complete ? '#16a34a' : r.id === status.currentRound?.id ? '#1e40af' : '#0f172a' }}>
                      {r.is_complete ? '✓ ' : r.id === status.currentRound?.id ? '▶ ' : '  '}
                      {STAGE_LABELS[r.stage] ?? r.stage}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{r.fixtureCount} fixtures</span>
                      {!r.is_complete && r.fixtureCount > 0 && (
                        <button
                          style={btnDangerSmStyle(fs.loading)}
                          disabled={fs.loading}
                          onClick={() => { if (confirm(`Force-complete ${STAGE_LABELS[r.stage]}? This marks the round done and runs scoring.`)) forceComplete(r.id); }}
                        >
                          {fs.loading ? '…' : 'Force complete'}
                        </button>
                      )}
                      {fs.result && <span style={successStyle}>✓ Done</span>}
                      {fs.error && <span style={errorStyle}>✗ {fs.error}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* ── Live Match Monitor ───────────────────────────────────────────── */}
      {(status?.liveFixtures.length ?? 0) > 0 && (
        <section style={{ ...sectionStyle, borderColor: '#fca5a5', background: '#fff5f5' }}>
          <h2 style={{ ...headingStyle, color: '#dc2626' }}>🔴 Live Matches</h2>
          <p style={{ ...mutedStyle, marginBottom: 12 }}>Auto-refreshes every 30 seconds.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {status!.liveFixtures.map(f => (
              <div key={f.id} style={liveRowStyle}>
                <span style={liveTeamStyle}>{f.homeTeam}</span>
                <span style={liveScoreStyle}>
                  {f.homeScore ?? '—'} – {f.awayScore ?? '—'}
                </span>
                <span style={liveTeamStyle}>{f.awayTeam}</span>
                <button style={{ ...btnSmStyle(false), marginLeft: 'auto', fontSize: 11 }}
                  onClick={() => setEditingFixture({ id: f.id, homeTeam: f.homeTeam, awayTeam: f.awayTeam, homeScore: f.homeScore, awayScore: f.awayScore, status: 'LIVE' })}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Pick Completion ──────────────────────────────────────────────── */}
      {(status?.pickCompletion.length ?? 0) > 0 && (
        <section style={sectionStyle}>
          <h2 style={headingStyle}>Pick Completion — Next 48h</h2>
          <p style={descStyle}>How many first-pickers have submitted for each upcoming fixture.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {status!.pickCompletion.map(p => {
              const pct = p.totalPickers === 0 ? null : Math.round((p.submittedPicks / p.totalPickers) * 100);
              const color = pct === null ? '#64748b' : pct === 100 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
              return (
                <div key={p.fixtureId} style={pickRowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.homeTeam} vs {p.awayTeam}</span>
                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 8 }}>
                      {new Date(p.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color }}>
                      {p.totalPickers === 0 ? 'No assignments' : `${p.submittedPicks}/${p.totalPickers}${pct !== null ? ` (${pct}%)` : ''}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── API-Football Sync ────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>API-Football Sync</h2>
        <p style={descStyle}>Fetches fixtures, upserts scores, then settles completed rounds. Cron runs this every 30 minutes automatically.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btnStyle(syncState.loading)} disabled={syncState.loading} onClick={() => run('/api/admin/fixtures/live-sync', setSyncState)}>
            {syncState.loading ? 'Syncing…' : '↻ Run Live Sync'}
          </button>
          <button style={btnOutlineStyle(transitionState.loading)} disabled={transitionState.loading} onClick={() => run('/api/admin/rounds/transitions', setTransitionState)}>
            {transitionState.loading ? 'Running…' : 'Settle Rounds'}
          </button>
        </div>
        {syncState.result && (
          <p style={successStyle}>
            ✓ {(syncState.result as { api?: { mapped?: number } }).api?.mapped ?? 0} fixtures synced
            {((syncState.result as { transitions?: { completedRoundIds?: string[] } }).transitions?.completedRoundIds?.length ?? 0) > 0
              ? `, ${(syncState.result as { transitions: { completedRoundIds: string[] } }).transitions.completedRoundIds.length} round(s) settled` : ''}
          </p>
        )}
        {syncState.error && <p style={errorStyle}>✗ {syncState.error}</p>}
        {transitionState.result && <p style={successStyle}>✓ Rounds settled.</p>}
        {transitionState.error && <p style={errorStyle}>✗ {transitionState.error}</p>}
      </section>

      {/* ── Fixture Editor ───────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Fixture Score Editor</h2>
        <p style={descStyle}>Manually set or correct a score. Runs round transitions automatically after saving.</p>

        {editingFixture ? (
          <div style={editBoxStyle}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
              {editingFixture.homeTeam} vs {editingFixture.awayTeam}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={labelStyle}>
                {editingFixture.homeTeam} score
                <input type="number" min={0} style={numInputStyle} value={editingFixture.homeScore ?? ''}
                  onChange={e => setEditingFixture(f => f && ({ ...f, homeScore: e.target.value === '' ? null : parseInt(e.target.value) }))} />
              </label>
              <label style={labelStyle}>
                {editingFixture.awayTeam} score
                <input type="number" min={0} style={numInputStyle} value={editingFixture.awayScore ?? ''}
                  onChange={e => setEditingFixture(f => f && ({ ...f, awayScore: e.target.value === '' ? null : parseInt(e.target.value) }))} />
              </label>
              <label style={labelStyle}>
                Status
                <select style={{ ...numInputStyle, width: 130 }} value={editingFixture.status}
                  onChange={e => setEditingFixture(f => f && ({ ...f, status: e.target.value }))}>
                  {['SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED'].map(s => <option key={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnStyle(editState.loading)} disabled={editState.loading} onClick={saveEdit}>
                {editState.loading ? 'Saving…' : 'Save'}
              </button>
              <button style={btnOutlineStyle(false)} onClick={() => { setEditingFixture(null); setEditState(idle); }}>Cancel</button>
            </div>
            {editState.error && <p style={errorStyle}>✗ {editState.error}</p>}
          </div>
        ) : (
          <>
            <p style={mutedStyle}>Select a fixture to edit its score:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, maxHeight: 280, overflowY: 'auto' }}>
              {(status?.rounds ?? []).flatMap(r =>
                [] // fixtures shown via status — extend this once fixture list is added to status
              )}
              {status && status.fixtures.total === 0 && (
                <p style={mutedStyle}>No fixtures loaded yet. Run a sync first.</p>
              )}
              {status && status.fixtures.total > 0 && (
                <p style={mutedStyle}>
                  {status.fixtures.total} fixtures in DB.{' '}
                  Live fixtures have an Edit button above. For others, use the Supabase SQL editor or add a fixture search here.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Notifications ────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Push Notifications</h2>
        <p style={descStyle}>Send a test push to yourself to verify the full pipeline is working.</p>
        <button style={btnStyle(testPushState.loading)} disabled={testPushState.loading}
          onClick={() => run('/api/admin/notifications/test', setTestPushState)}>
          {testPushState.loading ? 'Sending…' : '🔔 Send Test Push'}
        </button>
        {testPushState.result && <p style={successStyle}>✓ Test notification dispatched. Check your device.</p>}
        {testPushState.error && <p style={errorStyle}>✗ {testPushState.error}</p>}
      </section>

      {/* ── Dev Tools ────────────────────────────────────────────────────── */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Dev Tools</h2>
        <p style={descStyle}>Seed demo data and add bot opponents for local testing.</p>
        <div style={{ marginBottom: 12 }}>
          <button style={btnStyle(fixtureState.loading)} disabled={fixtureState.loading}
            onClick={() => run('/api/admin/demo/fixtures', setFixtureState)}>
            {fixtureState.loading ? 'Seeding…' : 'Seed Demo Fixtures'}
          </button>
          {fixtureState.result && <p style={successStyle}>✓ Demo fixtures seeded.</p>}
          {fixtureState.error && <p style={errorStyle}>✗ {fixtureState.error}</p>}
        </div>
        <div style={{ marginBottom: 12 }}>
          <button style={btnOutlineStyle(false)} onClick={() => {
            localStorage.removeItem('md_onboarding_v1');
            window.location.href = '/play?onboarding=1';
          }}>
            Trigger Onboarding
          </button>
          <p style={{ ...mutedStyle, marginTop: 4, fontSize: 11 }}>
            Clears the &ldquo;seen&rdquo; flag and opens the 3-step onboarding overlay.
          </p>
        </div>
        {pending.length > 0 && pending.map(m => {
          const s = joinState[m.matchupId] ?? idle;
          return (
            <div key={m.matchupId} style={matchupRowStyle}>
              <div style={{ flex: 1, fontSize: 13, color: '#1e293b' }}>
                <code style={codeStyle}>{m.inviteCode}</code>
                {s.result && <span style={successStyle}> ✓ Bot joined</span>}
                {s.error && <span style={errorStyle}> ✗ {s.error}</span>}
              </div>
              <button style={btnSmStyle(s.loading || !!s.result)} disabled={s.loading || !!s.result}
                onClick={async () => {
                  setJoinState(p => ({ ...p, [m.matchupId]: { loading: true, result: null, error: null } }));
                  try {
                    const res = await fetch('/api/admin/demo/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchupId: m.matchupId }) });
                    const data = await res.json();
                    if (data.ok) { setJoinState(p => ({ ...p, [m.matchupId]: { loading: false, result: data, error: null } })); await loadAll(); }
                    else setJoinState(p => ({ ...p, [m.matchupId]: { loading: false, result: null, error: data.error ?? 'Failed' } }));
                  } catch (e) { setJoinState(p => ({ ...p, [m.matchupId]: { loading: false, result: null, error: String(e) } })); }
                }}>
                {s.loading ? '…' : s.result ? 'Done' : 'Add Bot'}
              </button>
            </div>
          );
        })}
        {active.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {active.map(m => (
              <div key={m.matchupId} style={{ ...matchupRowStyle, opacity: 0.6 }}>
                <span style={{ fontSize: 13, color: '#1e293b' }}>vs {m.opponentDisplayName ?? m.opponentEmail}</span>
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
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ? '#dc2626' : '#0f172a' }}>{value}</div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = { maxWidth: 660, margin: '0 auto', padding: '32px 20px', fontFamily: "'Helvetica Neue',Arial,sans-serif" };
const sectionStyle: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 22px', marginBottom: 16 };
const headingStyle: React.CSSProperties = { margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: '#0f172a' };
const descStyle: React.CSSProperties = { margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 };
const mutedStyle: React.CSSProperties = { margin: 0, fontSize: 13, color: '#64748b' };
const successStyle: React.CSSProperties = { marginTop: 6, fontSize: 12, color: '#16a34a', fontWeight: 500, display: 'inline-block' };
const errorStyle: React.CSSProperties = { marginTop: 6, fontSize: 12, color: '#dc2626', fontWeight: 500, display: 'inline-block' };
const backLinkStyle: React.CSSProperties = { fontSize: 13, color: '#64748b', textDecoration: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px' };
const statGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 };
const statStyle: React.CSSProperties = { background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' };
const matchupRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', marginBottom: 6 };
const codeStyle: React.CSSProperties = { background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px', fontSize: 12, fontFamily: 'monospace' };
const liveRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px' };
const liveTeamStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', flex: 1 };
const liveScoreStyle: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: '#dc2626', minWidth: 60, textAlign: 'center' as const };
const pickRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' };
const editBoxStyle: React.CSSProperties = { background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' as const, gap: 4, fontSize: 12, color: '#475569', fontWeight: 500 };
const numInputStyle: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 8px', fontSize: 14, width: 80, fontFamily: 'inherit' };

function roundRowStyle(complete: boolean, current: boolean): React.CSSProperties {
  return { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: 6, background: complete ? '#f0fdf4' : current ? '#eff6ff' : '#fff', border: `1px solid ${complete ? '#bbf7d0' : current ? '#bfdbfe' : '#e2e8f0'}` };
}
function btnStyle(disabled: boolean): React.CSSProperties {
  return { background: disabled ? '#94a3b8' : '#1e40af', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' };
}
function btnOutlineStyle(disabled: boolean): React.CSSProperties {
  return { ...btnStyle(disabled), background: 'white', color: disabled ? '#94a3b8' : '#1e40af', border: `1px solid ${disabled ? '#cbd5e1' : '#1e40af'}` };
}
function btnSmStyle(disabled: boolean): React.CSSProperties {
  return { ...btnStyle(disabled), padding: '5px 10px', fontSize: 12, flexShrink: 0 };
}
function btnDangerSmStyle(disabled: boolean): React.CSSProperties {
  return { ...btnSmStyle(disabled), background: disabled ? '#94a3b8' : '#7f1d1d', fontSize: 11, padding: '3px 8px' };
}
