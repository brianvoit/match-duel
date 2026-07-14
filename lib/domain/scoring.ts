import { PickEvaluationInput, ScoringConfig, StageName } from '@/lib/domain/types';

/**
 * Single source of truth for stage points — a correct pick is worth this much.
 * Each knockout round doubles (2 → 4 → 8 → 16) so every round has 32 points on
 * the table (16×2, 8×4, 4×8, 2×16), with the Final also 32. Third place sits
 * between a semi-final (16) and the Final (32). A draw is worth 0; knockout
 * matches level after extra time are scored by the penalty-shootout winner.
 *
 * Round      Games  Pts/pick  Available
 * Group        72       1        72
 * Ro32         16       2        32
 * Ro16          8       4        32
 * QF            4       8        32
 * SF            2      16        32
 * 3rd place     1      24        24
 * Final         1      32        32
 *                              = 256
 */
export const WORLD_CUP_2026_SCORING: ScoringConfig = {
  stagePoints: {
    GROUP: 1,
    ROUND_OF_32: 2,
    ROUND_OF_16: 4,
    QUARTERFINAL: 8,
    SEMIFINAL: 16,
    THIRD_PLACE: 24,
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
