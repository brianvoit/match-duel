'use client';

import {
  Fixture,
  Matchup,
  Round,
  ParticipantStanding,
  RoundResultEntry,
} from '@/app/components/playground-types';
import { STAGE_POINTS, fmtStage, initials, computePickPoints } from '@/app/components/playground-utils';
import { avatarColor } from '@/lib/avatar-color';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScoreChartModalProps {
  standing: ParticipantStanding[];
  roundResults: RoundResultEntry[];
  allRounds: Round[];
  fixtures: Fixture[];
  completedRoundFixtures: Record<string, Fixture[]>;
  pickMap: Record<string, 'HOME' | 'AWAY'>;
  provisionalPoints: { mine: number; opp: number };
  currentRound: Round | null;
  selectedMatchup: Matchup;
  userAvatarUrl?: string | null;
  oppAvatarUrl: string | null;
  userEmail: string;
  displayName: string;
  onClose: () => void;
}

type ChartPoint = { label: string; myCum: number; oppCum: number; played: boolean; stageStart?: string };

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGE_MOBILE_LABEL: Record<string, string> = {
  GROUP: 'GS', ROUND_OF_32: 'R32', ROUND_OF_16: 'R16',
  QUARTERFINAL: 'QF', SEMIFINAL: 'SF', THIRD_PLACE: '3rd', FINAL: 'Final',
};

