import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
import { BRACKET, slotLabel } from '@/lib/domain/bracket';
import { buildGroupTables, computeThirdsByMatch, resolveSlot, decideMatch, reconcileApiKnockouts } from '@/lib/domain/bracketResolve';
import type { BracketFixture, OurKnockoutSlot, ApiKnockout } from '@/lib/domain/bracketResolve';
import { fetchApiFootballFixtures, apiRoundToStage, WC_LEAGUE_ID } from '@/lib/jobs/apiFootballClient';

interface KnockoutFixtureRow {
  id: string;
  bracket_code: string | null;
  external_provider_id: string | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  home_pen_score: number | null;
  away_pen_score: number | null;
  status: string;
  bracket_locked: boolean;
}

async function activeTournamentId(service: ReturnType<typeof createServiceRoleClient>): Promise<string | null> {
  const { data } = await service
    .from('tournament').select('id').eq('is_active', true)
    .order('year', { ascending: false }).limit(1).maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/**
 * Idempotently create the knockout-bracket skeleton (placeholder fixtures keyed
 * by bracket_code, external_provider_id null). Safe to run every cron tick — only
 * missing matches are inserted. Returns how many were created.
 */
export async function ensureBracketSeeded(input?: { tournamentId?: string }): Promise<{ seeded: number }> {
  const service = createServiceRoleClient();
  const tournamentId = input?.tournamentId ?? (await activeTournamentId(service));
  if (!tournamentId) return { seeded: 0 };

  const { data: rounds } = await service
    .from('round').select('id, stage').eq('tournament_id', tournamentId) as {
      data: Array<{ id: string; stage: string }> | null;
    };
  const roundIdByStage = new Map((rounds ?? []).map((r) => [r.stage, r.id]));
  if ([...new Set(BRACKET.map((m) => m.stage))].some((s) => !roundIdByStage.has(s))) return { seeded: 0 };

  const { data: existing } = await service
    .from('fixture').select('bracket_code').in('bracket_code', BRACKET.map((m) => m.code)) as {
      data: Array<{ bracket_code: string | null }> | null;
    };
  const have = new Set((existing ?? []).map((e) => e.bracket_code));

  const rows = BRACKET.filter((m) => !have.has(m.code)).map((m) => ({
    round_id: roundIdByStage.get(m.stage)!,
    bracket_code: m.code,
    external_provider_id: null,
    home_team: slotLabel(m.home),
    away_team: slotLabel(m.away),
    starts_at: m.startsAt,
    status: 'SCHEDULED' as const,
    venue: m.venue,
    city: m.city,
    group_name: null,
  }));

  if (rows.length > 0) await service.from('fixture').insert(rows);
  return { seeded: rows.length };
}

/**
 * Fill in knockout fixture teams from results so far. Group winners/runners-up
 * fill the 8 fixed Round-of-32 matches as each group finalises, and match
 * winners/losers propagate through R16 → Final. Unresolved slots keep their
 * placeholder label ("Winner Group A", "Winner M73"). The 8 third-place R32
 * slots are filled from `thirdsByMatch` (API / Annex C) in a later pass.
 *
 * Idempotent: only writes when a fixture's resolved teams differ from what's
 * stored, so it never clobbers a real team back to a placeholder.
 */
export async function runBracketResolution(input?: { tournamentId?: string }): Promise<{ updated: number }> {
  const service = createServiceRoleClient();

  let tournamentId = input?.tournamentId;
  if (!tournamentId) {
    const { data: t } = await service
      .from('tournament').select('id').eq('is_active', true)
      .order('year', { ascending: false }).limit(1).maybeSingle<{ id: string }>();
    if (!t) return { updated: 0 };
    tournamentId = t.id;
  }

  // Group-stage standings
  const { data: rounds } = await service
    .from('round').select('id, stage').eq('tournament_id', tournamentId) as {
      data: Array<{ id: string; stage: string }> | null;
    };
  const groupRoundIds = (rounds ?? []).filter((r) => r.stage === 'GROUP').map((r) => r.id);

  const { data: groupFx } = groupRoundIds.length
    ? await service
        .from('fixture')
        .select('group_name, home_team, away_team, home_score, away_score, status')
        .in('round_id', groupRoundIds) as {
          data: Array<{ group_name: string | null; home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string }> | null;
        }
    : { data: [] };

  const tables = buildGroupTables((groupFx ?? []).map((f): BracketFixture => ({
    group: f.group_name,
    homeTeam: f.home_team,
    awayTeam: f.away_team,
    homeGoals: f.home_score,
    awayGoals: f.away_score,
    status: f.status,
  })));

  // Knockout fixtures (keyed by stable bracket_code). A fixture with a real
  // external_provider_id has been linked to the published API draw — its results
  // still feed progression, but the resolver never overwrites its teams.
  const codes = BRACKET.map((m) => m.code);
  const { data: koFx } = await service
    .from('fixture')
    .select('id, bracket_code, external_provider_id, home_team, away_team, home_score, away_score, home_pen_score, away_pen_score, status, bracket_locked')
    .in('bracket_code', codes) as { data: KnockoutFixtureRow[] | null };

  const byCode = new Map<string, KnockoutFixtureRow>();
  for (const f of koFx ?? []) {
    if (f.bracket_code) byCode.set(f.bracket_code, f);
  }

  // Winners/losers of decided knockout matches, for progression.
  const matchResults: Record<string, { winner: string; loser: string }> = {};
  for (const m of BRACKET) {
    const f = byCode.get(m.code);
    if (!f) continue;
    const decided = decideMatch({
      homeTeam: f.home_team, awayTeam: f.away_team,
      homeGoals: f.home_score, awayGoals: f.away_score,
      homePen: f.home_pen_score, awayPen: f.away_pen_score,
      status: f.status,
    });
    if (decided) matchResults[m.code] = decided;
  }

  // Third-place R32 opponents (filled once every group is complete, via Annex C).
  // TODO(api-first): when API-Football publishes the real knockout draw, prefer
  // its assignments over this computed fallback.
  const thirdsByMatch = computeThirdsByMatch(tables);

  const ctx = { tables, matchResults, thirdsByMatch };

  let updated = 0;
  for (const m of BRACKET) {
    const f = byCode.get(m.code);
    if (!f) continue;
    // API-first: once a fixture is linked to the real draw (or pinned by an
    // admin), the computed resolver leaves its teams alone (its result still fed
    // matchResults above).
    if (f.external_provider_id || f.bracket_locked) continue;
    const home = resolveSlot(m.home, ctx, m.code) ?? slotLabel(m.home);
    const away = resolveSlot(m.away, ctx, m.code) ?? slotLabel(m.away);
    if (home !== f.home_team || away !== f.away_team) {
      await service.from('fixture').update({ home_team: home, away_team: away }).eq('id', f.id);
      updated++;
    }
  }

  return { updated };
}

const KNOCKOUT_STAGES = new Set(['ROUND_OF_32', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'THIRD_PLACE', 'FINAL']);

/**
 * API-first reconciliation: pull the real draw from API-Football and adopt its
 * team assignments for our knockout slots (filling 3rd-place opponents and
 * auto-correcting any Annex C gap the moment the draw is published), and link the
 * real fixture id so live scores flow. Defers to admin-locked slots. Disable with
 * BRACKET_API_RECONCILE=off. Best-effort: API/network failures are swallowed so
 * the rest of the sync still runs.
 */
export async function reconcileBracketFromApi(input?: { tournamentId?: string }): Promise<{ linked: number; skipped?: string }> {
  if (serverEnv.BRACKET_API_RECONCILE === 'off') return { linked: 0, skipped: 'disabled' };

  const service = createServiceRoleClient();
  const tournamentId = input?.tournamentId ?? (await activeTournamentId(service));
  if (!tournamentId) return { linked: 0, skipped: 'no_tournament' };

  const { data: koFx } = await service
    .from('fixture')
    .select('id, bracket_code, external_provider_id, home_team, away_team, bracket_locked')
    .in('bracket_code', BRACKET.map((m) => m.code)) as {
      data: Array<{ id: string; bracket_code: string; external_provider_id: string | null; home_team: string; away_team: string; bracket_locked: boolean }> | null;
    };
  if (!koFx || koFx.length === 0) return { linked: 0, skipped: 'not_seeded' };

  const stageByCode = new Map(BRACKET.map((m) => [m.code, m.stage as string]));
  const ours: OurKnockoutSlot[] = koFx.map((f) => ({
    fixtureId: f.id,
    bracketCode: f.bracket_code,
    stage: stageByCode.get(f.bracket_code) ?? '',
    homeTeam: f.home_team,
    awayTeam: f.away_team,
    externalId: f.external_provider_id,
    locked: f.bracket_locked,
  }));

  // Nothing to do if every slot is already linked or locked.
  if (ours.every((s) => s.externalId || s.locked)) return { linked: 0, skipped: 'all_linked' };

  let apiFixtures;
  try {
    apiFixtures = await fetchApiFootballFixtures(WC_LEAGUE_ID, serverEnv.API_FOOTBALL_SEASON);
  } catch {
    return { linked: 0, skipped: 'api_error' };
  }

  const api: ApiKnockout[] = apiFixtures
    .map((f): ApiKnockout | null => {
      const stage = apiRoundToStage(f.league.round);
      if (!stage || !KNOCKOUT_STAGES.has(stage)) return null;
      return { apiId: String(f.fixture.id), stage, homeTeam: f.teams.home.name, awayTeam: f.teams.away.name, kickoff: f.fixture.date };
    })
    .filter((x): x is ApiKnockout => x !== null);

  const updates = reconcileApiKnockouts(ours, api);
  for (const u of updates) {
    await service.from('fixture').update({
      home_team: u.homeTeam,
      away_team: u.awayTeam,
      external_provider_id: u.externalId,
      ...(u.kickoff ? { starts_at: u.kickoff } : {}),
    }).eq('id', u.fixtureId);
  }

  return { linked: updates.length };
}
