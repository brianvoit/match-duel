import { describe, expect, it } from 'vitest';
import { formatRoundDateRange } from '@/app/components/playground-utils';

// Fixtures are built from LOCAL-time components (month is 0-indexed) so these
// assertions hold whatever timezone the test runner is in — the helper formats
// in the viewer's local time by design.
const fx = (y: number, m: number, d: number, h = 15) => ({
  startsAt: new Date(y, m, d, h).toISOString(),
});

describe('formatRoundDateRange', () => {
  it('returns null when there are no fixtures to describe', () => {
    expect(formatRoundDateRange([])).toBeNull();
    expect(formatRoundDateRange(null)).toBeNull();
    expect(formatRoundDateRange(undefined)).toBeNull();
  });

  it('shows a single date for a one-day round (Third Place, Final)', () => {
    expect(formatRoundDateRange([fx(2026, 6, 18)])).toBe('July 18');
  });

  it('collapses the month when every match is in the same month', () => {
    // Quarter-finals 2026: July 9, 10, and two on the 11th.
    expect(
      formatRoundDateRange([fx(2026, 6, 9), fx(2026, 6, 10), fx(2026, 6, 11, 16), fx(2026, 6, 11, 20)])
    ).toBe('July 9 – 11');
  });

  it('repeats the month when the round crosses one', () => {
    // Round of 32 2026: June 28 → July 3.
    expect(formatRoundDateRange([fx(2026, 5, 28), fx(2026, 6, 3)])).toBe('June 28 – July 3');
  });

  it('uses the earliest and latest fixture regardless of input order', () => {
    expect(
      formatRoundDateRange([fx(2026, 6, 15), fx(2026, 6, 14), fx(2026, 6, 15, 19)])
    ).toBe('July 14 – 15');
  });

  it('spans a full month name on both sides across a year boundary', () => {
    expect(formatRoundDateRange([fx(2026, 11, 30), fx(2027, 0, 2)])).toBe('December 30 – January 2');
  });

  it('ignores unparseable dates rather than rendering Invalid Date', () => {
    expect(
      formatRoundDateRange([{ startsAt: 'not-a-date' }, fx(2026, 6, 9)])
    ).toBe('July 9');
    expect(formatRoundDateRange([{ startsAt: 'not-a-date' }])).toBeNull();
  });
});
