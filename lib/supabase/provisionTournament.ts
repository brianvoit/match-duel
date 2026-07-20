import { createServiceRoleClient } from '@/lib/supabase/service';
import { TOURNAMENT_FORMATS, type TournamentFormatId } from '@/lib/domain/tournamentFormats';

export interface ProvisionInput {
  name: string;
  year: number;
  format: TournamentFormatId;
  leagueId: number;
  season: number;
  startsAt: string;      // ISO
  endsAt?: string | null;
  /** Only flip is_active when explicitly true — provisioning defaults to inactive
   *  so it can never silently switch the live tournament out from under users. */
  activate?: boolean;
}

export interface ProvisionResult {
  tournamentId: string;
  created: boolean;
  activated: boolean;
  rounds: { stage: string; orderIndex: number; created: boolean }[];
}

/**
 * Idempotently stand up a tournament + its format's rounds. Replaces the old
 * hand-run SQL ritual. Safe to re-run: an existing tournament (matched by year)
 * is updated in place, and only missing rounds are inserted. Activation
 * (is_active) is only touched when `activate: true`, and then every other
 * tournament is deactivated first to satisfy the single-active-tournament index.
 */
export async function provisionTournament(input: ProvisionInput): Promise<ProvisionResult> {
  const service = createServiceRoleClient();
  const fmt = TOURNAMENT_FORMATS[input.format];
  if (!fmt) throw new Error(`Unknown tournament format: ${input.format}`);

  // Activation needs at most one active row (partial unique index): clear first.
  if (input.activate) {
    await service.from('tournament').update({ is_active: false }).eq('is_active', true);
  }

  const baseRow = {
    name: input.name,
    year: input.year,
    starts_at: input.startsAt,
    ends_at: input.endsAt ?? null,
    league_id: input.leagueId,
    season: input.season,
    format: input.format,
  };

  const { data: existing } = await service
    .from('tournament').select('id').eq('year', input.year).maybeSingle() as { data: { id: string } | null };

  let tournamentId: string;
  let created = false;
  if (existing) {
    tournamentId = existing.id;
    // Don't touch is_active unless activating (preserve current state otherwise).
    const updateRow = input.activate ? { ...baseRow, is_active: true } : baseRow;
    const { error } = await service.from('tournament').update(updateRow).eq('id', tournamentId);
    if (error) throw new Error(`Failed to update tournament: ${error.message}`);
  } else {
    const { data, error } = await service
      .from('tournament')
      .insert({ ...baseRow, is_active: input.activate ?? false })
      .select('id').single() as { data: { id: string } | null; error: { message: string } | null };
    if (error || !data) throw new Error(`Failed to insert tournament: ${error?.message ?? 'no row'}`);
    tournamentId = data.id;
    created = true;
  }

  // Insert only the rounds this tournament doesn't already have (by stage).
  const { data: existingRounds } = await service
    .from('round').select('stage').eq('tournament_id', tournamentId) as { data: { stage: string }[] | null };
  const have = new Set((existingRounds ?? []).map((r) => r.stage));

  const rounds: ProvisionResult['rounds'] = [];
  const toInsert: { tournament_id: string; stage: string; order_index: number; is_complete: boolean }[] = [];
  fmt.stages.forEach((stage, i) => {
    const orderIndex = i + 1;
    const isNew = !have.has(stage);
    rounds.push({ stage, orderIndex, created: isNew });
    if (isNew) toInsert.push({ tournament_id: tournamentId, stage, order_index: orderIndex, is_complete: false });
  });
  if (toInsert.length) {
    const { error } = await service.from('round').insert(toInsert);
    if (error) throw new Error(`Failed to insert rounds: ${error.message}`);
  }

  return { tournamentId, created, activated: input.activate ?? false, rounds };
}
