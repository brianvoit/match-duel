import { createServiceRoleClient } from '@/lib/supabase/service';
import { FixtureSyncPayload, ProviderFixture } from '@/lib/jobs/fixtureProvider';

export interface NewlyFinalFixture {
  id: string;           // internal UUID
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  roundId: string;
}

interface SyncResult {
  createdCount: number;
  updatedCount: number;
  processedCount: number;
  dryRun: boolean;
  newlyFinal: NewlyFinalFixture[];
}

function toDbFixtureRow(fixture: ProviderFixture) {
  return {
    external_provider_id: fixture.externalProviderId ?? null,
    round_id: fixture.roundId,
    starts_at: fixture.startsAt,
    home_team: fixture.homeTeam,
    away_team: fixture.awayTeam,
    home_score: fixture.homeScore ?? null,
    away_score: fixture.awayScore ?? null,
    home_pen_score: fixture.homePenScore ?? null,
    away_pen_score: fixture.awayPenScore ?? null,
    status: fixture.status,
    matchday: fixture.matchday ?? null,
    group_name: fixture.groupName ?? null,
    venue: fixture.venue ?? null,
    city: fixture.city ?? null,
    last_synced_at: new Date().toISOString()
  };
}

export async function runFixtureSync(payload: FixtureSyncPayload): Promise<SyncResult> {
  const service = createServiceRoleClient();

  const fixturesWithProviderId = payload.fixtures.filter((fixture) => Boolean(fixture.externalProviderId));
  const fixturesWithoutProviderId = payload.fixtures.filter((fixture) => !fixture.externalProviderId);

  const allProviderIds = fixturesWithProviderId.map((fixture) => fixture.externalProviderId as string);
  const allNaturalKeys = fixturesWithoutProviderId.map((fixture) => ({
    round_id: fixture.roundId,
    home_team: fixture.homeTeam,
    away_team: fixture.awayTeam,
    starts_at: fixture.startsAt
  }));

  let existingByProviderId = new Set<string>();
  // Track pre-sync status so we can detect FINAL transitions
  const preSyncStatusByProviderId = new Map<string, string>();
  const preSyncIdByProviderId = new Map<string, string>();
  const preSyncRoundIdByProviderId = new Map<string, string>();
  let existingByNaturalKey = new Set<string>();

  if (allProviderIds.length > 0) {
    const { data, error } = await service
      .from('fixture')
      .select('id, external_provider_id, status, round_id')
      .in('external_provider_id', allProviderIds);

    if (error) {
      throw new Error(`Failed to lookup existing provider-id fixtures: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ id: string; external_provider_id: string; status: string; round_id: string }>) {
      if (row.external_provider_id) {
        existingByProviderId.add(row.external_provider_id);
        preSyncStatusByProviderId.set(row.external_provider_id, row.status);
        preSyncIdByProviderId.set(row.external_provider_id, row.id);
        preSyncRoundIdByProviderId.set(row.external_provider_id, row.round_id);
      }
    }
  }

  if (allNaturalKeys.length > 0) {
    const roundIds = [...new Set(allNaturalKeys.map((key) => key.round_id))];
    const { data, error } = await service
      .from('fixture')
      .select('round_id, home_team, away_team, starts_at')
      .in('round_id', roundIds);

    if (error) {
      throw new Error(`Failed to lookup existing natural-key fixtures: ${error.message}`);
    }

    existingByNaturalKey = new Set(
      (data ?? []).map(
        (row) => `${row.round_id}|${row.home_team}|${row.away_team}|${new Date(row.starts_at).toISOString()}`
      )
    );
  }

  const countCreatedByProvider = fixturesWithProviderId.filter(
    (fixture) => !existingByProviderId.has(fixture.externalProviderId as string)
  ).length;

  const countCreatedByNatural = fixturesWithoutProviderId.filter((fixture) => {
    const key = `${fixture.roundId}|${fixture.homeTeam}|${fixture.awayTeam}|${new Date(fixture.startsAt).toISOString()}`;
    return !existingByNaturalKey.has(key);
  }).length;

  const createdCount = countCreatedByProvider + countCreatedByNatural;

  const newlyFinal: NewlyFinalFixture[] = [];

  if (!payload.dryRun) {
    if (fixturesWithProviderId.length > 0) {
      for (const fixture of fixturesWithProviderId) {
        const dbRow = toDbFixtureRow(fixture);
        const providerId = fixture.externalProviderId as string;

        if (existingByProviderId.has(providerId)) {
          // Preserve curated fields on existing rows. Team names: the DB uses official
          // FIFA names (e.g. "Czechia", "Côte d'Ivoire") while API-Football sends its own
          // variants — overwriting churns display and breaks flag lookups. group_name:
          // API-Football's fixtures feed doesn't include it (mapper always sends null),
          // so it must never clobber the seeded group letters. Only sync volatile fields.
          const { home_team: _h, away_team: _a, group_name: _g, ...updateRow } = dbRow;
          const { error } = await service.from('fixture').update(updateRow).eq('external_provider_id', providerId);
          if (error) throw new Error(`Failed provider-id fixture update: ${error.message}`);

          // Detect FINAL transition
          const prevStatus = preSyncStatusByProviderId.get(providerId);
          if (fixture.status === 'FINAL' && prevStatus && prevStatus !== 'FINAL') {
            const fixtureId = preSyncIdByProviderId.get(providerId);
            const roundId   = preSyncRoundIdByProviderId.get(providerId);
            if (fixtureId && roundId) {
              newlyFinal.push({
                id: fixtureId,
                homeTeam:  fixture.homeTeam,
                awayTeam:  fixture.awayTeam,
                homeScore: fixture.homeScore ?? null,
                awayScore: fixture.awayScore ?? null,
                roundId,
              });
            }
          }
          continue;
        }

        const { error } = await service.from('fixture').insert(dbRow);
        if (error) throw new Error(`Failed provider-id fixture insert: ${error.message}`);
      }
    }

    if (fixturesWithoutProviderId.length > 0) {
      const { error } = await service.from('fixture').upsert(
        fixturesWithoutProviderId.map(toDbFixtureRow),
        {
          onConflict: 'round_id,home_team,away_team,starts_at'
        }
      );

      if (error) {
        throw new Error(`Failed natural-key fixture upsert: ${error.message}`);
      }
    }
  }

  return {
    processedCount: payload.fixtures.length,
    createdCount,
    updatedCount: payload.fixtures.length - createdCount,
    dryRun: payload.dryRun,
    newlyFinal,
  };
}
