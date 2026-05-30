import { describe, expect, it } from 'vitest';
import { assignAlternatingFirstPicker } from '@/lib/domain/pickOrder';

const base = {
  stageTiebreakGoals: 0,
  totalGoalsTiebreak: 0,
  tournamentPoints: 0,
  pickedSecondPreviously: false
};

describe('assignAlternatingFirstPicker', () => {
  it('loser of previous stage (fewer stage points) picks first, then alternates', () => {
    const assignments = assignAlternatingFirstPicker({
      previousStageStandings: [
        { ...base, participantId: 'A', stagePoints: 3, tournamentPoints: 14 },
        { ...base, participantId: 'B', stagePoints: 6, tournamentPoints: 18 }
      ],
      fixtureIdsChronological: ['f1', 'f2', 'f3']
    });

    expect(assignments).toEqual([
      { fixtureId: 'f1', firstPickerParticipantId: 'A' },
      { fixtureId: 'f2', firstPickerParticipantId: 'B' },
      { fixtureId: 'f3', firstPickerParticipantId: 'A' }
    ]);
  });

  it('round tiebreaker: fewer stage goals picks first when stage points tied', () => {
    const assignments = assignAlternatingFirstPicker({
      previousStageStandings: [
        { ...base, participantId: 'A', stagePoints: 4, stageTiebreakGoals: 1 },
        { ...base, participantId: 'B', stagePoints: 4, stageTiebreakGoals: 3 }
      ],
      fixtureIdsChronological: ['f1']
    });

    expect(assignments[0]?.firstPickerParticipantId).toBe('A');
  });

  it('total goals tiebreaker: fewer total goals picks first when stage and round goals tied', () => {
    const assignments = assignAlternatingFirstPicker({
      previousStageStandings: [
        { ...base, participantId: 'A', stagePoints: 4, stageTiebreakGoals: 2, totalGoalsTiebreak: 8 },
        { ...base, participantId: 'B', stagePoints: 4, stageTiebreakGoals: 2, totalGoalsTiebreak: 12 }
      ],
      fixtureIdsChronological: ['f1']
    });

    expect(assignments[0]?.firstPickerParticipantId).toBe('A');
  });

  it('tournament points tiebreaker: lower total points picks first when goals tied', () => {
    const assignments = assignAlternatingFirstPicker({
      previousStageStandings: [
        { ...base, participantId: 'A', stagePoints: 4, totalGoalsTiebreak: 10, tournamentPoints: 20 },
        { ...base, participantId: 'B', stagePoints: 4, totalGoalsTiebreak: 10, tournamentPoints: 17 }
      ],
      fixtureIdsChronological: ['f1']
    });

    expect(assignments[0]?.firstPickerParticipantId).toBe('B');
  });

  it('previous 2nd picker picks first when all else tied', () => {
    const assignments = assignAlternatingFirstPicker({
      previousStageStandings: [
        { ...base, participantId: 'A', stagePoints: 4, pickedSecondPreviously: true },
        { ...base, participantId: 'B', stagePoints: 4, pickedSecondPreviously: false }
      ],
      fixtureIdsChronological: ['f1']
    });

    expect(assignments[0]?.firstPickerParticipantId).toBe('A');
  });
});
