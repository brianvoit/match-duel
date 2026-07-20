import type { Fixture } from '@/app/components/playground-types';
import { WORLD_CUP_2026_SCORING } from '@/lib/domain/scoring';

/**
 * The live match clock to show in place of the kickoff date/time, or null when
 * the fixture isn't live (caller then shows the date/time). Uses the API's
 * elapsed minute + period; for a running period it extrapolates from the last
 * sync so the minute keeps ticking between polls, capped so a stalled sync can't
 * run the clock away.
 */
export function liveMatchClock(f: Pick<Fixture, 'status' | 'period' | 'elapsedMinute' | 'lastSyncedAt'>, now: number = Date.now()): string | null {
  if (f.status !== 'LIVE') return null;
  const p = (f.period ?? '').toUpperCase();
  if (p === 'HT') return 'HT';
  if (p === 'P' || p === 'BP' || p === 'PEN') return 'PENS';
  if (p === 'BT') return 'ET';                       // break before extra time
  if (f.elapsedMinute == null) return 'LIVE';
  const running = p === '1H' || p === '2H' || p === 'ET' || p === '';
  const driftMin = running && f.lastSyncedAt
    ? Math.min(5, Math.max(0, Math.floor((now - new Date(f.lastSyncedAt).getTime()) / 60000)))
    : 0;
  return `${f.elapsedMinute + driftMin}'`;
}

// Client-side per-stage points for display + provisional tallies. Derived from the
// single source of truth in lib/domain/scoring.ts (was once a hand-maintained copy
// that drifted from the server). NOTE: this is the DEFAULT config — the server is
// authoritative for settlement and the live tally (both go through the
// per-tournament `scoring_config` via getScoringConfigForTournament). A tournament
// that overrides point values would need that config threaded to the client; every
// World Cup so far uses these defaults (the women's 32-team format simply never
// produces ROUND_OF_32 fixtures, so its unused entry here is harmless).
export const STAGE_POINTS: Record<string, number> = WORLD_CUP_2026_SCORING.stagePoints;

export const STAGE_LABELS: Record<string, string> = {
  GROUP:        'Group Stage',
  ROUND_OF_32:  'Round of 32',
  ROUND_OF_16:  'Round of 16',
  QUARTERFINAL: 'Quarter-Finals',
  SEMIFINAL:    'Semi-Finals',
  THIRD_PLACE:  'Third Place',
  FINAL:        'Final',
};

export function fmtStage(stage: string) {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, ' ');
}

/** Winner of a penalty shootout, or null if the match wasn't decided on penalties. */
export function penaltyWinner(
  f: { homePenScore: number | null; awayPenScore: number | null }
): 'HOME' | 'AWAY' | null {
  const h = f.homePenScore;
  const a = f.awayPenScore;
  if (h != null && a != null && h !== a) return h > a ? 'HOME' : 'AWAY';
  return null;
}

/** A fixture is a genuine draw only if level on goals AND not decided by a shootout. */
export function isGenuineDraw(
  f: { homeScore: number | null; awayScore: number | null; homePenScore: number | null; awayPenScore: number | null }
): boolean {
  return f.homeScore !== null && f.homeScore === f.awayScore && penaltyWinner(f) === null;
}

export function computePickPoints(
  fixture: Pick<Fixture, 'status' | 'homeScore' | 'awayScore' | 'homePenScore' | 'awayPenScore'>,
  pickedSide: 'HOME' | 'AWAY' | null,
  stage: string
): number | null {
  if (fixture.status !== 'FINAL') return null;
  if (fixture.homeScore === null || fixture.awayScore === null) return null;
  if (!pickedSide) return 0;
  const award = (winner: 'HOME' | 'AWAY') => (winner === pickedSide ? (STAGE_POINTS[stage] ?? 1) : 0);
  if (fixture.homeScore === fixture.awayScore) {
    // Level after regulation/extra time. In knockouts a penalty shootout decides
    // who advances — score by the shootout winner, not as a draw.
    const hp = fixture.homePenScore;
    const ap = fixture.awayPenScore;
    if (hp != null && ap != null && hp !== ap) return award(hp > ap ? 'HOME' : 'AWAY');
    return 0; // genuine draw (group stage)
  }
  return award(fixture.homeScore > fixture.awayScore ? 'HOME' : 'AWAY');
}

// Tournament "matchday" = sequential playing day counted from June 11 2026 in the
// viewer's LOCAL timezone (Day 1 = June 11). Group stage spans ~17 of these days.
// Shared by the fixture list and the score chart so their MD numbers always match.
const TOURNAMENT_START_MS = new Date(2026, 5, 11).getTime(); // local midnight, month 0-indexed
const MS_PER_DAY = 86_400_000;
export function tournamentMatchday(startsAt: string): number {
  const d = new Date(startsAt);
  const dayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((dayMs - TOURNAMENT_START_MS) / MS_PER_DAY) + 1;
}

export function computeMatchdays(
  fixtures: { id: string; startsAt: string }[]
): Map<string, number> {
  const map = new Map<string, number>();
  if (!fixtures.length) return map;
  let matchday = 0;
  let lastDay = '';
  for (const f of fixtures) {
    const day = new Date(f.startsAt).toISOString().slice(0, 10);
    if (day !== lastDay) { matchday++; lastDay = day; }
    map.set(f.id, matchday);
  }
  return map;
}

export function initials(name: string | null | undefined, fallback = '?') {
  const str = name?.trim();
  if (!str) return fallback;
  return str.charAt(0).toUpperCase();
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function StatusGlyph({
  status,
  isLocked,
  size = 13,
}: {
  status: string;
  isLocked: boolean;
  size?: number;
}) {
  if (status === 'LIVE') {
    return (
      <span className="wc-status-glyph wc-status-glyph--live" aria-label="Live">
        <span className="wc-status-dot" />
        Live
      </span>
    );
  }
  if (status === 'FINAL') {
    return (
      <span className="wc-status-glyph wc-status-glyph--final" aria-label="Final">
        Final
      </span>
    );
  }
  if (status === 'POSTPONED' || status === 'CANCELED') {
    return (
      <span className="wc-status-glyph wc-status-glyph--canceled" aria-label={status}>
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (isLocked) {
    return (
      <span className="wc-status-glyph wc-status-glyph--locked" aria-label="Locked">
        <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 6V4A3.5 3.5 0 0110.5 4V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="wc-status-glyph wc-status-glyph--open" aria-label="Open">
      <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="1" y="7" width="7.5" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 7V4A3 3 0 0113 4V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
