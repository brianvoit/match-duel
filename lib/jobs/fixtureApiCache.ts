/**
 * Thin read/write wrapper around the fixture_api_cache table.
 *
 * Freshness rules per cache type:
 *   lineup    — forever once FINAL; 2 hours for SCHEDULED/pre-kickoff
 *   stats     — forever once FINAL; 2 minutes for LIVE
 *   events    — forever once FINAL; 2 minutes for LIVE
 *   pre_match — 6 hours; irrelevant once FINAL
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
    case 'lineup':    return 2 * 60 * 60 * 1000;   // 2 hours
    case 'stats':
    case 'events':    return 2 * 60 * 1000;          // 2 minutes (live updates)
    case 'pre_match': return 6 * 60 * 60 * 1000;    // 6 hours
  }
}

/** Return cached data if fresh, otherwise null. */
export async function getCached(
  fixtureId: string,
  type: CacheType,
  status: FixtureStatus
): Promise<Record<string, unknown> | null> {
  const ttl = maxAgeMs(type, status);
  if (ttl === 0) return null; // pre_match after FINAL — never serve stale

  const service = createServiceRoleClient();
  const { data } = await service
    .from('fixture_api_cache')
    .select('data, fetched_at')
    .eq('fixture_id', fixtureId)
    .eq('cache_type', type)
    .maybeSingle() as { data: { data: Record<string, unknown>; fetched_at: string } | null };

  if (!data) return null;

  const ageMs = Date.now() - new Date(data.fetched_at).getTime();
  if (ageMs > ttl) return null; // stale

  return data.data;
}

/** Upsert data into the cache. */
export async function setCached(
  fixtureId: string,
  type: CacheType,
  payload: Record<string, unknown>
): Promise<void> {
  const service = createServiceRoleClient();
  await service
    .from('fixture_api_cache')
    .upsert(
      { fixture_id: fixtureId, cache_type: type, data: payload, fetched_at: new Date().toISOString() },
      { onConflict: 'fixture_id,cache_type' }
    );
}
