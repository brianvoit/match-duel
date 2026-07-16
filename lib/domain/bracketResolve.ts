import type { Slot } from '@/lib/domain/bracket';
import { ANNEX_C } from '@/lib/domain/annexC';
import { isPlaceholderTeam } from '@/lib/domain/bracket';
import { teamCode } from '@/lib/data/teamInfo';

// ── Group standings + knockout slot resolution (pure, testable) ──────────────

export interface BracketFixture {
  group: string | null;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  status: string; // 'SCHEDULED' | 'LIVE' | 'FINAL' | ...
}

export interface GroupTeamRecord {
  team: string;
  group: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export interface GroupTables {
  /** Ranked standings per group (from FINAL fixtures only). */
  standings: Record<string, GroupTeamRecord[]>;
  /** Groups where every fixture is FINAL (so winner/runner-up are settled). */
  completeGroups: Set<string>;
  /** Every group that has fixtures (whether complete or not). */
  allGroups: Set<string>;
}

function emptyRecord(team: string, group: string): GroupTeamRecord {
  return { team, group, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

/**
 * Build ranked group tables from group-stage fixtures. Standings use FINAL
 * fixtures only; ranking is points → goal difference → goals for (the FIFA
 * head-to-head and conduct/ranking tiebreakers are out of scope for this pass).
 */
export function buildGroupTables(fixtures: BracketFixture[]): GroupTables {
  const tables = new Map<string, Map<string, GroupTeamRecord>>();
  const groupFixtureStatus = new Map<string, { total: number; final: number }>();

  for (const f of fixtures) {
    if (!f.group) continue;
    const counts = groupFixtureStatus.get(f.group) ?? { total: 0, final: 0 };
    counts.total += 1;
    if (f.status === 'FINAL') counts.final += 1;
    groupFixtureStatus.set(f.group, counts);

    if (f.status !== 'FINAL' || f.homeGoals == null || f.awayGoals == null) continue;

    if (!tables.has(f.group)) tables.set(f.group, new Map());
    const group = tables.get(f.group)!;
    const home = group.get(f.homeTeam) ?? emptyRecord(f.homeTeam, f.group);
    const away = group.get(f.awayTeam) ?? emptyRecord(f.awayTeam, f.group);

    home.played++; away.played++;
    home.gf += f.homeGoals; home.ga += f.awayGoals;
    away.gf += f.awayGoals; away.ga += f.homeGoals;

    if (f.homeGoals > f.awayGoals) { home.won++; home.points += 3; away.lost++; }
    else if (f.homeGoals < f.awayGoals) { away.won++; away.points += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }

    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;
    group.set(f.homeTeam, home);
    group.set(f.awayTeam, away);
  }

  const standings: Record<string, GroupTeamRecord[]> = {};
  for (const [group, teams] of tables) {
    standings[group] = [...teams.values()].sort((a, b) =>
      b.points - a.points ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      a.team.localeCompare(b.team),
    );
  }

  const completeGroups = new Set<string>();
  const allGroups = new Set<string>();
  for (const [group, counts] of groupFixtureStatus) {
    allGroups.add(group);
    if (counts.total > 0 && counts.final === counts.total) completeGroups.add(group);
  }

  return { standings, completeGroups, allGroups };
}

/**
 * Once every group is complete, rank the 12 third-place teams and resolve which
 * 3rd-place team fills each of the 8 variable Round-of-32 matches, via Annex C.
 *
 * Returns a { matchCode → teamName } map (empty until all groups finish, or if
 * the Annex C row for this combination doesn't validate — in which case the
 * slots stay placeholders and the API remains authoritative).
 *
 * Ranking uses points → goal difference → goals for → group letter. The FIFA
 * conduct and world-ranking tiebreakers are not modelled (no card/ranking data).
 */
export function computeThirdsByMatch(tables: GroupTables): Record<string, string> {
  if (tables.allGroups.size === 0 || tables.completeGroups.size < tables.allGroups.size) return {};

  const thirds: GroupTeamRecord[] = [];
  for (const group of tables.allGroups) {
    const rec = tables.standings[group]?.[2];
    if (rec) thirds.push(rec);
  }
  if (thirds.length < 8) return {};

  thirds.sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.group.localeCompare(b.group),
  );

  const best8 = thirds.slice(0, 8).map((r) => r.group);
  const key = [...best8].sort().join('');
  const assignment = ANNEX_C[key];
  if (!assignment) return {};

  // Defensive: ignore a malformed Annex C row (assigned groups must be exactly
  // the 8 qualifying groups) so a bad table entry never produces wrong teams.
  const assignedGroups = Object.values(assignment);
  if ([...new Set(assignedGroups)].sort().join('') !== key) return {};

  const out: Record<string, string> = {};
  for (const [matchCode, group] of Object.entries(assignment)) {
    const team = tables.standings[group]?.[2]?.team;
    if (team) out[matchCode] = team;
  }
  return out;
}

export interface ResolveContext {
  tables: GroupTables;
  /** Decided knockout matches, by bracket code → winner/loser team names. */
  matchResults: Record<string, { winner: string; loser: string }>;
  /** Resolved third-place teams, by bracket match code (from API/Annex C). */
  thirdsByMatch?: Record<string, string>;
}

/**
 * Resolve a single slot to a team name, or null if not yet determined.
 * `matchCode` is the code of the match this slot belongs to (needed for third-
 * place slots, which are keyed by match in the Annex C / API mapping).
 */
export function resolveSlot(slot: Slot, ctx: ResolveContext, matchCode: string): string | null {
  switch (slot.kind) {
    case 'winner':
      return ctx.tables.completeGroups.has(slot.group)
        ? ctx.tables.standings[slot.group]?.[0]?.team ?? null
        : null;
    case 'runnerUp':
      return ctx.tables.completeGroups.has(slot.group)
        ? ctx.tables.standings[slot.group]?.[1]?.team ?? null
        : null;
    case 'third':
      return ctx.thirdsByMatch?.[matchCode] ?? null;
    case 'matchWinner':
      return ctx.matchResults[slot.code]?.winner ?? null;
    case 'matchLoser':
      return ctx.matchResults[slot.code]?.loser ?? null;
  }
}

// ── API-first reconciliation ────────────────────────────────────────────────

export interface OurKnockoutSlot {
  fixtureId: string;
  bracketCode: string;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  externalId: string | null;
  locked: boolean;
}

export interface ApiKnockout {
  apiId: string;
  stage: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string | null;
}

export interface BracketUpdate {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  externalId: string;
  kickoff: string | null;
}

/**
 * Reconcile our knockout slots against the real API draw. Each knockout match
 * has at least one side we've already resolved (a group winner/runner-up), and
 * every team appears in exactly one match per round — so we match an API fixture
 * to our slot by that shared real team (compared by code, so the API's name
 * variants collapse), then **adopt the API's home/away orientation** as the
 * source of truth: the API's home team becomes our home side. We keep our own
 * canonical name for a side we already know, and take the API's name for a
 * still-placeholder side (e.g. an unfilled 3rd-place opponent).
 *
 * When this reverses a slot whose teams were already resolved, the fixture's
 * scores and its picks must be swapped to match (see apply_bracket_link) so each
 * pick stays on its chosen team. This function is pure — it only reports the
 * intended home/away; the caller performs the atomic swap.
 *
 * Pure and defensive: only acts on API fixtures with two real teams, never
 * touches locked slots, and matches at most one API fixture per slot.
 */
export function reconcileApiKnockouts(ours: OurKnockoutSlot[], api: ApiKnockout[]): BracketUpdate[] {
  const updates: BracketUpdate[] = [];
  const usedSlots = new Set<string>();

  for (const a of api) {
    if (!a.homeTeam || !a.awayTeam || isPlaceholderTeam(a.homeTeam) || isPlaceholderTeam(a.awayTeam)) continue;
    const apiCodes = [teamCode(a.homeTeam), teamCode(a.awayTeam)];

    const slot = ours.find((s) =>
      !usedSlots.has(s.fixtureId) &&
      !s.locked &&
      s.stage === a.stage &&
      ((!isPlaceholderTeam(s.homeTeam) && apiCodes.includes(teamCode(s.homeTeam))) ||
       (!isPlaceholderTeam(s.awayTeam) && apiCodes.includes(teamCode(s.awayTeam)))),
    );
    if (!slot) continue;
    usedSlots.add(slot.fixtureId);

    // Adopt the API's home/away orientation. Use our resolved canonical name for
    // a side we already know (matched by code); take the API's name otherwise.
    const known = [slot.homeTeam, slot.awayTeam].filter((t) => !isPlaceholderTeam(t));
    const canonical = (apiTeam: string) => known.find((t) => teamCode(t) === teamCode(apiTeam)) ?? apiTeam;
    const home = canonical(a.homeTeam);
    const away = canonical(a.awayTeam);

    if (home !== slot.homeTeam || away !== slot.awayTeam || slot.externalId !== a.apiId) {
      updates.push({ fixtureId: slot.fixtureId, homeTeam: home, awayTeam: away, externalId: a.apiId, kickoff: a.kickoff });
    }
  }

  return updates;
}

/** Winner/loser of a decided fixture (penalty-aware), or null if not decided. */
export function decideMatch(input: {
  homeTeam: string;
  awayTeam: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homePen: number | null;
  awayPen: number | null;
  status: string;
}): { winner: string; loser: string } | null {
  if (input.status !== 'FINAL' || input.homeGoals == null || input.awayGoals == null) return null;
  if (input.homeGoals > input.awayGoals) return { winner: input.homeTeam, loser: input.awayTeam };
  if (input.homeGoals < input.awayGoals) return { winner: input.awayTeam, loser: input.homeTeam };
  // Level → penalty shootout decides a knockout match.
  if (input.homePen != null && input.awayPen != null && input.homePen !== input.awayPen) {
    return input.homePen > input.awayPen
      ? { winner: input.homeTeam, loser: input.awayTeam }
      : { winner: input.awayTeam, loser: input.homeTeam };
  }
  return null;
}
