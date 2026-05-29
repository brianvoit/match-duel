import { createServiceRoleClient } from '@/lib/supabase/service';
import { FixtureSyncPayload, ProviderFixture } from '@/lib/jobs/fixtureProvider';

interface SyncResult {
  createdCount: number;
  updatedCount: number;
  processedCount: number;
  dryRun: boolean;
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
  let existingByNaturalKey = new Set<string>();

  if (allProviderIds.length > 0) {
    const { data, error } = await service
      .from('fixture')
      .select('external_provider_id')
      .in('external_provider_id', allProviderIds);

    if (error) {
      throw new Error(`Failed to lookup existing provider-id fixtures: ${error.message}`);
    }

    existingByProviderId = new Set(
      (data ?? []).map((row) => row.external_provider_id).filter((value): value is string => Boolean(value))
    );
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

  if (!payload.dryRun) {
    if (fixturesWithProviderId.length > 0) {
      for (const fixture of fixturesWithProviderId) {
        const dbRow = toDbFixtureRow(fixture);
        const providerId = fixture.externalProviderId as string;

        if (existingByProviderId.has(providerId)) {
          const { error } = await service.from('fixture').update(dbRow).eq('external_provider_id', providerId);

          if (error) {
            throw new Error(`Failed provider-id fixture update: ${error.message}`);
          }
          continue;
        }

        const { error } = await service.from('fixture').insert(dbRow);

        if (error) {
          throw new Error(`Failed provider-id fixture insert: ${error.message}`);
        }
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
    dryRun: payload.dryRun
  };
}
