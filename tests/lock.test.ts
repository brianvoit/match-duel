import { describe, expect, it } from 'vitest';
import { isPickLocked } from '@/lib/domain/lock';

describe('isPickLocked', () => {
  it('locks at kickoff timestamp boundary', () => {
    const kickoff = '2026-06-11T16:00:00.000Z';

    expect(isPickLocked(kickoff, new Date('2026-06-11T15:59:59.999Z'))).toBe(false);
    expect(isPickLocked(kickoff, new Date('2026-06-11T16:00:00.000Z'))).toBe(true);
  });

  it('throws for invalid timestamp', () => {
    expect(() => isPickLocked('invalid-date')).toThrow(/Invalid kickoff/);
  });
});
