import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ ok: false, total: 0 }, { status: 401 });

  const appUser = await ensureAppUser(user);
  const service = createServiceRoleClient();

  const { data: participants } = await service
    .from('matchup_participant')
    .select('matchup_id, last_read_at')
    .eq('user_id', appUser.id) as {
      data: Array<{ matchup_id: string; last_read_at: string | null }> | null;
    };

  let total = 0;
  for (const p of participants ?? []) {
    const since = p.last_read_at ?? '1970-01-01T00:00:00Z';
    const { count } = await service
      .from('message')
      .select('*', { count: 'exact', head: true })
      .eq('matchup_id', p.matchup_id)
      .neq('sender_id', appUser.id)
      .gt('created_at', since);
    total += count ?? 0;
  }

  return NextResponse.json({ ok: true, total });
}
