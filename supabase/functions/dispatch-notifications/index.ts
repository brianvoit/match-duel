import webPush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@match-duel.com';

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  const auth = req.headers.get('Authorization');
  if (!auth || auth !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Events from last 24h that have not been delivered yet
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error: eventsError } = await db
      .from('notification_event')
      .select('id, user_id, event_type, payload')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(100);

    if (eventsError) throw new Error(eventsError.message);
    if (!events || events.length === 0) return json({ ok: true, sent: 0 });

    // Find which events already have a delivery record
    const eventIds = events.map((e: { id: string }) => e.id);
    const { data: delivered } = await db
      .from('notification_delivery')
      .select('event_id')
      .in('event_id', eventIds);

    const deliveredSet = new Set((delivered ?? []).map((d: { event_id: string }) => d.event_id));
    const pending = events.filter((e: { id: string }) => !deliveredSet.has(e.id));

    if (pending.length === 0) return json({ ok: true, sent: 0 });

    let sent = 0;

    for (const event of pending) {
      // Enrich URL for actionable notifications so tapping opens the right view
      if (event.event_type === 'PICKS_DUE_SOON' && event.payload?.url === '/play') {
        event.payload.url = '/play?filter=pick-now';
      }

      const { data: subs } = await db
        .from('notification_subscription')
        .select('id, endpoint, p256dh, auth_secret')
        .eq('user_id', event.user_id)
        .eq('channel', 'WEB_PUSH')
        .eq('enabled', true);

      if (!subs || subs.length === 0) {
        // No subscription — record a skipped delivery so we don't retry
        await db.from('notification_delivery').insert({
          event_id: event.id,
          subscription_id: null,
          delivered_at: new Date().toISOString(),
          failure_reason: 'no_subscription',
        });
        continue;
      }

      for (const sub of subs) {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
            JSON.stringify(event.payload),
            { TTL: 3600 }
          );
          await db.from('notification_delivery').insert({
            event_id: event.id,
            subscription_id: sub.id,
            delivered_at: new Date().toISOString(),
          });
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          const msg = err instanceof Error ? err.message : String(err);
          await db.from('notification_delivery').insert({
            event_id: event.id,
            subscription_id: sub.id,
            failed_at: new Date().toISOString(),
            failure_reason: msg.slice(0, 500),
          });
          // Subscription expired — disable it
          if (statusCode === 410) {
            await db
              .from('notification_subscription')
              .update({ enabled: false })
              .eq('id', sub.id);
          }
        }
      }
    }

    return json({ ok: true, sent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: msg }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
