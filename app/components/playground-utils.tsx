import type { Fixture } from '@/app/components/playground-types';

export const STAGE_POINTS: Record<string, number> = {
  GROUP: 1,
  ROUND_OF_32: 2,
  ROUND_OF_16: 4,
  QUARTERFINAL: 8,
  SEMIFINAL: 8,
  THIRD_PLACE: 16,
  FINAL: 32,
};

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

export function computePickPoints(
  fixture: Fixture,
  pickedSide: 'HOME' | 'AWAY' | null,
  stage: string
): number | null {
  if (fixture.status !== 'FINAL') return null;
  if (fixture.homeScore === null || fixture.awayScore === null) return null;
  if (!pickedSide) return 0;
  if (fixture.homeScore === fixture.awayScore) return 0;
  const winner = fixture.homeScore > fixture.awayScore ? 'HOME' : 'AWAY';
  return winner === pickedSide ? (STAGE_POINTS[stage] ?? 1) : 0;
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
