import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';

type NotificationEventType =
  | 'ROUND_OPEN'
  | 'PICKS_DUE_SOON'
  | 'MISSED_PICK'
  | 'OPPONENT_PICKED'
  | 'RESULTS_SETTLED'
  | 'MATCH_FINISHED'
  | 'NEW_MESSAGE';

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function createNotificationEvents(
  events: {
    userId: string;
    matchupId?: string;
    eventType: NotificationEventType;
    payload: PushPayload;
  }[]
): Promise<void> {
  if (!events.length) return;

  const service = createServiceRoleClient();

  const { error } = await service.from('notification_event').insert(
    events.map((e) => ({
      user_id: e.userId,
      matchup_id: e.matchupId ?? null,
      event_type: e.eventType,
      payload: e.payload,
    }))
  );

  if (error) {
    console.error('[notifications] Failed to create events:', error.message);
    return;
  }

  // Fire-and-forget — don't block the calling request
  triggerDispatch().catch(() => {});
}

async function triggerDispatch(): Promise<void> {
  const functionsUrl = serverEnv.SUPABASE_FUNCTIONS_URL;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!functionsUrl || !serviceKey) return;

  await fetch(`${functionsUrl}/dispatch-notifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
}
