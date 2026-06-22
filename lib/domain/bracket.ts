import type { StageName } from '@/lib/domain/types';

// ── Bracket structure ────────────────────────────────────────────────────────
//
// The 2026 knockout bracket is a fixed single-elimination tree (no reseeding).
// Each match's two slots are defined symbolically (group winner / runner-up /
// third place / winner-of / loser-of). As group standings finalise and knockout
// matches are decided, the resolver fills each slot with a real team name.
//
// Source of truth: wc2026_bracket_logic.md (FIFA Annex C). The 8 third-place
// slots in the Round of 32 are left unresolved here (kind 'third') and filled
// from API-Football (preferred) or the Annex C table (fallback) in a later pass.

export type Slot =
  | { kind: 'winner'; group: string }          // 1A — winner of Group A
  | { kind: 'runnerUp'; group: string }        // 2A — runner-up of Group A
  | { kind: 'third'; candidates: string[] }    // best 3rd from candidate groups (Annex C)
  | { kind: 'matchWinner'; code: string }      // winner of an earlier match
  | { kind: 'matchLoser'; code: string };      // loser of an earlier match (3rd-place game)

export interface BracketMatch {
  code: string;        // stable id: 'M73'..'M88', 'M89'..'M96', 'QF1'..'QF4', 'SF1','SF2', 'TP', 'F'
  stage: StageName;
  home: Slot;
  away: Slot;
  startsAt: string;    // ISO kickoff (approximate until API provides the real schedule)
  venue: string | null;
  city: string | null;
}

const w = (group: string): Slot => ({ kind: 'winner', group });
const r = (group: string): Slot => ({ kind: 'runnerUp', group });
const third = (candidates: string[]): Slot => ({ kind: 'third', candidates });
const mw = (code: string): Slot => ({ kind: 'matchWinner', code });
const ml = (code: string): Slot => ({ kind: 'matchLoser', code });

// Round of 32 (M73–M88). 8 fixed (winner/runner-up) + 8 variable (winner vs 3rd).
const ROUND_OF_32: BracketMatch[] = [
  { code: 'M73', stage: 'ROUND_OF_32', home: r('A'), away: r('B'), startsAt: '2026-06-29T16:00:00Z', venue: null, city: null },
  { code: 'M74', stage: 'ROUND_OF_32', home: w('E'), away: third(['A', 'B', 'C', 'D', 'F']), startsAt: '2026-06-29T20:00:00Z', venue: null, city: null },
  { code: 'M75', stage: 'ROUND_OF_32', home: w('F'), away: r('C'), startsAt: '2026-06-30T16:00:00Z', venue: null, city: null },
  { code: 'M76', stage: 'ROUND_OF_32', home: w('C'), away: r('F'), startsAt: '2026-06-30T20:00:00Z', venue: null, city: null },
  { code: 'M77', stage: 'ROUND_OF_32', home: w('I'), away: third(['C', 'D', 'F', 'G', 'H']), startsAt: '2026-06-30T23:00:00Z', venue: null, city: null },
  { code: 'M78', stage: 'ROUND_OF_32', home: r('E'), away: r('I'), startsAt: '2026-07-01T16:00:00Z', venue: null, city: null },
  { code: 'M79', stage: 'ROUND_OF_32', home: w('A'), away: third(['C', 'E', 'F', 'H', 'I']), startsAt: '2026-07-01T20:00:00Z', venue: null, city: null },
  { code: 'M80', stage: 'ROUND_OF_32', home: w('L'), away: third(['E', 'H', 'I', 'J', 'K']), startsAt: '2026-07-01T23:00:00Z', venue: null, city: null },
  { code: 'M81', stage: 'ROUND_OF_32', home: w('D'), away: third(['B', 'E', 'F', 'I', 'J']), startsAt: '2026-07-02T16:00:00Z', venue: null, city: null },
  { code: 'M82', stage: 'ROUND_OF_32', home: w('G'), away: third(['A', 'E', 'H', 'I', 'J']), startsAt: '2026-07-02T20:00:00Z', venue: null, city: null },
  { code: 'M83', stage: 'ROUND_OF_32', home: r('K'), away: r('L'), startsAt: '2026-07-02T23:00:00Z', venue: null, city: null },
  { code: 'M84', stage: 'ROUND_OF_32', home: w('H'), away: r('J'), startsAt: '2026-07-03T16:00:00Z', venue: null, city: null },
  { code: 'M85', stage: 'ROUND_OF_32', home: w('B'), away: third(['E', 'F', 'G', 'I', 'J']), startsAt: '2026-07-03T20:00:00Z', venue: null, city: null },
  { code: 'M86', stage: 'ROUND_OF_32', home: w('J'), away: r('H'), startsAt: '2026-07-03T23:00:00Z', venue: null, city: null },
  { code: 'M87', stage: 'ROUND_OF_32', home: w('K'), away: third(['D', 'E', 'I', 'J', 'L']), startsAt: '2026-07-04T16:00:00Z', venue: null, city: null },
  { code: 'M88', stage: 'ROUND_OF_32', home: r('D'), away: r('G'), startsAt: '2026-07-04T20:00:00Z', venue: null, city: null },
];

