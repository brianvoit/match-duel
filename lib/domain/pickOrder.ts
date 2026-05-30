import { StageStandingInput } from '@/lib/domain/types';

export interface PickOrderAssignmentInput {
  previousStageStandings: [StageStandingInput, StageStandingInput];
  fixtureIdsChronological: string[];
}

export interface PickOrderAssignment {
  fixtureId: string;
  firstPickerParticipantId: string;
}

function sortForNextStageFirstPick(
  standings: [StageStandingInput, StageStandingInput]
): [StageStandingInput, StageStandingInput] {
  const [a, b] = standings;

  // 1. Loser of previous stage (fewer stage points) picks first
  if (a.stagePoints !== b.stagePoints) {
    return a.stagePoints < b.stagePoints ? [a, b] : [b, a];
  }

  // 2. Round tiebreaker: fewer goals scored by picked teams in this stage
  if (a.stageTiebreakGoals !== b.stageTiebreakGoals) {
    return a.stageTiebreakGoals < b.stageTiebreakGoals ? [a, b] : [b, a];
  }

  // 3. Total goals tiebreaker: fewer cumulative goals scored by picked teams
  if (a.totalGoalsTiebreak !== b.totalGoalsTiebreak) {
    return a.totalGoalsTiebreak < b.totalGoalsTiebreak ? [a, b] : [b, a];
  }

  // 4. Lower total tournament points picks first
  if (a.tournamentPoints !== b.tournamentPoints) {
    return a.tournamentPoints < b.tournamentPoints ? [a, b] : [b, a];
  }

  // 5. Person who picked 2nd previously picks first next
  if (a.pickedSecondPreviously !== b.pickedSecondPreviously) {
    return a.pickedSecondPreviously ? [a, b] : [b, a];
  }

  // Deterministic fallback (should never be reached in practice)
  return a.participantId < b.participantId ? [a, b] : [b, a];
}

export function assignAlternatingFirstPicker(
  input: PickOrderAssignmentInput
): PickOrderAssignment[] {
  const sorted = sortForNextStageFirstPick(input.previousStageStandings);

  return input.fixtureIdsChronological.map((fixtureId, index) => {
    const firstPicker = index % 2 === 0 ? sorted[0].participantId : sorted[1].participantId;
    return {
      fixtureId,
      firstPickerParticipantId: firstPicker
    };
  });
}
