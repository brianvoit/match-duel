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
  it('returns draw consolation of 1 for GROUP stage draw', () => {
    const points = evaluatePick({
      stage: 'GROUP',
      pickedTeamSide: 'HOME',
      fixture: { homeGoals: 1, awayGoals: 1, status: 'FINAL' },
      scoringConfig: WORLD_CUP_2026_SCORING
    });

    expect(points).toBe(1); // max(1, floor(1/2)) = max(1, 0) = 1
  });

  it('returns correct draw consolation for each stage', () => {
    const cases: Array<[StageName, number]> = [
      ['GROUP', 1],       // floor(1/2)=0 → max(1,0)=1
      ['ROUND_OF_32', 1], // floor(2/2)=1 → max(1,1)=1
      ['ROUND_OF_16', 2], // floor(4/2)=2
      ['QUARTERFINAL', 4],// floor(8/2)=4
      ['SEMIFINAL', 4],   // floor(8/2)=4
      ['THIRD_PLACE', 8], // floor(16/2)=8
      ['FINAL', 16]       // floor(32/2)=16
    ];

    for (const [stage, expected] of cases) {
      const points = evaluatePick({
        stage,
        pickedTeamSide: 'HOME',
        fixture: { homeGoals: 0, awayGoals: 0, status: 'FINAL' },
        scoringConfig: WORLD_CUP_2026_SCORING
      });
      expect(points, `draw consolation for ${stage}`).toBe(expected);
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
