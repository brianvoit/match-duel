import { describe, expect, it } from 'vitest';
import { evaluatePick, WORLD_CUP_2026_SCORING } from '@/lib/domain/scoring';
import { STAGE_POINTS } from '@/app/components/playground-utils';
import { StageName } from '@/lib/domain/types';

const GAMES_PER_STAGE: Record<StageName, number> = {
  GROUP: 72, ROUND_OF_32: 16, ROUND_OF_16: 8,
  QUARTERFINAL: 4, SEMIFINAL: 2, THIRD_PLACE: 1, FINAL: 1,
};

const stages: StageName[] = [
  'GROUP',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTERFINAL',
  'SEMIFINAL',
  'THIRD_PLACE',
  'FINAL'
];

describe('evaluatePick', () => {
  it('returns 0 points for a draw (ties award 0)', () => {
    const points = evaluatePick({
      stage: 'GROUP',
      pickedTeamSide: 'HOME',
      fixture: { homeGoals: 1, awayGoals: 1, status: 'FINAL' },
      scoringConfig: WORLD_CUP_2026_SCORING
    });

    expect(points).toBe(0);
  });

  it('returns 0 for draws at every stage', () => {
    for (const stage of stages) {
      const points = evaluatePick({
        stage,
        pickedTeamSide: 'HOME',
        fixture: { homeGoals: 0, awayGoals: 0, status: 'FINAL' },
        scoringConfig: WORLD_CUP_2026_SCORING
      });
      expect(points, `draw should be 0 for ${stage}`).toBe(0);
    }
  });

  it('returns stage points for correct winner by stage', () => {
    for (const stage of stages) {
      const points = evaluatePick({
        stage,
        pickedTeamSide: 'HOME',
        fixture: { homeGoals: 2, awayGoals: 1, status: 'FINAL' },
        scoringConfig: WORLD_CUP_2026_SCORING
      });

      expect(points).toBe(WORLD_CUP_2026_SCORING.stagePoints[stage]);
    }
  });

  it('returns 0 for losing side', () => {
    const points = evaluatePick({
      stage: 'FINAL',
      pickedTeamSide: 'AWAY',
      fixture: { homeGoals: 3, awayGoals: 0, status: 'FINAL' },
      scoringConfig: WORLD_CUP_2026_SCORING
    });

    expect(points).toBe(0);
  });

  it('throws if match is not final', () => {
    expect(() =>
      evaluatePick({
        stage: 'GROUP',
        pickedTeamSide: 'HOME',
        fixture: { homeGoals: 0, awayGoals: 0, status: 'LIVE' },
        scoringConfig: WORLD_CUP_2026_SCORING
      })
    ).toThrow(/FINAL/);
  });

  it('scores a knockout level after extra time by the shootout winner', () => {
    const fixture = { homeGoals: 1, awayGoals: 1, homePenalty: 4, awayPenalty: 2, status: 'FINAL' as const };
    expect(evaluatePick({ stage: 'SEMIFINAL', pickedTeamSide: 'HOME', fixture, scoringConfig: WORLD_CUP_2026_SCORING })).toBe(16);
    expect(evaluatePick({ stage: 'SEMIFINAL', pickedTeamSide: 'AWAY', fixture, scoringConfig: WORLD_CUP_2026_SCORING })).toBe(0);
  });
});

// These pin the agreed values. The previous tests only asserted stagePoints[stage]
// against itself, so a wrong value (SEMIFINAL was 8) passed unnoticed.
describe('stage points table', () => {
  it('awards the agreed points per correct pick', () => {
    expect(WORLD_CUP_2026_SCORING.stagePoints).toEqual({
      GROUP: 1, ROUND_OF_32: 2, ROUND_OF_16: 4,
      QUARTERFINAL: 8, SEMIFINAL: 16, THIRD_PLACE: 24, FINAL: 32,
    });
    expect(WORLD_CUP_2026_SCORING.drawPoint).toBe(0);
  });

  it('puts 32 points on the table for every knockout round bar third place', () => {
    const available = (s: StageName) => GAMES_PER_STAGE[s] * WORLD_CUP_2026_SCORING.stagePoints[s];
    for (const s of ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL'] as StageName[]) {
      expect(available(s), `${s} should have 32 points available`).toBe(32);
    }
    expect(available('THIRD_PLACE')).toBe(24);
    expect(available('GROUP')).toBe(72);
    expect(stages.reduce((total, s) => total + available(s), 0)).toBe(256);
  });

  it('ranks third place above a semi-final and below the final', () => {
    const { SEMIFINAL, THIRD_PLACE, FINAL } = WORLD_CUP_2026_SCORING.stagePoints;
    expect(THIRD_PLACE).toBeGreaterThan(SEMIFINAL);
    expect(THIRD_PLACE).toBeLessThan(FINAL);
  });

  it('keeps the client table identical to the server config (no drift)', () => {
    expect(STAGE_POINTS).toEqual(WORLD_CUP_2026_SCORING.stagePoints);
  });
});
