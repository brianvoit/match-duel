/**
 * Tiny Cloudflare Worker — scheduled cron only.
 * Deploy separately: `wrangler deploy --config wrangler.cron.toml`
 *
 * Fires every 30 minutes and calls the picks-due-soon Supabase edge function.
 */

interface Env {
  SUPABASE_FUNCTIONS_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const { SUPABASE_FUNCTIONS_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
    if (!SUPABASE_FUNCTIONS_URL || !SUPABASE_SERVICE_ROLE_KEY) return;

    ctx.waitUntil(
      fetch(`${SUPABASE_FUNCTIONS_URL}/picks-due-soon`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    );
  },
};
