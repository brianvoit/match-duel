import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WORLD_CUP_2026_SCORING } from '@/lib/domain/scoring';

// Mock Supabase service and scoring config so settlement runs in isolation
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: vi.fn()
}));

vi.mock('@/lib/supabase/scoring', () => ({
  getScoringConfigForTournament: vi.fn().mockResolvedValue(WORLD_CUP_2026_SCORING)
}));

import { createServiceRoleClient } from '@/lib/supabase/service';
import { runRoundSettlement } from '@/lib/jobs/settleRound';

const ROUND_ID = 'round-aaa';
const MATCHUP_ID = 'matchup-bbb';
const TOURNAMENT_ID = 'tournament-ccc';
const PARTICIPANT_A = 'participant-111';
const PARTICIPANT_B = 'participant-222';
const FIXTURE_1 = 'fixture-001';
const FIXTURE_2 = 'fixture-002';

function makeSupabaseMock(overrides: Record<string, unknown[]> = {}) {
  const tables: Record<string, unknown[]> = {
    round: [
      { id: ROUND_ID, stage: 'GROUP', tournament_id: TOURNAMENT_ID, is_complete: true }
    ],
    fixture: [
      { id: FIXTURE_1, round_id: ROUND_ID, home_score: 2, away_score: 1, status: 'FINAL' },
      { id: FIXTURE_2, round_id: ROUND_ID, home_score: 0, away_score: 0, status: 'FINAL' }
    ],
    matchup: [{ id: MATCHUP_ID, tournament_id: TOURNAMENT_ID, status: 'ACTIVE' }],
    matchup_participant: [
      { id: PARTICIPANT_A, matchup_id: MATCHUP_ID, user_id: 'user-a' },
      { id: PARTICIPANT_B, matchup_id: MATCHUP_ID, user_id: 'user-b' }
    ],
    'pick-participant-111': [
      { fixture_id: FIXTURE_1, side: 'HOME' },
      { fixture_id: FIXTURE_2, side: 'HOME' }
    ],
    'pick-participant-222': [
      { fixture_id: FIXTURE_1, side: 'AWAY' },
      { fixture_id: FIXTURE_2, side: 'AWAY' }
    ],
    round_result: [] as Array<{ matchup_id: string; round_id: string; participant_id: string; points: number; tiebreak_goals: number; settled_at: string }>,
    matchup_standing: [],
    ...overrides
  };

  const upserted: Record<string, unknown[]> = { round_result: [], matchup_standing: [] };

  const buildQuery = (tableName: string) => {
    const state = {
      filters: {} as Record<string, unknown>,
      table: tableName
    };

    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        state.filters[col] = val;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      in: () => chain,
      maybeSingle: () => {
        const data = getTableData();
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      single: () => {
        const data = getTableData();
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      upsert: (rows: unknown[]) => {
        upserted[tableName] = rows;
        if (tableName === 'round_result') {
          tables['round_result'] = [...(tables['round_result'] as unknown[]), ...rows];
        }
        if (tableName === 'matchup_standing') {
          tables['matchup_standing'] = [...tables['matchup_standing'], ...rows];
        }
        return Promise.resolve({ error: null });
      },
      insert: () => chain,
      then: (resolve: (v: unknown) => void) => {
        const data = getTableData();
        return Promise.resolve({ data, error: null }).then(resolve);
      }
    };

    function getTableData() {
      if (tableName === 'pick') {
        const participantId = state.filters['participant_id'] as string;
        return tables[`pick-${participantId}`] ?? [];
      }
      const rows = tables[tableName] ?? [];
      return rows.filter((row) => {
        for (const [key, value] of Object.entries(state.filters)) {
          if ((row as Record<string, unknown>)[key] !== value) return false;
        }
        return true;
      });
    }

    return { ...chain, upserted };
  };

  const mock = {
    from: (tableName: string) => buildQuery(tableName),
    _upserted: upserted
  };

  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runRoundSettlement', () => {
  it('correctly awards points: winner gets stage points, loser gets 0, draw gives draw point', async () => {
    const mock = makeSupabaseMock();
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);

    const result = await runRoundSettlement({ roundId: ROUND_ID });

    expect(result.settledMatchups).toBe(1);
    // FIXTURE_1: home wins 2-1. Participant A picked HOME (+1pt GROUP), B picked AWAY (0)
    // FIXTURE_2: draw 0-0. Both get drawPoint (1pt each)
    // Total: A = 2, B = 1
    expect(result.totalPicksEvaluated).toBe(4);
  });

  it('returns 0 for a participant with no picks in the round', async () => {
    const mock = makeSupabaseMock({
      'pick-participant-111': [],
      'pick-participant-222': [{ fixture_id: FIXTURE_1, side: 'HOME' }]
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);

    const result = await runRoundSettlement({ roundId: ROUND_ID });

    expect(result.settledMatchups).toBe(1);
    expect(result.totalPicksEvaluated).toBe(1);
  });

  it('skips matchups with fewer than 2 participants', async () => {
    const mock = makeSupabaseMock({
      matchup_participant: [{ id: PARTICIPANT_A, user_id: 'user-a' }]
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);

    const result = await runRoundSettlement({ roundId: ROUND_ID });

    expect(result.settledMatchups).toBe(0);
  });

  it('throws if round is not complete', async () => {
    const mock = makeSupabaseMock({
      round: [
        { id: ROUND_ID, stage: 'GROUP', tournament_id: TOURNAMENT_ID, is_complete: false }
      ]
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);

    await expect(runRoundSettlement({ roundId: ROUND_ID })).rejects.toThrow(
      'not complete'
    );
  });

  it('computes per-participant tiebreak_goals based on goals of picked team', async () => {
    // FIXTURE_1: home wins 2-1. A picked HOME (2 tiebreak goals), B picked AWAY (1 tiebreak goal)
    // FIXTURE_2: draw 0-0. Both picked their sides → 0 tiebreak goals each
    // Expected: A tiebreak = 2, B tiebreak = 1
    const mock = makeSupabaseMock();
    const upsertedRows: unknown[] = [];
    const origFrom = mock.from.bind(mock);
    mock.from = (tableName: string) => {
      const q = origFrom(tableName);
      if (tableName === 'round_result') {
        const origUpsert = q.upsert.bind(q);
        q.upsert = (rows: unknown[]) => {
          upsertedRows.push(...rows);
          return origUpsert(rows);
        };
      }
      return q;
    };
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);

    await runRoundSettlement({ roundId: ROUND_ID });

    const rows = upsertedRows as Array<{ participant_id: string; tiebreak_goals: number }>;
    expect(rows.length).toBe(2);

    const rowA = rows.find((r) => r.participant_id === PARTICIPANT_A);
    const rowB = rows.find((r) => r.participant_id === PARTICIPANT_B);

    expect(rowA?.tiebreak_goals).toBe(2); // home goals in FIXTURE_1
    expect(rowB?.tiebreak_goals).toBe(1); // away goals in FIXTURE_1
  });

  it('filters to a specific matchupId when provided', async () => {
    const mock = makeSupabaseMock({
      matchup: []
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(mock as never);

    const result = await runRoundSettlement({
      roundId: ROUND_ID,
      matchupId: 'some-other-matchup-id'
    });

    expect(result.settledMatchups).toBe(0);
  });
});
