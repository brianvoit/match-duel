/**
 * Fires MATCH_FINISHED push notifications for fixtures that just became FINAL.
 *
 * For each newly-final fixture:
 *   - Find all matchups that have picks on it
 *   - For each participant, check their notification_preferences.match_finished stages
 *   - Look up their pick result and points earned
 *   - Send concise push: "Mexico 2–1 Poland · +1pt"
 */

import { createServiceRoleClient } from '@/lib/supabase/service';
import { createNotificationEvents } from '@/lib/notifications';
import type { NewlyFinalFixture } from '@/lib/jobs/fixtureSync';
import { computePickPoints } from '@/app/components/playground-utils';

const STAGE_POINTS: Record<string, number> = {
  GROUP: 1, ROUND_OF_32: 2, ROUND_OF_16: 4,
  QUARTERFINAL: 8, SEMIFINAL: 16, THIRD_PLACE: 16, FINAL: 32,
};

export async function notifyMatchFinished(fixtures: NewlyFinalFixture[]): Promise<void> {
  if (!fixtures.length) return;

  const service = createServiceRoleClient();

  // Load stage for each fixture's round (batch)
  const roundIds = [...new Set(fixtures.map(f => f.roundId))];
  const { data: rounds } = await service
    .from('round')
    .select('id, stage')
    .in('id', roundIds) as { data: Array<{ id: string; stage: string }> | null };

  const stageByRoundId = new Map((rounds ?? []).map(r => [r.id, r.stage]));

  const notificationEvents: Parameters<typeof createNotificationEvents>[0] = [];

  for (const fixture of fixtures) {
    const stage = stageByRoundId.get(fixture.roundId);
    if (!stage) continue;

    const pts = STAGE_POINTS[stage] ?? 1;

    // Find all picks for this fixture
    const { data: picks } = await service
      .from('pick')
      .select('participant_id, side, matchup_id')
      .eq('fixture_id', fixture.id) as {
        data: Array<{ participant_id: string; side: string; matchup_id: string }> | null;
      };

    if (!picks?.length) continue;

    // Get participant → user_id + preferences (batch)
    const participantIds = [...new Set(picks.map(p => p.participant_id))];
    const { data: participants } = await service
      .from('matchup_participant')
      .select('id, user_id, app_user:user_id(notification_preferences)')
      .in('id', participantIds) as {
        data: Array<{
          id: string;
          user_id: string;
          app_user: { notification_preferences: Record<string, unknown> | null } | null;
        }> | null;
      };

    const userByParticipantId = new Map(
      (participants ?? []).map(p => [p.id, {
        userId: p.user_id,
        prefs: p.app_user?.notification_preferences ?? null,
      }])
    );

    for (const pick of picks) {
      const user = userByParticipantId.get(pick.participant_id);
      if (!user) continue;

      // Check notification preference for this stage
      const matchFinishedStages = user.prefs?.match_finished as string[] | null;
      if (!matchFinishedStages || !matchFinishedStages.includes(stage)) continue;

      // Calculate points
      const won  = (pick.side === 'HOME' && (fixture.homeScore ?? 0) > (fixture.awayScore ?? 0))
                || (pick.side === 'AWAY' && (fixture.awayScore ?? 0) > (fixture.homeScore ?? 0));
      const draw = fixture.homeScore !== null && fixture.homeScore === fixture.awayScore;
      const earnedPts = (won || draw) ? pts : 0;

      // Concise message: "Mexico 2–1 Poland · +1pt" or "Germany 3–0 USA · 0pts"
      const score = `${fixture.homeScore ?? '?'}–${fixture.awayScore ?? '?'}`;
      const body  = earnedPts > 0
        ? `${fixture.homeTeam} ${score} ${fixture.awayTeam} · +${earnedPts}pt`
        : `${fixture.homeTeam} ${score} ${fixture.awayTeam} · 0pts`;

      notificationEvents.push({
        userId:    user.userId,
        matchupId: pick.matchup_id,
        eventType: 'MATCH_FINISHED',
        payload: {
          title: `FT: ${fixture.homeTeam} ${score} ${fixture.awayTeam}`,
          body,
          url:   '/play',
          tag:   `match-finished-${fixture.id}`,
        },
      });
    }
  }

  if (notificationEvents.length) {
    await createNotificationEvents(notificationEvents);
  }
}
