/**
 * Tiny Cloudflare Worker — scheduled cron only.
 * Deploy separately: `wrangler deploy --config wrangler.cron.toml`
 *
 * Fires every 30 minutes and:
 *   1. Syncs live fixture scores from API-Football + settles completed rounds
 *   2. Notifies first-pickers whose upcoming fixtures are locking within 24h
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

    const adminHeaders = {
      Authorization: `Bearer ${JOB_ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
    };

    // Run both jobs in parallel — failures are isolated
    const jobs: Promise<unknown>[] = [];

    // 1. Fixture sync + round transitions (API-Football → DB → scoring)
    if (APP_URL && JOB_ADMIN_TOKEN) {
      jobs.push(
        fetch(`${APP_URL}/api/admin/fixtures/live-sync`, {
          method: 'POST',
          headers: adminHeaders,
          body: '{}',
        }).catch(() => {})
      );
    }

    // 2. Picks-due-soon notifications
    if (SUPABASE_FUNCTIONS_URL && SUPABASE_SERVICE_ROLE_KEY) {
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
