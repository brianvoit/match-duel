import { PickEvaluationInput, ScoringConfig, StageName } from '@/lib/domain/types';

export const WORLD_CUP_2026_SCORING: ScoringConfig = {
  stagePoints: {
    GROUP: 1,
    ROUND_OF_32: 2,
    ROUND_OF_16: 4,
    QUARTERFINAL: 8,
    SEMIFINAL: 8,
    THIRD_PLACE: 16,
    FINAL: 32
  },
  drawPoint: 0
};

export function stagePointsFor(stage: StageName, scoringConfig = WORLD_CUP_2026_SCORING): number {
  return scoringConfig.stagePoints[stage];
}

export function evaluatePick(input: PickEvaluationInput): number {
  const { fixture, pickedTeamSide, stage, scoringConfig } = input;

  if (fixture.status !== 'FINAL') {
    throw new Error('Cannot evaluate pick before fixture is FINAL.');
  }

  if (fixture.homeGoals === fixture.awayGoals) {
    return scoringConfig.drawPoint ?? 0;
  }

  const winnerSide = fixture.homeGoals > fixture.awayGoals ? 'HOME' : 'AWAY';
  return winnerSide === pickedTeamSide ? stagePointsFor(stage, scoringConfig) : 0;
}
