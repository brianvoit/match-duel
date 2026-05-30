import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';

export async function PATCH() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const appUser = await ensureAppUser(user);
  const service = createServiceRoleClient();

  await service
    .from('app_user')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', appUser.id);

  return NextResponse.json({ ok: true });
}
