import { describe, it, expect } from 'vitest';
import { buildGroupTables, computeThirdsByMatch, resolveSlot, decideMatch, reconcileApiKnockouts } from '@/lib/domain/bracketResolve';
import type { BracketFixture, GroupTables, GroupTeamRecord, OurKnockoutSlot, ApiKnockout } from '@/lib/domain/bracketResolve';

const F = (group: string, h: string, a: string, hg: number | null, ag: number | null, status = 'FINAL'): BracketFixture =>
  ({ group, homeTeam: h, awayTeam: a, homeGoals: hg, awayGoals: ag, status });

// Group A: Mexico beats RSA & KOR, draws CZE → 1st; etc.
const groupA: BracketFixture[] = [
  F('A', 'Mexico', 'South Africa', 2, 0),
  F('A', 'Korea Republic', 'Czechia', 1, 1),
  F('A', 'Mexico', 'Korea Republic', 1, 0),
  F('A', 'Czechia', 'South Africa', 3, 0),
  F('A', 'Czechia', 'Mexico', 0, 2),
  F('A', 'South Africa', 'Korea Republic', 1, 2),
];

describe('buildGroupTables', () => {
  it('ranks by points, then GD, then GF', () => {
    const { standings, completeGroups } = buildGroupTables(groupA);
    const order = standings['A'].map((r) => r.team);
    expect(order[0]).toBe('Mexico');   // 9 pts
    expect(order[1]).toBe('Czechia');  // 4 pts, GD +2
    expect(completeGroups.has('A')).toBe(true);
    const mex = standings['A'][0];
    expect(mex.points).toBe(9);
    expect(mex.gd).toBe(5);
  });

  it('does not mark a group complete while a fixture is unplayed', () => {
    const partial = [...groupA.slice(0, 5), F('A', 'South Africa', 'Korea Republic', null, null, 'SCHEDULED')];
    const { completeGroups } = buildGroupTables(partial);
    expect(completeGroups.has('A')).toBe(false);
  });
});

describe('resolveSlot', () => {
  const ctx = {
    tables: buildGroupTables(groupA),
    matchResults: { M73: { winner: 'Belgium', loser: 'Egypt' } },
    thirdsByMatch: { M79: 'Switzerland' },
  };

  it('resolves winner/runner-up only for complete groups', () => {
    expect(resolveSlot({ kind: 'winner', group: 'A' }, ctx, 'M79')).toBe('Mexico');
    expect(resolveSlot({ kind: 'runnerUp', group: 'A' }, ctx, 'M73')).toBe('Czechia');
    expect(resolveSlot({ kind: 'winner', group: 'Z' }, ctx, 'M99')).toBeNull();
  });

  it('resolves match winners/losers and third-place slots', () => {
    expect(resolveSlot({ kind: 'matchWinner', code: 'M73' }, ctx, 'M90')).toBe('Belgium');
    expect(resolveSlot({ kind: 'matchLoser', code: 'M73' }, ctx, 'TP')).toBe('Egypt');
    expect(resolveSlot({ kind: 'third', candidates: ['C', 'E'] }, ctx, 'M79')).toBe('Switzerland');
    expect(resolveSlot({ kind: 'third', candidates: ['C', 'E'] }, ctx, 'M85')).toBeNull();
  });
});

describe('computeThirdsByMatch (Annex C)', () => {
  const third = (group: string, points: number): GroupTeamRecord =>
    ({ team: `3rd-${group}`, group, played: 3, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points });

  // 12 complete groups; thirds of E–L are strong, A–D weak → best 8 = E..L.
  const tables: GroupTables = (() => {
    const standings: Record<string, GroupTeamRecord[]> = {};
    const all = 'ABCDEFGHIJKL'.split('');
    for (const g of all) {
      const tp = 'EFGHIJKL'.includes(g) ? 5 : 1;
      standings[g] = [third(g, 9), third(g, 6), third(g, tp), third(g, 0)];
    }
    return { standings, completeGroups: new Set(all), allGroups: new Set(all) };
  })();

  it('maps third-place teams to the 8 variable R32 matches (row EFGHIJKL)', () => {
    const t = computeThirdsByMatch(tables);
    // Row 1: M79←E, M85←J, M81←I, M74←F, M82←H, M77←G, M87←L, M80←K
    expect(t['M74']).toBe('3rd-F');
    expect(t['M79']).toBe('3rd-E');
    expect(t['M80']).toBe('3rd-K');
    expect(t['M87']).toBe('3rd-L');
    expect(Object.keys(t).sort()).toEqual(['M74', 'M77', 'M79', 'M80', 'M81', 'M82', 'M85', 'M87']);
  });

  it('returns empty until every group is complete', () => {
    const partial: GroupTables = { ...tables, completeGroups: new Set('ABCDEFGHIJK'.split('')) };
    expect(computeThirdsByMatch(partial)).toEqual({});
  });
});

