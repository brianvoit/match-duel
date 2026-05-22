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
  stageTiebreakGoals: number;
  tournamentPoints: number;
}
