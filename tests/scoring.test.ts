import { describe, expect, it } from 'vitest';
import { evaluatePick, WORLD_CUP_2026_SCORING } from '@/lib/domain/scoring';
import { StageName } from '@/lib/domain/types';

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
});