describe('full Round of 32 resolution (real bracket + Annex C)', () => {
  // Build a complete 12-group stage: in each group t1>t2>t3>t4 (home wins 1-0).
  const fixtures: BracketFixture[] = [];
  for (const g of 'ABCDEFGHIJKL'.split('')) {
    const t = [1, 2, 3, 4].map((n) => `${g}${n}`);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      fixtures.push(F(g, t[i], t[j], 1, 0)); // lower index (home) wins
    }
  }

  it('fills both teams of all 16 R32 matches with real teams', async () => {
    const { BRACKET, slotLabel } = await import('@/lib/domain/bracket');
    const tables = buildGroupTables(fixtures);
    const ctx = { tables, matchResults: {}, thirdsByMatch: computeThirdsByMatch(tables) };

    const r32 = BRACKET.filter((m) => m.stage === 'ROUND_OF_32');
    expect(r32).toHaveLength(16);
    for (const m of r32) {
      const home = resolveSlot(m.home, ctx, m.code);
      const away = resolveSlot(m.away, ctx, m.code);
      expect(home, `${m.code} home`).not.toBeNull();
      expect(away, `${m.code} away`).not.toBeNull();
      expect(home).not.toBe(slotLabel(m.home));
      expect(away).not.toBe(slotLabel(m.away));
    }
    // Winners/runners-up land correctly: M73 = 2A vs 2B.
    const m73 = r32.find((m) => m.code === 'M73')!;
    expect(resolveSlot(m73.home, ctx, 'M73')).toBe('A2');
    expect(resolveSlot(m73.away, ctx, 'M73')).toBe('B2');
  });
});

describe('reconcileApiKnockouts (API-first)', () => {
  const slot = (over: Partial<OurKnockoutSlot>): OurKnockoutSlot =>
    ({ fixtureId: 'f', bracketCode: 'M74', stage: 'ROUND_OF_32', homeTeam: 'Spain', awayTeam: '3rd Place', externalId: null, locked: false, ...over });
  const ko = (over: Partial<ApiKnockout>): ApiKnockout =>
    ({ apiId: '900', stage: 'ROUND_OF_32', homeTeam: 'Spain', awayTeam: 'Croatia', kickoff: '2026-06-29T20:00:00Z', ...over });

  it('fills a placeholder side from the API in the API orientation', () => {
    const [u] = reconcileApiKnockouts([slot({})], [ko({})]);
    expect(u).toMatchObject({ fixtureId: 'f', homeTeam: 'Spain', awayTeam: 'Croatia', externalId: '900' });
  });

  it('adopts a reversed API orientation, keeping our canonical name', () => {
    // API says Croatia is home — we adopt that; our known side (Spain) keeps its name.
    const [u] = reconcileApiKnockouts([slot({})], [ko({ homeTeam: 'Croatia', awayTeam: 'Spain' })]);
    expect(u).toMatchObject({ homeTeam: 'Croatia', awayTeam: 'Spain' });
  });

  it('flips a fully-resolved match to the API orientation', () => {
    const s = slot({ homeTeam: 'Argentina', awayTeam: 'England' });
    const [u] = reconcileApiKnockouts([s], [ko({ homeTeam: 'England', awayTeam: 'Argentina' })]);
    expect(u).toMatchObject({ homeTeam: 'England', awayTeam: 'Argentina', externalId: '900' });
  });

  it('matches by team code across API name variants', () => {
    // Our "Czechia" vs the API's "Czech Republic" (both CZE); our name is kept.
    const s = slot({ homeTeam: 'Czechia', awayTeam: '3rd Place' });
    const [u] = reconcileApiKnockouts([s], [ko({ homeTeam: 'Croatia', awayTeam: 'Czech Republic' })]);
    expect(u).toMatchObject({ homeTeam: 'Croatia', awayTeam: 'Czechia' });
  });

  it('links a match already in API orientation without changing teams', () => {
    const s = slot({ homeTeam: 'Spain', awayTeam: 'Croatia' });
    const [u] = reconcileApiKnockouts([s], [ko({ homeTeam: 'Spain', awayTeam: 'Croatia' })]);
    expect(u).toMatchObject({ homeTeam: 'Spain', awayTeam: 'Croatia', externalId: '900' });
  });

  it('never touches a locked slot', () => {
    expect(reconcileApiKnockouts([slot({ locked: true })], [ko({})])).toEqual([]);
  });

  it('ignores API fixtures whose teams are not both real', () => {
    expect(reconcileApiKnockouts([slot({})], [ko({ awayTeam: '3rd Place' })])).toEqual([]);
  });
});

describe('decideMatch', () => {
  it('decides on regulation score', () => {
    expect(decideMatch({ homeTeam: 'A', awayTeam: 'B', homeGoals: 2, awayGoals: 1, homePen: null, awayPen: null, status: 'FINAL' }))
      .toEqual({ winner: 'A', loser: 'B' });
  });
  it('decides a draw by penalty shootout', () => {
    expect(decideMatch({ homeTeam: 'A', awayTeam: 'B', homeGoals: 1, awayGoals: 1, homePen: 3, awayPen: 4, status: 'FINAL' }))
      .toEqual({ winner: 'B', loser: 'A' });
  });
  it('returns null for an undecided level match / non-final', () => {
    expect(decideMatch({ homeTeam: 'A', awayTeam: 'B', homeGoals: 1, awayGoals: 1, homePen: null, awayPen: null, status: 'FINAL' })).toBeNull();
    expect(decideMatch({ homeTeam: 'A', awayTeam: 'B', homeGoals: null, awayGoals: null, homePen: null, awayPen: null, status: 'SCHEDULED' })).toBeNull();
  });
});
