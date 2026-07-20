import { teamCode } from '@/lib/data/teamInfo';

/**
 * Order two API-provided, team-tagged items into our fixture's [home, away].
 *
 * API-Football returns paired data (lineups, etc.) in its own [home, away]
 * order, but a knockout fixture's orientation can be reversed vs the API — we
 * seed home/away from the bracket. Trusting the API's order would put the wrong
 * team on our home side. Match by team identity (code, so name variants like
 * "Czechia"/"Czech Republic" collapse); fall back to the API's given order only
 * for a stand-in id whose real teams don't match ours.
 */
export function orderByFixtureSides<T>(
  items: T[],
  teamNameOf: (item: T) => string,
  homeTeam: string,
  awayTeam: string,
): [T | null, T | null] {
  const homeCode = teamCode(homeTeam);
  const awayCode = teamCode(awayTeam);
  const byHome = items.find((i) => teamCode(teamNameOf(i)) === homeCode);
  const byAway = items.find((i) => teamCode(teamNameOf(i)) === awayCode);
  const home = byHome ?? items.find((i) => i !== byAway) ?? null;
  const away = byAway ?? items.find((i) => i !== home) ?? null;
  return [home, away];
}

/**
 * Which of our fixture's sides an API-provided team belongs to, matched by
 * identity (code, so name variants like "Czechia"/"Czech Republic" collapse) —
 * NOT by the API's position order, which can be reversed vs our bracket-seeded
 * orientation for a knockout fixture. Returns null when it matches neither side
 * (a stand-in id whose real teams aren't ours); callers pick their own fallback.
 *
 * This is the single-item companion to orderByFixtureSides — use it wherever a
 * route needs to bucket API data (events, injuries, unavailable players,
 * historical meetings, win-probability) onto our home/away.
 */
export function sideForApiTeam(
  apiTeamName: string,
  homeTeam: string,
  awayTeam: string,
): 'HOME' | 'AWAY' | null {
  const code = teamCode(apiTeamName);
  if (code === teamCode(homeTeam)) return 'HOME';
  if (code === teamCode(awayTeam)) return 'AWAY';
  return null;
}