// Short round labels for the vertical round-boundary markers on the chart.
const STAGE_ABBR: Record<string, string> = {
  ROUND_OF_32: 'Ro32', ROUND_OF_16: 'Ro16', QUARTERFINAL: 'QF',
  SEMIFINAL: 'SF', THIRD_PLACE: '3P', FINAL: 'F',
};
const KO_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL'];

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
  return { step, toX, toY, yTicks, played, cH, cW };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ScoreChartModal({
  standing, roundResults, allRounds, fixtures, completedRoundFixtures, pickMap,
  provisionalPoints, currentRound, selectedMatchup,
  userAvatarUrl, oppAvatarUrl, userEmail, displayName,
  onClose,
}: ScoreChartModalProps) {
  // Resolve by email, not myParticipantId: that id only gets populated from the
  // CURRENT round's pick-order fetch, which is skipped once a matchup's
  // tournament is fully complete (no current round left) — leaving it null and
  // silently zeroing this player's total.
  const me  = standing.find(s => s.email === userEmail);
  const opp = standing.find(s => s.email !== userEmail);
  // Settled tournament points + live provisional from the current round's finals,
  // matching the header H2H scorebug.
  const myPts  = (me?.tournamentPoints  ?? 0) + provisionalPoints.mine;
  const oppPts = (opp?.tournamentPoints ?? 0) + provisionalPoints.opp;
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
        <div className="wc-modal wc-modal--wide wc-score-modal">
          <div className="wc-score-modal-close-row">
            <button className="wc-topbar-icon-btn" aria-label="Close" onClick={onClose}>✕</button>
          </div>
          <div className="wc-score-modal-body" style={{ textAlign: 'center' }}>
            <p className="wc-subtitle">No matchday data yet. Scores will appear once rounds are scored.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Build one matchday series across the whole tournament ────────────────────
  // "Matchday" = the Nth day on which any match was played (rest days excluded),
  // spanning the group stage AND the knockout rounds — so the chart shows the
  // granular per-day progression the tournament actually has, not just the group
  // stage with the knockouts collapsed to one point each. Points/goals per
  // matchday are summed per fixture using that fixture's own stage.
  const stageByRoundId = new Map(allRounds.map(r => [r.id, r.stage as string]));
  const allFx: { f: Fixture; stage: string }[] = [];
  if (currentRound) for (const f of fixtures) allFx.push({ f, stage: currentRound.stage });
  for (const [rid, fxs] of Object.entries(completedRoundFixtures)) {
    if (rid === currentRound?.id) continue;
    const stage = stageByRoundId.get(rid);
    if (!stage) continue;
    for (const f of fxs) allFx.push({ f, stage });
  }

  // Matchday index = position of a fixture's local playing-day among all distinct
  // playing days (1-based), so rest days don't advance the count.
  const localDayMs = (s: string) => { const d = new Date(s); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const distinctDays = [...new Set(allFx.map(x => localDayMs(x.f.startsAt)))].sort((a, b) => a - b);
  const matchdayOf = new Map(distinctDays.map((t, i) => [t, i + 1]));

  const byMatchday = new Map<number, { f: Fixture; stage: string }[]>();
  for (const x of allFx) {
    const md = matchdayOf.get(localDayMs(x.f.startsAt))!;
    (byMatchday.get(md) ?? byMatchday.set(md, []).get(md)!).push(x);
  }
  const sortedMatchdays = [...byMatchday.entries()].sort(([a], [b]) => a - b);

  // First matchday each knockout round appears on → a labelled vertical marker.
  const stageStartByMd = new Map<number, string>();
  for (const stage of KO_ORDER) {
    const entry = sortedMatchdays.find(([, xs]) => xs.some(x => x.stage === stage));
    if (entry && !stageStartByMd.has(entry[0])) stageStartByMd.set(entry[0], STAGE_ABBR[stage]);
  }

  // ── Points chart data ────────────────────────────────────────────────────────

  let ptsMyCum = 0, ptsOppCum = 0;
  const ptsData: ChartPoint[] = [];
  for (const [md, xs] of sortedMatchdays) {
    let myMd = 0, oppMd = 0;
    for (const { f, stage } of xs) {
      const myPick = pickMap[f.id] ?? f.myPickSide;
      myMd  += computePickPoints(f, myPick,             stage) ?? 0;
      oppMd += computePickPoints(f, f.opponentPickSide, stage) ?? 0;
    }
    ptsMyCum += myMd; ptsOppCum += oppMd;
    ptsData.push({ label: `MD${md}`, myCum: ptsMyCum, oppCum: ptsOppCum, played: xs.some(x => x.f.status === 'FINAL'), stageStart: stageStartByMd.get(md) });
  }

  // ── Goals chart data ─────────────────────────────────────────────────────────

  let goalsMyC = 0, goalsOppC = 0;
  const goalsData: ChartPoint[] = [];
  for (const [md, xs] of sortedMatchdays) {
    let myMd = 0, oppMd = 0;
    for (const { f } of xs) {
      if (f.status !== 'FINAL' || f.homeScore === null || f.awayScore === null) continue;
      const myPick = pickMap[f.id] ?? f.myPickSide;
      if (myPick) myMd += myPick === 'HOME' ? f.homeScore : f.awayScore;
      if (f.opponentPickSide) oppMd += f.opponentPickSide === 'HOME' ? f.homeScore : f.awayScore;
    }
    goalsMyC += myMd; goalsOppC += oppMd;
    goalsData.push({ label: `MD${md}`, myCum: goalsMyC, oppCum: goalsOppC, played: xs.some(x => x.f.status === 'FINAL'), stageStart: stageStartByMd.get(md) });
  }

  // ── SVG layout constants ─────────────────────────────────────────────────────

  // PT leaves a band above the plot for the round labels (Ro32, Ro16 …).
  const W = 520, H = 200, PL = 36, PR = 16, PT = 30, PB = 36;
  const myColor  = 'var(--accent)';
  const oppColor = 'var(--chart-line-opp)';

  const pts   = buildChart(W, H, PL, PR, PT, PB, ptsData);
  const goals = buildChart(W, H, PL, PR, PT, PB, goalsData);

  const avatarCell = (url: string | null | undefined, initial: string, seed?: string | null) =>
    url
      ? <img src={url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto' }} referrerPolicy="no-referrer" />
      : <span style={{ display: 'block', textAlign: 'center', fontWeight: 700, fontSize: '0.75rem', width: 20, height: 20, borderRadius: '50%', background: avatarColor(seed), color: '#fff', lineHeight: '20px', margin: '0 auto' }}>{initial}</span>;

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
      const myE  = result?.participants.find(p => p.email === userEmail);
      const oppE = result?.participants.find(p => p.email !== userEmail);
      const isCurrent = round.stage === currentStage;
      // Settled rounds use the official result; the in-progress round uses the live
      // provisional points (it won't settle until every fixture in it is final).
      return {
        label:      fmtStage(round.stage),
        shortLabel: STAGE_MOBILE_LABEL[round.stage] ?? fmtStage(round.stage),
        total, remaining, points: remaining * pts2,
        myPts:  result ? (myE?.points  ?? 0) : isCurrent ? provisionalPoints.mine : null,
        oppPts: result ? (oppE?.points ?? 0) : isCurrent ? provisionalPoints.opp  : null,
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

    // Label condensing: when step gets small, skip intermediate matchday labels.
    // Round boundaries are shown as separate vertical markers (below), so we don't
    // force a matchday label at them — that caused adjacent labels to collide.
    const labelEvery = c.step < 30 ? 3 : c.step < 44 ? 2 : 1;
    const showLabel = (i: number) => i === 0 || i % labelEvery === 0;

    const baseline = PT + c.cH;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>

        {/* Horizontal y-axis grid lines */}
        {c.yTicks.map(v => (
          <g key={`${prefix}y-${v}`}>
            <line x1={PL} y1={c.toY(v)} x2={W - PR} y2={c.toY(v)}
              stroke="var(--line)" strokeWidth={v === 0 ? 1.5 : 0.6} />
            <text x={PL - 5} y={c.toY(v) + 4} textAnchor="end" fontSize={9} fill="var(--text-2)">{v}</text>
          </g>
        ))}

        {/* Subtle vertical grid lines at every x position */}
        {data.map((d, i) => (
          <line key={`${prefix}vgrid-${i}`}
            x1={c.toX(i).toFixed(1)} y1={PT}
            x2={c.toX(i).toFixed(1)} y2={baseline}
            stroke="var(--line)" strokeWidth={0.6} opacity={0.55}
          />
        ))}

        {/* Round-boundary markers — a dashed vertical line through the plot plus a
            round label (Ro32, Ro16, QF, SF, 3P, F) in the band ABOVE the chart. */}
        {data.map((d, i) => d.stageStart && (
          <g key={`${prefix}mk-${i}`}>
            <line x1={(c.toX(i) - c.step / 2).toFixed(1)} y1={PT - 12}
              x2={(c.toX(i) - c.step / 2).toFixed(1)} y2={baseline}
              stroke="var(--line)" strokeWidth={1.2} strokeDasharray="4 3" />
            <text x={(c.toX(i) - c.step / 2).toFixed(1)} y={PT - 16} textAnchor="middle"
              fontSize={8} fontWeight={600} fill="var(--text-2)">{d.stageStart}</text>
          </g>
        ))}

        {/* Tick marks on x-axis baseline */}
        {data.map((d, i) => (
          <line key={`${prefix}tick-${i}`}
            x1={c.toX(i).toFixed(1)} y1={baseline}
            x2={c.toX(i).toFixed(1)} y2={(baseline + 4).toFixed(1)}
            stroke="var(--text-2)" strokeWidth={1}
          />
        ))}

        {/* X-axis labels — condensed when crowded */}
        {data.map((d, i) => showLabel(i) && (
          <text key={`${prefix}x-${i}`} x={c.toX(i)} y={H - 6} textAnchor="middle" fontSize={8.5}
            fill={d.played ? 'var(--text-1)' : 'var(--text-2)'}>{d.label}</text>
        ))}

        {/* Data lines */}
        {oppLine && <polyline points={oppLine} fill="none" stroke={oppColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />}
        {myLine  && <polyline points={myLine}  fill="none" stroke={myColor}  strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}

        {/* Data point dots */}
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
    <div className="wc-modal-backdrop wc-chart-modal-backdrop" role="dialog" aria-modal="true" aria-label="Score breakdown"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wc-modal wc-modal--wide wc-score-modal">

        {/* Nav bar — scorebug as the title, never scrolls */}
        <div className="wc-score-modal-nav">
          <button className="wc-topbar-icon-btn" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3 L5 8 L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div className="wc-h2h wc-h2h--nav">
            <div className="wc-h2h-player">
              <span className="wc-h2h-name">
                <span className="wc-h2h-name--full">{myName}</span>
                <span className="wc-h2h-name--first">{myName.split(' ')[0]}</span>
              </span>
              {userAvatarUrl
                ? <img className="wc-h2h-avatar" src={userAvatarUrl} alt={myName} referrerPolicy="no-referrer" />
                : <span className="wc-h2h-avatar wc-h2h-avatar--me" style={{ background: avatarColor(userEmail) }}>{myInit}</span>}
            </div>
            <div className="wc-h2h-score">
              <span className={myPts > oppPts ? 'wc-h2h-pts--leading' : myPts < oppPts ? 'wc-h2h-pts--trailing' : ''}>{myPts}</span>
              <span className="wc-h2h-sep">–</span>
              <span className={oppPts > myPts ? 'wc-h2h-pts--leading' : oppPts < myPts ? 'wc-h2h-pts--trailing' : ''}>{oppPts}</span>
            </div>
            <div className="wc-h2h-player wc-h2h-player--right">
              <span className="wc-h2h-name">
                <span className="wc-h2h-name--full">{oppName}</span>
                <span className="wc-h2h-name--first">{oppName.split(' ')[0]}</span>
              </span>
              {oppAvatarUrl
                ? <img className="wc-h2h-avatar" src={oppAvatarUrl} alt={oppName} referrerPolicy="no-referrer" />
                : <span className="wc-h2h-avatar wc-h2h-avatar--opp" style={{ background: avatarColor(selectedMatchup.opponentEmail) }}>{oppInit}</span>}
            </div>
          </div>

          <div style={{ width: 34 }} />
        </div>

        {/* Scrollable body */}
        <div className="wc-score-modal-body">

        {/* Points chart */}
        <h3 className="wc-chart-heading">Score by Matchday</h3>
        <div className="wc-chart-wrap">{renderChart(ptsData, pts, 'pts-')}</div>

        {/* Goals chart — always shown */}
        <h3 className="wc-chart-heading">Goals Scored</h3>
        <div className="wc-chart-wrap">{renderChart(goalsData, goals, 'goals-')}</div>

        {/* Single shared legend for both charts */}
        <div className="wc-chart-legend">
          <span className="wc-chart-legend-item"><span className="wc-chart-legend-dot" style={{ background: myColor }} />{myName}</span>
          <span className="wc-chart-legend-item"><span className="wc-chart-legend-dot" style={{ background: oppColor }} />{oppName}</span>
        </div>

        {/* Stakes table */}
        <div className="wc-score-modal-table-wrap">
        <table className="wc-round-table wc-stakes-table">
          <colgroup>
            <col style={{ width: '20%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} />
          </colgroup>
          <thead>
            <tr>
              <th></th><th>G</th><th>Left</th><th>Avail</th>
              <th>{avatarCell(userAvatarUrl, (displayName || userEmail).charAt(0).toUpperCase(), userEmail)}</th>
              <th>{avatarCell(oppAvatarUrl, initials(selectedMatchup.opponentDisplayName || selectedMatchup.opponentEmail || 'O'), selectedMatchup.opponentEmail)}</th>
            </tr>
          </thead>
          <tbody>
            {stakeRows.map(r => (
              <tr key={r.label}>
                <td className="wc-stakes-stage">
                  <span className="wc-stakes-stage-full">{r.label}</span>
                  <span className="wc-stakes-stage-short">{r.shortLabel}</span>
                </td>
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
        </div>{/* end table-wrap */}

        </div>{/* end wc-score-modal-body */}
      </div>
    </div>
  );
}
