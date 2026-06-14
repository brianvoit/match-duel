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
    // Level after regulation/extra time. In knockouts a penalty shootout decides
    // who advances — score by the shootout winner rather than awarding the draw point.
    const hp = fixture.homePenalty;
    const ap = fixture.awayPenalty;
    if (hp != null && ap != null && hp !== ap) {
      const penWinner = hp > ap ? 'HOME' : 'AWAY';
      return penWinner === pickedTeamSide ? stagePointsFor(stage, scoringConfig) : 0;
    }
    return scoringConfig.drawPoint ?? 0;
  }

  const winnerSide = fixture.homeGoals > fixture.awayGoals ? 'HOME' : 'AWAY';
  return winnerSide === pickedTeamSide ? stagePointsFor(stage, scoringConfig) : 0;
}
