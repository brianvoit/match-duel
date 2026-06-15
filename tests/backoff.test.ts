import { describe, it, expect } from 'vitest';
import { backoffDelay } from '@/lib/realtime/backoff';

describe('backoffDelay', () => {
  it('grows exponentially with no jitter', () => {
    const opts = { baseMs: 500, factor: 2, jitter: 'none' as const };
    expect(backoffDelay(0, opts)).toBe(500);
    expect(backoffDelay(1, opts)).toBe(1000);
    expect(backoffDelay(2, opts)).toBe(2000);
    expect(backoffDelay(3, opts)).toBe(4000);
  });

  it('caps at maxMs', () => {
    const opts = { baseMs: 500, factor: 2, maxMs: 3000, jitter: 'none' as const };
    expect(backoffDelay(10, opts)).toBe(3000);
  });

  it('full jitter stays within [0, capped]', () => {
    const rng = () => 0.5;
    // capped = 2000 at attempt 2; full jitter = rng()*capped = 1000
    expect(backoffDelay(2, { baseMs: 500, factor: 2, jitter: 'full', rng })).toBe(1000);
    // rng()=0 -> 0, rng()->1 -> capped
    expect(backoffDelay(2, { baseMs: 500, factor: 2, jitter: 'full', rng: () => 0 })).toBe(0);
  });

  it('equal jitter never drops below half the capped delay', () => {
    const capped = 2000; // attempt 2 with base 500, factor 2
    const lo = backoffDelay(2, { baseMs: 500, factor: 2, jitter: 'equal', rng: () => 0 });
    const hi = backoffDelay(2, { baseMs: 500, factor: 2, jitter: 'equal', rng: () => 1 });
    expect(lo).toBe(capped / 2);
    expect(hi).toBe(capped);
  });

  it('treats negative/fractional attempts as attempt 0', () => {
    const opts = { baseMs: 500, factor: 2, jitter: 'none' as const };
    expect(backoffDelay(-3, opts)).toBe(500);
    expect(backoffDelay(0.9, opts)).toBe(500);
  });
});
