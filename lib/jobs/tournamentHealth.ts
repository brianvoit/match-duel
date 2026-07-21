import { createServiceRoleClient } from '@/lib/supabase/service';
import { TOURNAMENT_FORMATS, isTournamentFormatId } from '@/lib/domain/tournamentFormats';
import { bracketForFormat } from '@/lib/domain/bracket';

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** Only critical signals drive the overall `ok` (and therefore alerting).
   *  Informational ones are reported for visibility but are expected to be
   *  false sometimes — e.g. recap data is cached lazily on first view, and a
   *  provider gap can leave a cache row permanently incomplete. Alerting on
   *  those would make the monitor permanently red and therefore ignored. */
  critical?: boolean;
}

type TournamentRow = {
  id: string; name: string; year: number;
  league_id: number | null; season: number | null; format: string | null; is_active: boolean;
};

/**
 * Pre-tournament go/no-go checklist for a tournament (defaults to the active one).
 * DB-only (no API-Football calls), so it's cheap to run and safe to hit often.
 * Turns "discover the setup bug during the opening match" into a green/red board.
 */
export async function getReadiness(tournamentId?: string): Promise<{ ok: boolean; tournamentId: string | null; checks: Check[] }> {
  const service = createServiceRoleClient();
  const checks: Check[] = [];

  // Exactly one active tournament.
  const { data: actives } = await service
    .from('tournament').select('id, name, year, league_id, season, format, is_active')
    .eq('is_active', true) as { data: TournamentRow[] | null };
  checks.push({
    name: 'single_active_tournament',
    ok: (actives?.length ?? 0) === 1,
    detail: `${actives?.length ?? 0} active tournament(s)`,
  });

  // Resolve the tournament to inspect.
  let t: TournamentRow | null = tournamentId ? null : (actives?.[0] ?? null);
  if (tournamentId) {
    const { data } = await service
      .from('tournament').select('id, name, year, league_id, season, format, is_active')
      .eq('id', tournamentId).maybeSingle() as { data: TournamentRow | null };
    t = data;
  }
  if (!t) {
    checks.push({ name: 'tournament_exists', ok: false, detail: 'No tournament to check.' });
    return { ok: false, tournamentId: tournamentId ?? null, checks };
  }

  // league_id + season set, and season matches the tournament year.
  checks.push({
    name: 'league_and_season_set',
    ok: t.league_id != null && t.season != null,
    detail: `league_id=${t.league_id ?? 'null'}, season=${t.season ?? 'null'}`,
  });
  checks.push({
    name: 'season_matches_year',
    ok: t.season === t.year,
    detail: `season=${t.season ?? 'null'} vs year=${t.year}`,
  });

  // Format known, and its rounds all exist.
  const format = t.format ?? '';
  const knownFormat = isTournamentFormatId(format);
  checks.push({ name: 'format_known', ok: knownFormat, detail: `format=${format || 'null'}` });

  const { data: rounds } = await service
    .from('round').select('stage, order_index').eq('tournament_id', t.id) as { data: Array<{ stage: string; order_index: number }> | null };
  const haveStages = new Set((rounds ?? []).map((r) => r.stage));
  if (knownFormat) {
    const expected = TOURNAMENT_FORMATS[format].stages;
    const missing = expected.filter((s) => !haveStages.has(s));
    checks.push({
      name: 'rounds_present',
      ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(', ')}` : `${expected.length} rounds present`,
    });

    // Knockout bracket skeleton fully seeded.
    const bracket = bracketForFormat(format);
    const { count: koCount } = await service
      .from('fixture').select('id', { count: 'exact', head: true })
      .in('bracket_code', bracket.map((m) => m.code)) as { count: number | null };
    checks.push({
      name: 'bracket_seeded',
      ok: (koCount ?? 0) === bracket.length,
      detail: `${koCount ?? 0}/${bracket.length} bracket fixtures`,
    });
  }

  // Group-stage fixtures present (the API sync fills these once the season opens).
  if (haveStages.has('GROUP')) {
    const { data: groupRoundRows } = await service
      .from('round').select('id').eq('tournament_id', t.id).eq('stage', 'GROUP') as { data: Array<{ id: string }> | null };
    const ids = (groupRoundRows ?? []).map((r) => r.id);
    const { count: groupFxCount } = ids.length
      ? await service.from('fixture').select('id', { count: 'exact', head: true }).in('round_id', ids) as { count: number | null }
      : { count: 0 };
    checks.push({
      name: 'group_fixtures_synced',
      ok: (groupFxCount ?? 0) > 0,
      detail: `${groupFxCount ?? 0} group fixtures (sync from API-Football once the season opens)`,
    });
  }

  return { ok: checks.every((c) => c.ok), tournamentId: t.id, checks };
}

/**
 * Data-integrity watchdog signals. DB-only, so cheap to run on a schedule. Flags
 * the failure classes seen during the men's run: FINAL fixtures whose recap data
 * is missing or frozen-partial, and live fixtures whose score sync has stalled.
 */
export async function getDataHealth(): Promise<{ ok: boolean; signals: Check[] }> {
  const service = createServiceRoleClient();
  const signals: Check[] = [];

  // FINAL fixtures with a real external id but no cached stats/events (recap gaps),
  // or a cache row flagged incomplete (_partial) that never healed.
  const { data: finals } = await service
    .from('fixture').select('id').eq('status', 'FINAL').not('external_provider_id', 'is', null) as { data: Array<{ id: string }> | null };
  const finalIds = new Set((finals ?? []).map((f) => f.id));

  const { data: cacheRows } = finalIds.size
    ? await service.from('fixture_api_cache').select('fixture_id, cache_type, data')
        .in('fixture_id', [...finalIds]).in('cache_type', ['stats', 'events']) as {
          data: Array<{ fixture_id: string; cache_type: string; data: { _partial?: boolean } }> | null;
        }
    : { data: [] };

  const cached = { stats: new Set<string>(), events: new Set<string>() };
  let partialCount = 0;
  for (const row of cacheRows ?? []) {
    if (row.cache_type === 'stats' || row.cache_type === 'events') cached[row.cache_type].add(row.fixture_id);
    if (row.data?._partial === true) partialCount++;
  }
  const missingStats = [...finalIds].filter((id) => !cached.stats.has(id)).length;
  const missingEvents = [...finalIds].filter((id) => !cached.events.has(id)).length;

  signals.push({
    name: 'final_recap_cached',
    ok: missingStats === 0 && missingEvents === 0,
    detail: `${finalIds.size} FINAL · missing stats:${missingStats} events:${missingEvents} (populated lazily on view; backfill if 0 viewers expected)`,
    critical: false,
  });
  signals.push({
    name: 'no_frozen_partial_cache',
    ok: partialCount === 0,
    detail: `${partialCount} cache row(s) flagged incomplete (will self-heal on next fetch)`,
    critical: false,
  });

  // Live fixtures whose score sync has stalled (last_synced_at older than 10 min).
  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleLive } = await service
    .from('fixture').select('id, last_synced_at').eq('status', 'LIVE')
    .or(`last_synced_at.is.null,last_synced_at.lt.${staleCutoff}`) as { data: Array<{ id: string }> | null };
  signals.push({
    name: 'live_sync_fresh',
    ok: (staleLive?.length ?? 0) === 0,
    detail: `${staleLive?.length ?? 0} LIVE fixture(s) not synced in >10 min`,
    critical: true,
  });

  // Only critical signals gate `ok` — see Check.critical.
  return { ok: signals.filter((s) => s.critical).every((s) => s.ok), signals };
}
