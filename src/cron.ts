/**
 * Tiny Cloudflare Worker — scheduled cron only.
 * Deploy separately: `wrangler deploy --config wrangler.cron.toml`
 *
 * Fires every minute. Each job runs on its own cadence:
 *   1. Fixture score sync + round settlement — every run (~1 min), so live
 *      scores reach the DB near-real-time. Forced to a full-schedule sync once
 *      a day (the 00:00 UTC run) to pick up any future-match reschedules.
 *   2. Picks-due-soon notifications — every 30 min only (:00 and :30), to keep
 *      reminder pushes from firing too often.
 */

interface Env {
  SUPABASE_FUNCTIONS_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  APP_URL: string;
  JOB_ADMIN_TOKEN: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { SUPABASE_FUNCTIONS_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL, JOB_ADMIN_TOKEN } = env;

    const now = new Date();
    const minutes = now.getUTCMinutes();

    const adminHeaders = {
      Authorization: `Bearer ${JOB_ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
    };

    // Run jobs in parallel — failures are isolated
    const jobs: Promise<unknown>[] = [];

    // 1. Fixture sync + round transitions (API-Football → DB → scoring) — every run.
    //    The 00:00 UTC run forces a full-schedule sync (catches reschedules);
    //    all other runs are the cheap live + today's-matches incremental sync.
    //    Only APP_URL is required — the endpoint authorises by JOB_ADMIN_TOKEN only
    //    when the app has one configured, so we must not gate the call on the token.
    if (APP_URL) {
      const isDailyFullSync = now.getUTCHours() === 0 && minutes === 0;
      const syncUrl = `${APP_URL}/api/admin/fixtures/live-sync${isDailyFullSync ? '?full=1' : ''}`;
      jobs.push(
        fetch(syncUrl, {
          method: 'POST',
          headers: adminHeaders,
          body: '{}',
        }).catch(() => {})
      );
    }

    // 2. Picks-due-soon notifications — every 30 min only (:00 and :30).
    if (SUPABASE_FUNCTIONS_URL && SUPABASE_SERVICE_ROLE_KEY && minutes % 30 === 0) {
      jobs.push(
        fetch(`${SUPABASE_FUNCTIONS_URL}/picks-due-soon`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        }).catch(() => {})
      );
    }

    ctx.waitUntil(Promise.all(jobs));
  },
};
