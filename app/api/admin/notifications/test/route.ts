import { NextResponse } from 'next/server';
import { createNotificationEvents } from '@/lib/notifications';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function POST() {
  const devEmail = process.env.DEV_USER_EMAIL;
  if (!devEmail) {
    return NextResponse.json({ ok: false, error: 'DEV_USER_EMAIL not set.' }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: user } = await service
    .from('app_user')
    .select('id')
    .eq('email', devEmail)
    .maybeSingle() as { data: { id: string } | null };

  if (!user) {
    return NextResponse.json({ ok: false, error: `No user found for ${devEmail}.` }, { status: 404 });
  }

  await createNotificationEvents([{
    userId: user.id,
    eventType: 'OPPONENT_PICKED',
    payload: {
      title: '🧪 Test notification',
      body: 'Push notifications are working correctly.',
      url: '/play',
      tag: 'admin-test',
    },
  }]);

  return NextResponse.json({ ok: true });
}
