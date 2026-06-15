// Exponential backoff with jitter for client-side reconnects.
//
// Used by realtime subscriptions (and any other flaky client connection) to
// space out retry attempts so a server hiccup doesn't turn into a reconnect
// stampede from every client at once. Jitter spreads retries across time even
// when many clients fail simultaneously.

export type JitterStrategy = 'full' | 'equal' | 'none';

export interface BackoffOptions {
  /** Delay for the first retry, in ms. Default 500. */
  baseMs?: number;
  /** Upper bound for any single delay, in ms. Default 30_000. */
  maxMs?: number;
  /** Growth multiplier per attempt. Default 2. */
  factor?: number;
  /**
   * Jitter strategy (see AWS "Exponential Backoff And Jitter"):
   *  - 'full':  random(0, capped)                — maximum spread (default)
   *  - 'equal': capped/2 + random(0, capped/2)   — never less than half
   *  - 'none':  capped                            — deterministic, no spread
   */
  jitter?: JitterStrategy;
  /** Injectable RNG for deterministic tests. Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Returns the delay (ms) to wait before retry `attempt` (0-based: attempt 0 is
 * the first retry). The uncapped exponential term is `baseMs * factor^attempt`,
 * clamped to `maxMs`, then jittered.
 */
export function backoffDelay(attempt: number, opts: BackoffOptions = {}): number {
  const {
    baseMs = 500,
    maxMs = 30_000,
    factor = 2,
    jitter = 'full',
    rng = Math.random,
  } = opts;

  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exp = baseMs * Math.pow(factor, safeAttempt);
  const capped = Math.min(maxMs, exp);

  switch (jitter) {
    case 'none':
      return Math.round(capped);
    case 'equal':
      return Math.round(capped / 2 + rng() * (capped / 2));
    case 'full':
    default:
      return Math.round(rng() * capped);
  }
}
