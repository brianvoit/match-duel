export type StageName =
  | 'GROUP'
  | 'ROUND_OF_32'
  | 'ROUND_OF_16'
  | 'QUARTERFINAL'
  | 'SEMIFINAL'
  | 'THIRD_PLACE'
  | 'FINAL';

export type FixtureStatus = 'SCHEDULED' | 'LIVE' | 'FINAL' | 'POSTPONED' | 'CANCELED';

export interface ScoringConfig {
  stagePoints: Record<StageName, number>;
  drawPoint: number;
}

export interface FixtureResult {
  homeGoals: number;
  awayGoals: number;
  status: FixtureStatus;
}

export interface PickEvaluationInput {
  stage: StageName;
  pickedTeamSide: 'HOME' | 'AWAY';
  fixture: FixtureResult;
  scoringConfig: ScoringConfig;
}

export interface StageStandingInput {
  participantId: string;
  stagePoints: number;
  stageTiebreakGoals: number;  // goals from picked teams in this stage (round tiebreaker)
  totalGoalsTiebreak: number;  // cumulative goals from picked teams across all stages
  tournamentPoints: number;    // cumulative tournament points
  pickedSecondPreviously: boolean; // true if this player was 2nd picker last stage (final fallback)
}
