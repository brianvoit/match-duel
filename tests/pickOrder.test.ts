import { describe, expect, it } from 'vitest';
import { assignAlternatingFirstPicker } from '@/lib/domain/pickOrder';

describe('assignAlternatingFirstPicker', () => {
  it('loser of previous stage picks first, then alternates by fixture order', () => {
    const assignments = assignAlternatingFirstPicker({
      previousStageStandings: [
        {
          participantId: 'A',
          stagePoints: 3,
          stageTiebreakGoals: 2,
          tournamentPoints: 14
        },
        {
          participantId: 'B',
          stagePoints: 6,
          stageTiebreakGoals: 4,
          tournamentPoints: 18
        }
      ],
      fixtureIdsChronological: ['f1', 'f2', 'f3']
    });

    expect(assignments).toEqual([
      { fixtureId: 'f1', firstPickerParticipantId: 'A' },
      { fixtureId: 'f2', firstPickerParticipantId: 'B' },
      { fixtureId: 'f3', firstPickerParticipantId: 'A' }
    ]);
  });

  it('uses lower cumulative tournament points when prior stage tied', () => {
    const assignments = assignAlternatingFirstPicker({
      previousStageStandings: [
        {
          participantId: 'A',
          stagePoints: 4,
          stageTiebreakGoals: 1,
          tournamentPoints: 20
        },
        {
          participantId: 'B',
          stagePoints: 4,
          stageTiebreakGoals: 2,
          tournamentPoints: 17
        }
      ],
      fixtureIdsChronological: ['f1']
    });

    expect(assignments[0]?.firstPickerParticipantId).toBe('B');
  });
});
