'use client';

import { teamFlag } from '@/lib/data/teamInfo';
import type { Fixture } from '@/app/components/playground-types';

interface MatchHeaderProps {
  /**
   * Orientation source of truth: always the fixture's own home/away, never a
   * provider payload's homeTeam/awayTeam field. Stats/Squad/Recap each fetch
   * from a different API route, and those routes can vary in spelling or (on
   * a reversed-orientation knockout fixture) disagree on which side is home —
   * keying off the fixture instead guarantees this header renders identically
   * on all three tabs.
   */
  selectedFixture: Fixture;
  /** Optional line under the team name — Squad uses this for formation + coach. */
  homeMeta?: string | null;
  awayMeta?: string | null;
  /** Stats/Recap sit in an unpadded container and need the header to supply
   *  its own horizontal padding; Squad's container already pads itself. */
  padded?: boolean;
}

export function MatchHeader({ selectedFixture, homeMeta, awayMeta, padded }: MatchHeaderProps) {
  const { homeTeam, awayTeam } = selectedFixture;
  return (
    <div className={`wc-match-header${padded ? ' wc-match-header--padded' : ''}`}>
      <div className="wc-match-header-side wc-match-header-side--home">
        <span className="wc-match-header-flag">{teamFlag(homeTeam)}</span>
        <div className="wc-match-header-text">
          <span className="wc-match-header-name">{homeTeam}</span>
          {homeMeta && <span className="wc-match-header-meta">{homeMeta}</span>}
        </div>
      </div>
      <div className="wc-match-header-side wc-match-header-side--away">
        <div className="wc-match-header-text">
          <span className="wc-match-header-name">{awayTeam}</span>
          {awayMeta && <span className="wc-match-header-meta">{awayMeta}</span>}
        </div>
        <span className="wc-match-header-flag">{teamFlag(awayTeam)}</span>
      </div>
    </div>
  );
}
