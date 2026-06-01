'use client';

import {
  Fixture,
  Matchup,
  Round,
  ParticipantStanding,
  RoundResultEntry,
} from '@/app/components/playground-types';
import { STAGE_POINTS, fmtStage, initials, computePickPoints } from '@/app/components/playground-utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScoreChartModalProps {
  standing: ParticipantStanding[];
  roundResults: RoundResultEntry[];
  allRounds: Round[];
  fixtures: Fixture[];
  completedRoundFixtures: Record<string, Fixture[]>;
  pickMap: Record<string, 'HOME' | 'AWAY'>;
  myParticipantId: string | null;
  currentRound: Round | null;
  selectedMatchup: Matchup;
  userAvatarUrl?: string | null;
  oppAvatarUrl: string | null;
  userEmail: string;
  displayName: string;
  onClose: () => void;
}

type ChartPoint = { label: string; myCum: number; oppCum: number; played: boolean; isStage?: boolean };

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGE_ABBR: Record<string, string> = {
  GROUP: 'GS', ROUND_OF_32: 'Ro32', ROUND_OF_16: 'Ro16',
  QUARTERFINAL: 'QF', SEMIFINAL: 'SF', THIRD_PLACE: '3P', FINAL: 'F',
};

const KNOCKOUT_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];

const STAGE_GAME_COUNTS: Record<string, number> = {
  GROUP: 72, ROUND_OF_32: 16, ROUND_OF_16: 8,
  QUARTERFINAL: 4, SEMIFINAL: 2, THIRD_PLACE: 1, FINAL: 1,
};

// ── Chart helpers ──────────────────────────────────────────────────────────────

