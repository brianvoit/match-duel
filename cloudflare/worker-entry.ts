/**
 * Cloudflare Worker entry point.
 *
 * Wraps the opennextjs-generated Next.js handler and adds a `scheduled`
 * handler for Cloudflare Cron Triggers.
 *
 * Cron jobs fired every 2 minutes:
 *   - /api/admin/fixtures/live-sync  → fetch latest scores/status from
 *     API-Football, update fixture table, settle completed rounds, send
 *     push notifications when results are in.
 *   - /api/admin/notifications/picks-due-soon  → remind first-pickers who
 *     haven't picked in the next 24 hours.
 * And every 10 minutes:
 *   - /api/admin/readiness  → data-health watchdog (stalled score sync, setup
 *     regressions). Logs at error level only on *critical* signals.
 *
 * Build order:
 *   1. `opennextjs-cloudflare build` → generates .open-next/worker.js
 *   2. `wrangler deploy` → bundles THIS file (which imports the generated output)
 */

// The generated Next.js request handler
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — built at deploy time by opennextjs-cloudflare
import nextHandler from '../.open-next/worker.js';

interface Env {
  ASSETS: unknown;
  JOB_ADMIN_TOKEN: string;
  [key: string]: unknown;
}

// Cloudflare Workers runtime types (not available in tsc, only in wrangler)
type ExecutionContext = { waitUntil(p: Promise<unknown>): void };
type ScheduledEvent  = { cron: string; scheduledTime: number; type: string };

const BASE_URL = 'https://match-duel.com';

export default {
  // ── HTTP requests → Next.js ──────────────────────────────────────────────
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return nextHandler.fetch(request, env, ctx);
  },

  // ── Cron trigger: every 2 minutes ───────────────────────────────────────
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const token = env.JOB_ADMIN_TOKEN;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // 1. Live score sync + round transitions
    ctx.waitUntil(
      fetch(`${BASE_URL}/api/admin/fixtures/live-sync`, {
        method: 'POST',
        headers,
      }).then(async (r) => {
        if (!r.ok) {
          console.error(`[cron] live-sync failed: HTTP ${r.status}`);
        } else {
          const d = await r.json() as Record<string, unknown>;
          console.log('[cron] live-sync:', JSON.stringify(d));
        }
      }).catch((err: unknown) => {
        console.error('[cron] live-sync error:', err);
      })
    );

    // 2. Picks-due-soon notifications
    ctx.waitUntil(
      fetch(`${BASE_URL}/api/admin/notifications/picks-due-soon`, {
        method: 'POST',
        headers,
      }).then(async (r) => {
        if (!r.ok) {
          console.error(`[cron] picks-due-soon failed: HTTP ${r.status}`);
        } else {
          const d = await r.json() as Record<string, unknown>;
          console.log('[cron] picks-due-soon:', JSON.stringify(d));
        }
      }).catch((err: unknown) => {
        console.error('[cron] picks-due-soon error:', err);
      })
    );

    // 3. Data-health watchdog. The cron fires every 2 min, but these are pure DB
    //    reads whose signals move slowly, so throttle to every 10 minutes (which
    //    matches the "LIVE fixture not synced in >10 min" threshold it checks).
    //    Only *critical* signals log at error level — informational ones (lazily
    //    cached recaps, self-healing partial rows) would otherwise keep the
    //    monitor permanently red and get ignored.
    const minute = new Date(event?.scheduledTime ?? Date.now()).getUTCMinutes();
    if (minute % 10 === 0) {
      ctx.waitUntil(
        fetch(`${BASE_URL}/api/admin/readiness`, { headers }).then(async (r) => {
          if (!r.ok) {
            console.error(`[cron] readiness failed: HTTP ${r.status}`);
            return;
          }
          const d = await r.json() as {
            readiness?: { ok?: boolean };
            health?: { ok?: boolean; signals?: unknown[] };
          };
          if (d.health?.ok === false) {
            console.error('[cron] data-health UNHEALTHY:', JSON.stringify(d.health));
          } else {
            console.log(`[cron] data-health ok (readiness ok: ${d.readiness?.ok})`);
          }
        }).catch((err: unknown) => {
          console.error('[cron] readiness error:', err);
        })
      );
    }
  },
};
