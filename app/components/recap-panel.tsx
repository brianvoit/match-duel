'use client';

import { teamFlag } from '@/lib/data/teamInfo';
import { MatchHeader } from '@/app/components/match-header';
import type { Fixture, RecapData, EventsData } from '@/app/components/playground-types';

interface RecapPanelProps {
  selectedFixture: Fixture | null;
  recapData: RecapData | null;
  eventsData: EventsData | null;
  recapLoading: boolean;
}

// Extracted verbatim from Playground.renderRecap — a pure move (props in, JSX out).
export function RecapPanel({ selectedFixture, recapData, eventsData, recapLoading }: RecapPanelProps) {
  if (!selectedFixture) {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle">Select a fixture to view the recap.</p>
      </div>
    );
  }
  if (selectedFixture.status !== 'FINAL' && selectedFixture.status !== 'LIVE') {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>
          Stats will be available once the match is underway.
        </p>
      </div>
    );
  }
  if (recapLoading) {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>Loading stats…</p>
      </div>
    );
  }
  // Team names come from stats when present (API spelling that matches the
  // event feed), else from our fixture.
  const homeTeam = recapData?.homeTeam ?? selectedFixture.homeTeam;
  const awayTeam = recapData?.awayTeam ?? selectedFixture.awayTeam;
  const isFinal = selectedFixture.status === 'FINAL';

  // ── Timeline ────────────────────────────────────────────────────────────
  const allEvents = eventsData?.available ? eventsData.events : [];
  const isShootoutKick = (e: typeof allEvents[number]) =>
    (e.comments ?? '').toLowerCase().includes('shootout');
  // Shootout kicks are pulled out of the minute-by-minute timeline and shown in
  // their own breakdown section.
  const shootoutKicks = allEvents.filter(isShootoutKick);
  const timeline = allEvents.filter(e => !isShootoutKick(e));
  const maxMinute = timeline.reduce((m, e) => Math.max(m, (e.minute ?? 0) + (e.extraMinute ?? 0)), 0);

  // ── Build enhanced timeline with period markers ────────────────
  type TLItem = (typeof timeline)[number] & { _periodLabel?: string };
  const enhancedTimeline: TLItem[] = [];
  const mkPeriod = (label: string, minute: number): TLItem =>
    ({ type: 'PERIOD' as unknown as 'Var', _periodLabel: label, player: '', assist: null, detail: label, team: '', minute, extraMinute: null, comments: null });

  let halfAdded = false, fullAdded = false, et1Added = false;

  // Match Start — always shown once a match is underway.
  enhancedTimeline.push(mkPeriod('Kick Off', 0));

  for (const ev of timeline) {
    if (!halfAdded && ev.minute > 45 && !ev.extraMinute) { enhancedTimeline.push(mkPeriod('Half Time', 45)); halfAdded = true; }
    if (!fullAdded && isFinal && ev.minute > 90 && !ev.extraMinute) { enhancedTimeline.push(mkPeriod('Full Time', 90)); fullAdded = true; }
    if (!et1Added && ev.minute > 105 && !ev.extraMinute) { enhancedTimeline.push(mkPeriod('End of Extra Time 1', 105)); et1Added = true; }
    enhancedTimeline.push(ev as TLItem);
  }
  // Only add markers the match has actually reached — never show Half Time or
  // Full Time on a match that hasn't got there yet.
  if (!halfAdded && (isFinal || maxMinute > 45)) enhancedTimeline.push(mkPeriod('Half Time', 45));
  // Match Ended — only once the match is final.
  if (isFinal && !fullAdded) enhancedTimeline.push(mkPeriod('Full Time', 90));

  function TimelineIcon({ type, detail }: { type: string; detail: string }) {
    const t = type.toLowerCase();
    if (t === 'period') {
      if (detail === 'Kick Off') return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" stroke="var(--text-2)" strokeWidth="1.5"/>
          <path d="M5.5 5 L9 7 L5.5 9 Z" fill="var(--text-2)"/>
        </svg>
      );
      // Checkered flag for Full Time / End of Extra Time
      return (
        <svg width="15" height="12" viewBox="0 0 15 12" fill="none" aria-hidden="true">
          {/* Pole */}
          <line x1="1.5" y1="1" x2="1.5" y2="11" stroke="var(--text-2)" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Flag background */}
          <rect x="2" y="1" width="13" height="6" rx="1" fill="var(--text-0)"/>
          {/* Checkered squares — 3 cols × 2 rows */}
          <rect x="2"    y="1" width="4.3" height="3" fill="white"/>
          <rect x="6.3"  y="1" width="4.3" height="3" fill="var(--text-0)"/>
          <rect x="10.6" y="1" width="4.4" height="3" fill="white"/>
          <rect x="2"    y="4" width="4.3" height="3" fill="var(--text-0)"/>
          <rect x="6.3"  y="4" width="4.3" height="3" fill="white"/>
          <rect x="10.6" y="4" width="4.4" height="3" fill="var(--text-0)"/>
        </svg>
      );
    }
    if (t === 'goal') {
      if (detail.includes('Missed')) return (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 2 L10 10 M10 2 L2 10" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      );
      return <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚽</span>;
    }
    if (t === 'card') {
      const isRed = detail.includes('Red');
      return (
        <svg width="10" height="13" viewBox="0 0 10 13" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="9" height="12" rx="1.5"
            fill={isRed ? 'var(--danger)' : 'var(--warn)'} stroke={isRed ? 'var(--danger)' : 'var(--warn)'}/>
        </svg>
      );
    }
    if (t === 'subst') {
      return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          {/* Top arc + arrowhead — green (coming on) */}
          <path d="M3 8 A5 5 0 0 1 13 8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round"/>
          <path d="M11 5.2 L13 8 L10.2 8.8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          {/* Bottom arc + arrowhead — red (going off) */}
          <path d="M13 8 A5 5 0 0 1 3 8" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"/>
          <path d="M5 10.8 L3 8 L5.8 7.2" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    }
    // Injury break — red cross
    if (detail.toLowerCase().includes('injury')) return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M6 1.5 L6 10.5 M1.5 6 L10.5 6" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
    return <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-2)' }}>VAR</span>;
  }

  // ── Penalty shootout breakdown ──────────────────────────────────────────
  type Kick = { player: string; team: string; scored: boolean };
  const shootout: Kick[] = shootoutKicks.map(e => ({
    player: e.player,
    team: e.team,
    scored: !/miss|saved/i.test(e.detail),
  }));

  const homeKicks = shootout.filter(k => k.team === homeTeam);
  const awayKicks = shootout.filter(k => k.team === awayTeam);
  const shootoutRounds = Math.max(homeKicks.length, awayKicks.length);
  const homePen = selectedFixture.homePenScore ?? homeKicks.filter(k => k.scored).length;
  const awayPen = selectedFixture.awayPenScore ?? awayKicks.filter(k => k.scored).length;
  const homePenWin = homePen > awayPen;

  const KickMark = ({ scored }: { scored: boolean }) =>
    scored ? (
      <span className="wc-pk-mark wc-pk-mark--scored" aria-label="scored">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 6.5 L5 9 L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    ) : (
      <span className="wc-pk-mark wc-pk-mark--missed" aria-label="missed">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );

  return (
    <div className="wc-recap">
      <MatchHeader selectedFixture={selectedFixture} padded />

      {/* ── Match timeline ──────────────────────────────────────────── */}
      {enhancedTimeline.length > 0 && (() => {
        // Pre-calculate running score at each goal event (by position in enhancedTimeline)
        const runningScores = new Map<number, string>();
        let rHome = 0, rAway = 0;
        enhancedTimeline.forEach((ev, i) => {
          const t = ev.type.toLowerCase();
          if (t === 'goal' && !ev.detail.includes('Missed') && !ev.detail.toLowerCase().includes('saved')) {
            const isOG = ev.detail.includes('Own Goal');
            // Own goal: scored against the team that conceded it
            if (!isOG) { if (ev.team === homeTeam) rHome++; else rAway++; }
            else        { if (ev.team === homeTeam) rAway++; else rHome++; }
            runningScores.set(i, `${rHome}-${rAway}`);
          }
        });

        // Helper: render a single event row
        function EventRow({ ev, i }: { ev: TLItem; i: number }) {
          const t = ev.type.toLowerCase();
          const isHome      = ev.team === homeTeam;
          const min         = ev.extraMinute ? `${ev.minute}+${ev.extraMinute}'` : `${ev.minute}'`;
          const goalScore   = runningScores.get(i) ?? null;
          const isGoal      = t === 'goal';
          const isCard      = t === 'card';
          const isSub       = t === 'subst';
          const isVar       = t === 'var';
          const isPenalty   = ev.detail.toLowerCase().includes('penalty');
          const isInjury    = isVar && ev.detail.toLowerCase().includes('injury');
          const isMissedPen = (isGoal || isVar) && !isInjury && (ev.detail.includes('Missed') || ev.detail.toLowerCase().includes('saved'));
          const iconCls     = `wc-timeline-icon${
            isMissedPen ? ' wc-timeline-icon--red'
            : isGoal    ? ' wc-timeline-icon--goal'
            : isCard    ? (ev.detail.includes('Red') ? ' wc-timeline-icon--red' : ' wc-timeline-icon--yellow')
            : isSub     ? ' wc-timeline-icon--sub'
            : ''}`;
          const detail = (
            <div className="wc-timeline-detail">
              {isSub ? (
                <>
                  {ev.assist && <span className="wc-timeline-player wc-timeline-player--in">↑ {ev.assist}</span>}
                  <span className="wc-timeline-player wc-timeline-player--out">↓ {ev.player}</span>
                </>
              ) : (
                <>
                  <span className={`wc-timeline-player${isGoal && !isMissedPen ? ' wc-timeline-player--goal' : isMissedPen ? ' wc-timeline-player--missed' : ''}`}>
                    {ev.player}
                    {ev.detail.includes('Own Goal') && <span className="wc-timeline-tag">OG</span>}
                  </span>
                  {isPenalty && !ev.detail.includes('Own') && (
                    <span className={`wc-timeline-event-type${isMissedPen ? ' wc-timeline-event-type--missed' : ''}`}>
                      {isMissedPen ? 'MISSED PENALTY' : 'PENALTY'}
                    </span>
                  )}
                  {isInjury && (
                    <span className="wc-timeline-event-type wc-timeline-event-type--missed">INJURY BREAK</span>
                  )}
                  {ev.assist && !isPenalty && !isInjury && <span className="wc-timeline-assist">⤴ {ev.assist}</span>}
                </>
              )}
            </div>
          );
          return (
            <div key={i} className="wc-timeline-row">
              <div className="wc-timeline-side wc-timeline-side--home">
                {isHome ? detail : (
                  goalScore
                    /* Away goal: score LEFT of minute (outer edge = left) */
                    ? <span className="wc-timeline-min-wrap wc-timeline-min-wrap--away">
                        <span className="wc-timeline-goal-score">{goalScore}</span>
                        <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                      </span>
                    : <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                )}
              </div>
              <div className="wc-timeline-centre">
                <div className={iconCls}><TimelineIcon type={ev.type} detail={ev.detail} /></div>
              </div>
              <div className="wc-timeline-side wc-timeline-side--away">
                {!isHome ? detail : (
                  goalScore
                    /* Home goal: score RIGHT of minute (outer edge = right) */
                    ? <span className="wc-timeline-min-wrap wc-timeline-min-wrap--home">
                        <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                        <span className="wc-timeline-goal-score">{goalScore}</span>
                      </span>
                    : <span className="wc-timeline-min wc-timeline-min--side">{min}</span>
                )}
              </div>
            </div>
          );
        }

        // Helper: render a period divider (with icon or text label)
        function PeriodRow({ ev, i }: { ev: TLItem; i: number }) {
          const label = ev._periodLabel ?? '';
          const hasIcon = label === 'Kick Off' || label === 'Full Time'
            || label === 'End of Extra Time 1' || label === 'End of Extra Time 2';
          return hasIcon ? (
            <div key={i} className="wc-timeline-period">
              <div className="wc-timeline-centre" style={{ gridColumn: 2 }}>
                <div className="wc-timeline-icon"><TimelineIcon type="PERIOD" detail={label} /></div>
              </div>
            </div>
          ) : (
            <div key={i} className="wc-timeline-period">
              <span className="wc-timeline-period-label">{label}</span>
            </div>
          );
        }

        const first = enhancedTimeline[0];
        const last  = enhancedTimeline[enhancedTimeline.length - 1];
        const mid   = enhancedTimeline.slice(1, -1);

        return (
          <div className="wc-timeline">
            {/* Kick Off — no line above */}
            <PeriodRow ev={first} i={0} />
            {/* Body — dotted line only within this wrapper */}
            <div className="wc-timeline-body">
              {mid.map((ev, i) =>
                ev.type.toLowerCase() === 'period'
                  ? <PeriodRow key={i} ev={ev} i={i + 1} />
                  : <EventRow  key={i} ev={ev} i={i + 1} />
              )}
            </div>
            {/* Full Time whistle — no line below */}
            {enhancedTimeline.length > 1 && <PeriodRow ev={last} i={enhancedTimeline.length - 1} />}
          </div>
        );
      })()}

      {/* ── Penalty shootout breakdown ───────────────────────────────── */}
      {/* The provider's events feed sometimes omits shootout kicks entirely even
          for a fixture we know went to penalties (our own homePenScore/awayPenScore
          says so) — fall back to just the final shootout score rather than hiding
          the whole section, and only render the kick-by-kick rounds when we
          actually have them. */}
      {(shootout.length > 0 || (selectedFixture.homePenScore != null && selectedFixture.awayPenScore != null)) && (
        <div className="wc-pk">
          <div className="wc-pk-title">Penalty Shootout</div>
          <div className="wc-pk-score">
            <span className={`wc-pk-team${homePenWin ? ' wc-pk-team--win' : ''}`}>
              {teamFlag(homeTeam ?? '')} {homeTeam}
            </span>
            <span className="wc-pk-score-num">{homePen}–{awayPen}</span>
            <span className={`wc-pk-team wc-pk-team--right${!homePenWin ? ' wc-pk-team--win' : ''}`}>
              {awayTeam} {teamFlag(awayTeam ?? '')}
            </span>
          </div>
          {shootoutRounds > 0 ? (
            <div className="wc-pk-rounds">
              {Array.from({ length: shootoutRounds }).map((_, i) => {
                const h = homeKicks[i];
                const a = awayKicks[i];
                return (
                  <div key={i} className="wc-pk-round">
                    <div className="wc-pk-kick wc-pk-kick--home">
                      {h && (
                        <>
                          <KickMark scored={h.scored} />
                          <span className="wc-pk-kick-name">{h.player.split(' ').pop()}</span>
                        </>
                      )}
                    </div>
                    <span className="wc-pk-round-num">{i + 1}</span>
                    <div className="wc-pk-kick wc-pk-kick--away">
                      {a && (
                        <>
                          <span className="wc-pk-kick-name">{a.player.split(' ').pop()}</span>
                          <KickMark scored={a.scored} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="wc-pk-no-detail">Kick-by-kick detail unavailable for this shootout.</p>
          )}
        </div>
      )}

    </div>
  );
}
