import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint = body?.subscription?.endpoint;
  const p256dh = body?.subscription?.keys?.p256dh;
  const auth = body?.subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: 'Invalid subscription object.' }, { status: 400 });
  }
  const service = createServiceRoleClient();

  const { error } = await service
    .from('notification_subscription')
    .upsert(
      { user_id: appUser.id, channel: 'WEB_PUSH', endpoint, p256dh, auth_secret: auth, enabled: true },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: 'Missing endpoint.' }, { status: 400 });
  }
  const service = createServiceRoleClient();

  await service
    .from('notification_subscription')
    .update({ enabled: false })
    .eq('user_id', appUser.id)
    .eq('endpoint', endpoint);

  return NextResponse.json({ ok: true });
}