function buildChart(
  W: number, H: number, PL: number, PR: number, PT: number, PB: number,
  data: ChartPoint[]
) {
  const cW = W - PL - PR;
  const cH = H - PT - PB;
  const n = data.length;
  const step = n > 1 ? cW / (n - 1) : cW;
  const toX = (i: number) => PL + i * step;
  const maxVal = Math.max(...data.map(d => Math.max(d.myCum, d.oppCum)), 4) * 1.12;
  const toY = (v: number) => PT + cH - (v / maxVal) * cH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(maxVal * f));
  const played = data.map((d, i) => ({ ...d, i })).filter(d => d.played);
  const koIdx = data.findIndex(d => d.isStage);
  return { step, toX, toY, yTicks, played, koIdx, cH, cW };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScoreChartModal({
  standing, roundResults, allRounds, fixtures, completedRoundFixtures, pickMap,
  myParticipantId, currentRound, selectedMatchup,
  userAvatarUrl, oppAvatarUrl, userEmail, displayName,
  onClose,
}: ScoreChartModalProps) {
  const me  = standing.find(s => s.participantId === myParticipantId);
  const opp = standing.find(s => s.participantId !== myParticipantId);
  const myPts  = me?.tournamentPoints  ?? 0;
  const oppPts = opp?.tournamentPoints ?? 0;
  const myName  = displayName || userEmail.split('@')[0];
  const oppName = selectedMatchup.opponentDisplayName ?? selectedMatchup.opponentEmail?.split('@')[0] ?? 'Opponent';
  const myInit  = initials(myName);
  const oppInit = initials(oppName);

  const rounds = allRounds.length
    ? allRounds
    : roundResults.map(r => ({
        id: r.roundId, stage: r.stage, order_index: r.orderIndex,
        is_complete: true, starts_at: null, ends_at: null,
      }));

  if (!rounds.length) {
    return (
      <div className="wc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Score breakdown"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="wc-modal wc-modal--wide" style={{ textAlign: 'center', padding: '24px 0' }}>
          <button className="wc-topbar-icon-btn" aria-label="Close" onClick={onClose}
            style={{ position: 'absolute', top: 12, right: 12 }}>✕</button>
          <p className="wc-subtitle">No matchday data yet. Scores will appear once rounds are scored.</p>
        </div>
      </div>
    );
  }

  const resultMap = new Map(roundResults.map(r => [r.stage, r]));

  // ── Build matchday groups from GROUP round fixtures ──────────────────────────
  // Use completedRoundFixtures so all 3 matchdays show on the chart, not just
  // the current round. Falls back to current `fixtures` if group data absent.

  const groupRound = allRounds.find(r => r.stage === 'GROUP');
  const groupFixtures = groupRound
    ? (completedRoundFixtures[groupRound.id] ?? fixtures)
    : fixtures;

  const mdGroups = new Map<number, Fixture[]>();
  for (const f of groupFixtures) {
    const md = f.matchday ?? 1;
    if (!mdGroups.has(md)) mdGroups.set(md, []);
    mdGroups.get(md)!.push(f);
  }
  const sortedMds = [...mdGroups.entries()].sort(([a], [b]) => a - b);

  // ── Points chart data ────────────────────────────────────────────────────────

  let ptsMyCum = 0, ptsOppCum = 0;
  const ptsData: ChartPoint[] = [];

  for (const [md, mdFix] of sortedMds) {
    let myMd = 0, oppMd = 0;
    for (const f of mdFix) {
      const myPick = pickMap[f.id] ?? f.myPickSide;
      // Always use GROUP stage points for group stage fixtures
      myMd  += computePickPoints(f, myPick,             'GROUP') ?? 0;
      oppMd += computePickPoints(f, f.opponentPickSide, 'GROUP') ?? 0;
    }
    ptsMyCum += myMd; ptsOppCum += oppMd;
    ptsData.push({ label: `MD${md}`, myCum: ptsMyCum, oppCum: ptsOppCum, played: mdFix.some(f => f.status === 'FINAL') });
  }
  for (const stage of KNOCKOUT_ORDER) {
    const result = resultMap.get(stage);
    const myE  = result?.participants.find(p => p.participantId === myParticipantId);
    const oppE = result?.participants.find(p => p.participantId !== myParticipantId);
    if (result) { ptsMyCum += myE?.points ?? 0; ptsOppCum += oppE?.points ?? 0; }
    const inAll = allRounds.some(r => r.stage === stage);
    if (inAll || result) ptsData.push({ label: STAGE_ABBR[stage] ?? stage, myCum: ptsMyCum, oppCum: ptsOppCum, played: Boolean(result), isStage: true });
  }

  // ── Goals chart data ─────────────────────────────────────────────────────────

  let goalsMyC = 0, goalsOppC = 0;
  const goalsData: ChartPoint[] = [];

  for (const [md, mdFix] of sortedMds) {
    let myMd = 0, oppMd = 0;
    for (const f of mdFix) {
      if (f.status !== 'FINAL' || f.homeScore === null || f.awayScore === null) continue;
      const myPick = pickMap[f.id] ?? f.myPickSide;
      if (myPick) myMd += myPick === 'HOME' ? f.homeScore : f.awayScore;
      if (f.opponentPickSide) oppMd += f.opponentPickSide === 'HOME' ? f.homeScore : f.awayScore;
    }
    goalsMyC += myMd; goalsOppC += oppMd;
    goalsData.push({ label: `MD${md}`, myCum: goalsMyC, oppCum: goalsOppC, played: mdFix.some(f => f.status === 'FINAL') });
  }
  for (const stage of KNOCKOUT_ORDER) {
    const result = resultMap.get(stage);
    const myE  = result?.participants.find(p => p.participantId === myParticipantId);
    const oppE = result?.participants.find(p => p.participantId !== myParticipantId);
    if (result) { goalsMyC += myE?.tiebreakGoals ?? 0; goalsOppC += oppE?.tiebreakGoals ?? 0; }
    const inAll = allRounds.some(r => r.stage === stage);
    if (inAll || result) goalsData.push({ label: STAGE_ABBR[stage] ?? stage, myCum: goalsMyC, oppCum: goalsOppC, played: Boolean(result), isStage: true });
  }

  // ── SVG layout constants ─────────────────────────────────────────────────────

  const W = 520, H = 190, PL = 36, PR = 16, PT = 16, PB = 36;
  const myColor  = 'var(--accent)';
  const oppColor = '#94a3b8';

  const pts   = buildChart(W, H, PL, PR, PT, PB, ptsData);
  const goals = buildChart(W, H, PL, PR, PT, PB, goalsData);

  const avatarCell = (url: string | null | undefined, initial: string) =>
    url
      ? <img src={url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto' }} referrerPolicy="no-referrer" />
      : <span style={{ display: 'block', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem' }}>{initial}</span>;

  // ── Stakes table ─────────────────────────────────────────────────────────────

  const settledStages = new Set(roundResults.map(r => r.stage));
  const resultByStage = new Map(roundResults.map(r => [r.stage, r]));
  const currentStage    = currentRound?.stage;
  const currentRemaining = fixtures.filter(f => f.status !== 'FINAL').length;

  const stakeRows = [...allRounds]
    .sort((a, b) => a.order_index - b.order_index)
    .map(round => {
      const total = STAGE_GAME_COUNTS[round.stage] ?? 0;
      const pts2  = STAGE_POINTS[round.stage] ?? 1;
      const remaining = settledStages.has(round.stage) ? 0
        : round.stage === currentStage ? currentRemaining
        : total;
      const result = resultByStage.get(round.stage);
      const myE  = result?.participants.find(p => p.participantId === myParticipantId);
      const oppE = result?.participants.find(p => p.participantId !== myParticipantId);
      return {
        label: fmtStage(round.stage),
        total, remaining, points: remaining * pts2,
        myPts:  result ? (myE?.points  ?? 0) : null,
        oppPts: result ? (oppE?.points ?? 0) : null,
      };
    });

  const totals = stakeRows.reduce(
    (acc, r) => ({ total: acc.total + r.total, remaining: acc.remaining + r.remaining,
      points: acc.points + r.points, myPts: acc.myPts + (r.myPts ?? 0), oppPts: acc.oppPts + (r.oppPts ?? 0) }),
    { total: 0, remaining: 0, points: 0, myPts: 0, oppPts: 0 }
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  function renderChart(
    data: ChartPoint[],
    c: ReturnType<typeof buildChart>,
    prefix: string
  ) {
    const myLine  = c.played.map(d => `${c.toX(d.i).toFixed(1)},${c.toY(d.myCum).toFixed(1)}`).join(' ');
    const oppLine = c.played.map(d => `${c.toX(d.i).toFixed(1)},${c.toY(d.oppCum).toFixed(1)}`).join(' ');
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {c.yTicks.map(v => (
          <g key={`${prefix}y-${v}`}>
            <line x1={PL} y1={c.toY(v)} x2={W - PR} y2={c.toY(v)} stroke="var(--line)" strokeWidth={v === 0 ? 1.5 : 0.8} />
            <text x={PL - 5} y={c.toY(v) + 4} textAnchor="end" fontSize={9} fill="var(--text-2)">{v}</text>
          </g>
        ))}
        {c.koIdx > 0 && (
          <line x1={c.toX(c.koIdx) - c.step / 2} y1={PT} x2={c.toX(c.koIdx) - c.step / 2} y2={PT + c.cH}
            stroke="var(--line)" strokeWidth={1} strokeDasharray="4 3" />
        )}
        {data.map((d, i) => (
          <text key={`${prefix}x-${i}`} x={c.toX(i)} y={H - 6} textAnchor="middle" fontSize={8.5}
            fill={d.played ? 'var(--text-1)' : 'var(--text-2)'}>{d.label}</text>
        ))}
        {oppLine && <polyline points={oppLine} fill="none" stroke={oppColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />}
        {myLine  && <polyline points={myLine}  fill="none" stroke={myColor}  strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
        {c.played.map(d => (
          <g key={`${prefix}dot-${d.i}`}>
            <circle cx={c.toX(d.i)} cy={c.toY(d.myCum)}  r={3.5} fill={myColor} />
            <circle cx={c.toX(d.i)} cy={c.toY(d.oppCum)} r={3}   fill={oppColor} opacity={0.8} />
          </g>
        ))}
      </svg>
    );
  }

  const legend = (suffix?: string) => (
    <div className="wc-chart-legend">
      <span className="wc-chart-legend-item">
        <span className="wc-chart-legend-dot" style={{ background: myColor }} />
        {myName}{suffix ? `: ${suffix}` : ''}
      </span>
      <span className="wc-chart-legend-item">
        <span className="wc-chart-legend-dot" style={{ background: oppColor }} />
        {oppName}{suffix ? `: ${suffix.replace(/\d+/, String(goalsOppC))}` : ''}
      </span>
    </div>
  );

  return (
    <div className="wc-modal-backdrop" role="dialog" aria-modal="true" aria-label="Score breakdown"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wc-modal wc-modal--wide">
        <button className="wc-topbar-icon-btn" aria-label="Close" onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 12 }}>✕</button>

        {/* H2H scorebug */}
        <div className="wc-chart-scorebug-wrap">
          <div className="wc-h2h">
            <div className="wc-h2h-player">
              <span className="wc-h2h-name">{myName}</span>
              {userAvatarUrl
                ? <img className="wc-h2h-avatar" src={userAvatarUrl} alt={myName} referrerPolicy="no-referrer" />
                : <span className="wc-h2h-avatar wc-h2h-avatar--me">{myInit}</span>}
            </div>
            <div className="wc-h2h-score">
              <span className={myPts > oppPts ? 'wc-h2h-pts--leading' : myPts < oppPts ? 'wc-h2h-pts--trailing' : ''}>{myPts}</span>
              <span className="wc-h2h-sep">–</span>
              <span className={oppPts > myPts ? 'wc-h2h-pts--leading' : oppPts < myPts ? 'wc-h2h-pts--trailing' : ''}>{oppPts}</span>
            </div>
            <div className="wc-h2h-player wc-h2h-player--right">
              <span className="wc-h2h-name">{oppName}</span>
              {oppAvatarUrl
                ? <img className="wc-h2h-avatar" src={oppAvatarUrl} alt={oppName} referrerPolicy="no-referrer" />
                : <span className="wc-h2h-avatar wc-h2h-avatar--opp">{oppInit}</span>}
            </div>
          </div>
        </div>

        {/* Points chart */}
        <h3 className="wc-chart-heading">Score by Matchday</h3>
        <div className="wc-chart-wrap">{renderChart(ptsData, pts, 'pts-')}</div>
        <div className="wc-chart-legend">
          <span className="wc-chart-legend-item"><span className="wc-chart-legend-dot" style={{ background: myColor }} />{myName}</span>
          <span className="wc-chart-legend-item"><span className="wc-chart-legend-dot" style={{ background: oppColor }} />{oppName}</span>
        </div>

        {/* Goals chart */}
        {goalsData.some(d => d.played) && (
          <>
            <h3 className="wc-chart-heading" style={{ marginTop: 8 }}>Goals Scored by Picks</h3>
            <div className="wc-chart-wrap">{renderChart(goalsData, goals, 'goals-')}</div>
            <div className="wc-chart-legend">
              <span className="wc-chart-legend-item"><span className="wc-chart-legend-dot" style={{ background: myColor }} />{myName}: {goalsMyC} goals</span>
              <span className="wc-chart-legend-item"><span className="wc-chart-legend-dot" style={{ background: oppColor }} />{oppName}: {goalsOppC} goals</span>
            </div>
          </>
        )}

        {/* Stakes table */}
        <table className="wc-round-table wc-stakes-table">
          <colgroup>
            <col style={{ width: '30%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th><th>Games</th><th>Remaining</th><th>Points</th>
              <th>{avatarCell(userAvatarUrl, (displayName || userEmail).charAt(0).toUpperCase())}</th>
              <th>{avatarCell(oppAvatarUrl, initials(selectedMatchup.opponentDisplayName || selectedMatchup.opponentEmail || 'O'))}</th>
            </tr>
          </thead>
          <tbody>
            {stakeRows.map(r => (
              <tr key={r.label}>
                <td className="wc-stakes-stage">{r.label}</td>
                <td>{r.total}</td><td>{r.remaining}</td><td>{r.points}</td>
                <td>{r.myPts  !== null ? r.myPts  : '—'}</td>
                <td>{r.oppPts !== null ? r.oppPts : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td></td>
              <td><strong>{totals.total}</strong></td><td><strong>{totals.remaining}</strong></td><td><strong>{totals.points}</strong></td>
              <td><strong>{totals.myPts}</strong></td><td><strong>{totals.oppPts}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
