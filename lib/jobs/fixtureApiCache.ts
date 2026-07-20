/**
 * Thin read/write wrapper around the fixture_api_cache table.
 *
 * Freshness rules per cache type:
 *   lineup    — forever once FINAL; 10 min while SCHEDULED/LIVE (catch late
 *               pre-kickoff lineup changes)
 *   stats     — forever once FINAL; 2 minutes while LIVE
 *   events    — forever once FINAL; 2 minutes while LIVE
 *   pre_match — 6 hours by default; callers may pass a shorter maxAgeOverrideMs
 *               near kickoff (odds/injuries move as the match approaches)
 *
 * NOTE: stats/events written while a match is LIVE must be invalidated when the
 * match goes FINAL (see invalidateCache) — otherwise the FINAL TTL of Infinity
 * would freeze a snapshot taken minutes before full-time, dropping late goals,
 * cards, and final stats. The live-sync pipeline calls invalidateCache on every
 * fixture that just transitioned to FINAL.
 */

import { createServiceRoleClient } from '@/lib/supabase/service';

export type CacheType = 'lineup' | 'stats' | 'events' | 'pre_match';

type FixtureStatus = 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED' | 'CANCELED';

function maxAgeMs(type: CacheType, status: FixtureStatus): number {
  if (status === 'FINAL') {
    // Once a match is over, data never changes — cache forever
    return type === 'pre_match' ? 0 : Infinity;
  }
  switch (type) {
    case 'lineup':    return 10 * 60 * 1000;        // 10 minutes (late lineup changes)
    case 'stats':
    case 'events':    return 2 * 60 * 1000;          // 2 minutes (live updates)
    case 'pre_match': return 6 * 60 * 60 * 1000;    // 6 hours (override near kickoff)
  }
}

// A payload flagged incomplete (see setCached `complete:false`) is never frozen
// by the FINAL Infinity TTL — cap it so it's periodically re-fetched until the
// provider fills the gap (e.g. an events feed still missing shootout kicks).
const PARTIAL_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

/** Return cached data if fresh, otherwise null. Pass maxAgeOverrideMs to tighten the TTL. */
export async function getCached(
  fixtureId: string,
  type: CacheType,
  status: FixtureStatus,
  maxAgeOverrideMs?: number
): Promise<Record<string, unknown> | null> {
  let ttl = maxAgeOverrideMs ?? maxAgeMs(type, status);
  if (ttl === 0) return null; // never serve stale (e.g. pre_match after FINAL)

  const service = createServiceRoleClient();
  const { data } = await service
    .from('fixture_api_cache')
    .select('data, fetched_at')
    .eq('fixture_id', fixtureId)
    .eq('cache_type', type)
    .maybeSingle() as { data: { data: Record<string, unknown>; fetched_at: string } | null };

  if (!data) return null;

  const stored = data.data ?? {};
  // Known-incomplete payloads get a short TTL instead of forever, so a later read
  // re-fetches and can pick up corrected/completed provider data.
  if (stored._partial === true) ttl = Math.min(ttl, PARTIAL_MAX_AGE_MS);

  const ageMs = Date.now() - new Date(data.fetched_at).getTime();
  if (ageMs > ttl) return null; // stale

  // Strip the internal marker so callers never see it.
  if (stored._partial === true) {
    const rest = { ...stored };
    delete rest._partial;
    return rest;
  }
  return stored;
}

/**
 * Upsert data into the cache. Pass `complete: false` for a non-empty but partial
 * payload (e.g. a FINAL fixture's events feed still missing shootout kicks) so it
 * isn't frozen forever by the FINAL Infinity TTL — it gets a short TTL and is
 * re-fetched until complete. Default is complete (cache per the normal rules).
 */
export async function setCached(
  fixtureId: string,
  type: CacheType,
  payload: Record<string, unknown>,
  opts?: { complete?: boolean }
): Promise<void> {
  const data = opts?.complete === false ? { ...payload, _partial: true } : payload;
  const service = createServiceRoleClient();
  await service
    .from('fixture_api_cache')
    .upsert(
      { fixture_id: fixtureId, cache_type: type, data, fetched_at: new Date().toISOString() },
      { onConflict: 'fixture_id,cache_type' }
    );
}

/**
 * Delete cached entries for the given fixtures + types. Used when a match goes
 * FINAL to drop LIVE-era stats/events snapshots so the next read fetches the
 * complete final data (and then caches it forever).
 */
export async function invalidateCache(
  fixtureIds: string[],
  types: CacheType[]
): Promise<void> {
  if (fixtureIds.length === 0 || types.length === 0) return;
  const service = createServiceRoleClient();
  await service
    .from('fixture_api_cache')
    .delete()
    .in('fixture_id', fixtureIds)
    .in('cache_type', types);
}
