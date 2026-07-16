import { describe, expect, it } from 'vitest';
import { liveMatchClock } from '@/app/components/playground-utils';

const T0 = new Date('2026-07-16T20:00:00Z').getTime();
const at = (min: number) => T0 + min * 60_000;

describe('liveMatchClock', () => {
  it('returns null when the match is not live (shows date/time instead)', () => {
    expect(liveMatchClock({ status: 'SCHEDULED', period: null, elapsedMinute: null, lastSyncedAt: null }, T0)).toBeNull();
    expect(liveMatchClock({ status: 'FINAL', period: '2H', elapsedMinute: 90, lastSyncedAt: new Date(T0).toISOString() }, T0)).toBeNull();
  });

  it('shows the elapsed minute during a running half', () => {
    const f = { status: 'LIVE', period: '2H', elapsedMinute: 67, lastSyncedAt: new Date(T0).toISOString() };
    expect(liveMatchClock(f, T0)).toBe("67'");
  });

  it('extrapolates the minute between syncs, capped at 5', () => {
    const f = { status: 'LIVE', period: '1H', elapsedMinute: 30, lastSyncedAt: new Date(T0).toISOString() };
    expect(liveMatchClock(f, at(2))).toBe("32'"); // +2 min since sync
    expect(liveMatchClock(f, at(30))).toBe("35'"); // capped at +5 so a stalled sync can't run away
  });

  it('shows HT at half-time and does not tick', () => {
    const f = { status: 'LIVE', period: 'HT', elapsedMinute: 45, lastSyncedAt: new Date(T0).toISOString() };
    expect(liveMatchClock(f, at(10))).toBe('HT');
  });

  it('shows PENS during a shootout', () => {
    expect(liveMatchClock({ status: 'LIVE', period: 'P', elapsedMinute: 120, lastSyncedAt: null }, T0)).toBe('PENS');
  });

  it('falls back to LIVE when the minute is unknown', () => {
    expect(liveMatchClock({ status: 'LIVE', period: '2H', elapsedMinute: null, lastSyncedAt: null }, T0)).toBe('LIVE');
  });
});
