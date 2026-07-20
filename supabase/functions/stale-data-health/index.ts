import { createClient } from 'npm:@supabase/supabase-js@2';

// Data-integrity watchdog. Mirrors lib/jobs/tournamentHealth.getDataHealth (which
// the /api/admin/readiness route serves synchronously) as a scheduled Supabase
// edge function so the failure classes seen during the men's run — FINAL fixtures
// whose recap data is missing or frozen-partial, and live fixtures whose score
// sync has stalled — get flagged in the background without anyone opening a tab.
//
// Deploy:   supabase functions deploy stale-data-health
// Schedule: add a cron trigger (e.g. every 15 min) in the Supabase dashboard, or
//           via pg_cron calling this function's URL with the service-role bearer.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface Signal { name: string; ok: boolean; detail: string }

async function collectSignals(): Promise<Signal[]> {
  const signals: Signal[] = [];

  // FINAL fixtures with a real external id but no cached stats/events, or a cache
  // row flagged incomplete (_partial) that never healed.
  const { data: finals } = await db
    .from('fixture').select('id').eq('status', 'FINAL').not('external_provider_id', 'is', null);
  const finalIds: string[] = (finals ?? []).map((f: { id: string }) => f.id);

  let missingStats = finalIds.length;
  let missingEvents = finalIds.length;
  let partialCount = 0;
  if (finalIds.length) {
    const { data: cacheRows } = await db
      .from('fixture_api_cache').select('fixture_id, cache_type, data')
      .in('fixture_id', finalIds).in('cache_type', ['stats', 'events']);
    const stats = new Set<string>();
    const events = new Set<string>();
    for (const row of (cacheRows ?? []) as Array<{ fixture_id: string; cache_type: string; data: { _partial?: boolean } }>) {
      if (row.cache_type === 'stats') stats.add(row.fixture_id);
      if (row.cache_type === 'events') events.add(row.fixture_id);
      if (row.data?._partial === true) partialCount++;
    }
    missingStats = finalIds.filter((id) => !stats.has(id)).length;
    missingEvents = finalIds.filter((id) => !events.has(id)).length;
  }

  signals.push({
    name: 'final_recap_cached',
    ok: missingStats === 0 && missingEvents === 0,
    detail: `${finalIds.length} FINAL · missing stats:${missingStats} events:${missingEvents}`,
  });
  signals.push({
    name: 'no_frozen_partial_cache',
    ok: partialCount === 0,
    detail: `${partialCount} incomplete cache row(s)`,
  });

  // Live fixtures whose score sync stalled (>10 min since last sync).
  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleLive } = await db
    .from('fixture').select('id').eq('status', 'LIVE')
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleCutoff}`);
  signals.push({
    name: 'live_sync_fresh',
    ok: ((staleLive ?? []).length) === 0,
    detail: `${(staleLive ?? []).length} LIVE fixture(s) not synced in >10 min`,
  });

  return signals;
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization');
  if (!auth || auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }

  try {
    const signals = await collectSignals();
    const ok = signals.every((s) => s.ok);
    // error-level log on failure so it surfaces in Supabase logs / alerting.
    if (!ok) console.error('[stale-data-health] UNHEALTHY', JSON.stringify(signals.filter((s) => !s.ok)));
    return new Response(JSON.stringify({ ok, signals }), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stale-data-health] FAILED', message);
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
});
