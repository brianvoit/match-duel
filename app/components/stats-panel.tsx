'use client';

import { teamFlag } from '@/lib/data/teamInfo';
import type { Fixture, RecapData } from '@/app/components/playground-types';

interface StatsPanelProps {
  selectedFixture: Fixture | null;
  recapData: RecapData | null;
  recapLoading: boolean;
}

// Match statistics (possession, shots, etc.) — split out of the Recap tab so
// the timeline/shootout and the stat bars each get their own tab.
export function StatsPanel({ selectedFixture, recapData, recapLoading }: StatsPanelProps) {
  if (!selectedFixture) {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle">Select a fixture to view match stats.</p>
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

  const statsAvailable = recapData?.available === true;
  const homeTeam = recapData?.homeTeam ?? selectedFixture.homeTeam;
  const awayTeam = recapData?.awayTeam ?? selectedFixture.awayTeam;
  const stats = recapData?.stats ?? [];
  const isFinal = selectedFixture.status === 'FINAL';

  function parseNum(v: number | string | null): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace('%', '')) || 0;
  }

  return (
    <div className="wc-recap">
      {/* Team header on top, like the Squad tab */}
      <div className="wc-recap-header">
        <h2 className="wc-recap-team wc-recap-team--home">
          {teamFlag(homeTeam ?? '')} {homeTeam}
        </h2>
        <h2 className="wc-recap-team wc-recap-team--away">
          {awayTeam} {teamFlag(awayTeam ?? '')}
        </h2>
      </div>

      {!statsAvailable || stats.length === 0 ? (
        <p className="wc-subtitle" style={{ fontSize: '0.82rem', textAlign: 'center', margin: '8px 0' }}>
          {isFinal ? 'Match stats are not available for this fixture.' : 'Match stats will appear as the game progresses.'}
        </p>
      ) : (
        <div className="wc-recap-stats">
          {stats.map(s => {
            const hVal = parseNum(s.home);
            const aVal = parseNum(s.away);
            const total = hVal + aVal || 1;
            const hPct = Math.round((hVal / total) * 100);
            const aPct = 100 - hPct;
            const displayHome = s.home === null ? '—' : String(s.home);
            const displayAway = s.away === null ? '—' : String(s.away);
            return (
              <div key={s.type} className="wc-recap-row">
                <div className="wc-recap-row-header">
                  <span className="wc-recap-val wc-recap-val--home">{displayHome}</span>
                  <span className="wc-recap-label">{s.type}</span>
                  <span className="wc-recap-val wc-recap-val--away">{displayAway}</span>
                </div>
                <div className="wc-recap-bars wc-recap-bars--tall">
                  <div className="wc-recap-bar-track wc-recap-bar-track--home">
                    <div className="wc-recap-bar wc-recap-bar--home" style={{ width: `${hPct}%` }} />
                  </div>
                  <div className="wc-recap-bar-track wc-recap-bar-track--away">
                    <div className="wc-recap-bar wc-recap-bar--away" style={{ width: `${aPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
