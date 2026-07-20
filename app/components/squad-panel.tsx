'use client';

import { teamFlag } from '@/lib/data/teamInfo';
import type { Fixture, SquadData } from '@/app/components/playground-types';

interface SquadPanelProps {
  selectedFixture: Fixture | null;
  squadData: SquadData | null;
  squadLoading: boolean;
}

// Extracted verbatim from Playground.renderSquad — a pure move (props in, JSX out).
export function SquadPanel({ selectedFixture, squadData, squadLoading }: SquadPanelProps) {
  if (!selectedFixture) {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle">Select a fixture to view squad info.</p>
      </div>
    );
  }

  if (squadLoading) {
    return (
      <div className="wc-content-empty">
        <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>Loading lineups…</p>
      </div>
    );
  }

  if (!squadData || !squadData.available) {
    const msg = !squadData || squadData.reason === 'not_yet_available'
      ? 'Lineups are confirmed approximately 1 hour before kickoff.'
      : squadData.reason === 'no_external_id'
        ? 'Lineup data will be available once fixtures are synced from API-Football.'
        : 'Lineup data unavailable for this fixture.';
    return (
      <div className="wc-content-empty">
        <p style={{ fontWeight: 700, margin: '0 0 6px' }}>
          {selectedFixture.homeTeam} vs {selectedFixture.awayTeam}
        </p>
        <p className="wc-subtitle" style={{ fontSize: '0.84rem' }}>{msg}</p>
      </div>
    );
  }

  const home = squadData.home;
  const away = squadData.away;

  // Build formation lines ordered own-goal -> attack (GK first). For the away
  // side we reverse so its attackers sit next to the home attackers at the
  // halfway line, forming one continuous, opposing field.
  function buildLines(lineup: NonNullable<SquadData['home']>, reverse: boolean) {
    const rows = new Map<number, typeof lineup.starters>();
    for (const p of lineup.starters) {
      const row = p.grid ? parseInt(p.grid.split(':')[0]) : 99;
      if (!rows.has(row)) rows.set(row, []);
      rows.get(row)!.push(p);
    }
    for (const [, players] of rows) {
      players.sort((a, b) => {
        const ca = a.grid ? parseInt(a.grid.split(':')[1]) : 0;
        const cb = b.grid ? parseInt(b.grid.split(':')[1]) : 0;
        return ca - cb;
      });
    }
    const lines = [...rows.entries()].sort(([a], [b]) => a - b).map(([, players]) => players);
    return reverse ? lines.reverse() : lines;
  }

  const homeLines = home ? buildLines(home, false) : []; // GK → attack
  const awayLines = away ? buildLines(away, true) : [];  // attack → GK

  const renderHalf = (lines: ReturnType<typeof buildLines>, side: 'home' | 'away') => (
    <div className={`wc-squad-field-half wc-squad-field-half--${side}`}>
      {lines.map((line, i) => (
        <div key={i} className="wc-squad-line">
          {line.map(p => (
            <div key={p.number} className="wc-squad-player">
              <div className={`wc-squad-player-num wc-squad-player-num--${(p.pos ?? '').toLowerCase()}`}>{p.number}</div>
              <div className="wc-squad-player-name">{p.name.split(' ').pop()}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  // Coaches sit on the INNER edge of each header (toward the centre); team
  // identity (flag + name + formation) stays on the outer edge.
  const renderHead = (lineup: NonNullable<SquadData['home']>, side: 'home' | 'away') => (
    <div className={`wc-squad-head wc-squad-head--${side}`}>
      <div className="wc-squad-head-id">
        <span className="wc-squad-head-flag">{teamFlag(lineup.teamName)}</span>
        <div className="wc-squad-head-text">
          <span className="wc-squad-head-name">{lineup.teamName}</span>
          <span className="wc-squad-head-meta">{lineup.formation}</span>
        </div>
      </div>
      {lineup.coachName && (
        <div className="wc-squad-head-coach">
          <span className="wc-squad-head-coach-name">{lineup.coachName}</span>
        </div>
      )}
    </div>
  );

  const posLabel = (pos: string | null) => (
    pos ? ({ g: 'Goalkeeper', d: 'Defender', m: 'Midfielder', f: 'Forward' }[pos.toLowerCase()] ?? pos) : null
  );

  type PairItem = { key: string; num?: number; name: string; sub?: string | null };

  const renderPairCell = (item: PairItem | undefined, side: 'home' | 'away') => (
    <div className={`wc-squad-cell wc-squad-cell--${side}`}>
      {item && (
        <>
          {item.num != null && <span className="wc-squad-cell-num">{item.num}</span>}
          <div className="wc-squad-cell-info">
            <span className="wc-squad-cell-name">
              <span className="wc-name-full">{item.name}</span>
              <span className="wc-name-last">{item.name.split(' ').pop()}</span>
            </span>
            {item.sub && <span className="wc-squad-cell-sub">{item.sub}</span>}
          </div>
        </>
      )}
    </div>
  );

  // Combined table — one row per pair, home on the left, away on the right.
  const renderPairTable = (title: string, homeItems: PairItem[], awayItems: PairItem[]) => {
    const n = Math.max(homeItems.length, awayItems.length);
    if (n === 0) return null;
    return (
      <div className="wc-squad-table">
        <div className="wc-squad-table-title">{title}</div>
        <div className="wc-squad-table-rows">
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="wc-squad-pair-row">
              {renderPairCell(homeItems[i], 'home')}
              {renderPairCell(awayItems[i], 'away')}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const homeUnavail = home?.unavailable ?? [];
  const awayUnavail = away?.unavailable ?? [];

  return (
    <div className="wc-squad">
      {/* Coaches / team identity on top */}
      <div className="wc-squad-heads">
        {home && renderHead(home, 'home')}
        {away && renderHead(away, 'away')}
      </div>

      {/* One combined, opposing field */}
      <div className="wc-squad-field">
        {home && renderHalf(homeLines, 'home')}
        <div className="wc-squad-halfway" aria-hidden="true" />
        {away && renderHalf(awayLines, 'away')}
      </div>

      {/* Combined substitutes (home left, away right) */}
      {renderPairTable(
        'Substitutes',
        (home?.substitutes ?? []).map(p => ({ key: `h${p.number}`, num: p.number, name: p.name, sub: posLabel(p.pos) })),
        (away?.substitutes ?? []).map(p => ({ key: `a${p.number}`, num: p.number, name: p.name, sub: posLabel(p.pos) })),
      )}

      {/* Unavailable players */}
      {renderPairTable(
        'Unavailable',
        homeUnavail.map((p, i) => ({ key: `hu${i}`, name: p.name, sub: p.reason })),
        awayUnavail.map((p, i) => ({ key: `au${i}`, name: p.name, sub: p.reason })),
      )}
    </div>
  );
}
