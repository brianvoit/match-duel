import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const { id: matchupId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const appUser = await ensureAppUser(user);
  const service = createServiceRoleClient();

  await service
    .from('matchup_participant')
    .update({ last_read_at: new Date().toISOString() })
    .eq('matchup_id', matchupId)
    .eq('user_id', appUser.id);

  return NextResponse.json({ ok: true });
}
