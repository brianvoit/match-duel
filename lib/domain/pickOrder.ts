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

  if (a.stagePoints !== b.stagePoints) {
    return a.stagePoints < b.stagePoints ? [a, b] : [b, a];
  }

  if (a.tournamentPoints !== b.tournamentPoints) {
    return a.tournamentPoints < b.tournamentPoints ? [a, b] : [b, a];
  }

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