// Round of 16 (M89–M96) — fixed progression from the Round of 32.
const ROUND_OF_16: BracketMatch[] = [
  { code: 'M89', stage: 'ROUND_OF_16', home: mw('M74'), away: mw('M77'), startsAt: '2026-07-05T20:00:00Z', venue: null, city: 'Philadelphia' },
  { code: 'M90', stage: 'ROUND_OF_16', home: mw('M73'), away: mw('M75'), startsAt: '2026-07-05T16:00:00Z', venue: null, city: 'Houston' },
  { code: 'M91', stage: 'ROUND_OF_16', home: mw('M76'), away: mw('M78'), startsAt: '2026-07-06T20:00:00Z', venue: null, city: 'New York/NJ' },
  { code: 'M92', stage: 'ROUND_OF_16', home: mw('M79'), away: mw('M80'), startsAt: '2026-07-06T16:00:00Z', venue: null, city: 'Mexico City' },
  { code: 'M93', stage: 'ROUND_OF_16', home: mw('M81'), away: mw('M82'), startsAt: '2026-07-07T20:00:00Z', venue: null, city: 'Arlington' },
  { code: 'M94', stage: 'ROUND_OF_16', home: mw('M83'), away: mw('M84'), startsAt: '2026-07-07T16:00:00Z', venue: null, city: 'Seattle' },
  { code: 'M95', stage: 'ROUND_OF_16', home: mw('M85'), away: mw('M87'), startsAt: '2026-07-08T20:00:00Z', venue: null, city: 'Atlanta' },
  { code: 'M96', stage: 'ROUND_OF_16', home: mw('M86'), away: mw('M88'), startsAt: '2026-07-08T16:00:00Z', venue: null, city: 'Vancouver' },
];

// Quarterfinals, semifinals, third place, final.
const LATER: BracketMatch[] = [
  { code: 'QF1', stage: 'QUARTERFINAL', home: mw('M89'), away: mw('M90'), startsAt: '2026-07-10T20:00:00Z', venue: null, city: 'Foxborough' },
  { code: 'QF2', stage: 'QUARTERFINAL', home: mw('M91'), away: mw('M92'), startsAt: '2026-07-10T23:00:00Z', venue: null, city: 'Inglewood' },
  { code: 'QF3', stage: 'QUARTERFINAL', home: mw('M93'), away: mw('M94'), startsAt: '2026-07-11T20:00:00Z', venue: null, city: 'Miami' },
  { code: 'QF4', stage: 'QUARTERFINAL', home: mw('M95'), away: mw('M96'), startsAt: '2026-07-11T16:00:00Z', venue: null, city: 'Kansas City' },
  { code: 'SF1', stage: 'SEMIFINAL', home: mw('QF1'), away: mw('QF2'), startsAt: '2026-07-14T20:00:00Z', venue: null, city: 'Arlington' },
  { code: 'SF2', stage: 'SEMIFINAL', home: mw('QF3'), away: mw('QF4'), startsAt: '2026-07-15T20:00:00Z', venue: null, city: 'Atlanta' },
  { code: 'TP', stage: 'THIRD_PLACE', home: ml('SF1'), away: ml('SF2'), startsAt: '2026-07-18T20:00:00Z', venue: null, city: 'Miami' },
  { code: 'F', stage: 'FINAL', home: mw('SF1'), away: mw('SF2'), startsAt: '2026-07-19T19:00:00Z', venue: 'MetLife Stadium', city: 'East Rutherford' },
];

export const BRACKET: BracketMatch[] = [...ROUND_OF_32, ...ROUND_OF_16, ...LATER];

/** Human-readable placeholder shown until a slot resolves to a real team. */
export function slotLabel(slot: Slot): string {
  switch (slot.kind) {
    case 'winner': return `Winner Group ${slot.group}`;
    case 'runnerUp': return `Runner-up Group ${slot.group}`;
    case 'third': return '3rd Place';
    case 'matchWinner': return `Winner ${slot.code}`;
    case 'matchLoser': return `Loser ${slot.code}`;
  }
}

/** True if a team name is still a bracket placeholder (not a resolved team). */
export function isPlaceholderTeam(name: string): boolean {
  return name === '3rd Place'
    || /^Winner Group /.test(name)
    || /^Runner-up Group /.test(name)
    || /^Winner /.test(name)
    || /^Loser /.test(name);
}
