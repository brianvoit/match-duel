// Superseded — intentionally not implemented.
//
// The data-health watchdog now runs through the existing Cloudflare cron:
//   cloudflare/worker-entry.ts (every 10 min) → GET /api/admin/readiness
//     → lib/jobs/tournamentHealth.ts  (getReadiness + getDataHealth)
//
// That path was chosen over a scheduled Supabase edge function because it keeps
// the checks in exactly ONE implementation. A Deno copy here would duplicate the
// same queries in a second language and inevitably drift — the precise failure
// mode we spent a lot of effort eliminating elsewhere in this codebase (the
// home/away orientation rule had been re-derived in four places, and the one
// copy that fell behind silently mislabelled every historical meeting).
//
// It also avoids standing up a second scheduling mechanism (pg_cron + pg_net)
// and storing the service-role key in a cron command or Vault just to call
// ourselves.
//
// If you ever want monitoring that survives a Cloudflare Worker outage, prefer a
// thin function here that simply calls /api/admin/readiness and forwards the
// result — do not re-implement the checks.

export {};
