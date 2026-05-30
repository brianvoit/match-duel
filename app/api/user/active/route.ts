import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function PATCH() {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false }, { status: 401 });

  const service = createServiceRoleClient();
  await service
    .from('app_user')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', appUser.id);

  return NextResponse.json({ ok: true });
}
