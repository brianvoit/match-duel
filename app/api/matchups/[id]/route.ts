import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: matchupId } = await context.params;

  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const appUser = await ensureAppUser(user);
  const service = createServiceRoleClient();

  const { data: matchup, error: fetchError } = await service
    .from('matchup')
    .select('id, status, created_by')
    .eq('id', matchupId)
    .maybeSingle();

  if (fetchError || !matchup) {
    return NextResponse.json({ ok: false, error: 'Matchup not found.' }, { status: 404 });
  }

  if (matchup.created_by !== appUser.id) {
    return NextResponse.json({ ok: false, error: 'Only the creator can cancel this matchup.' }, { status: 403 });
  }

  // Count participants — refuse if an opponent has already joined
  const { count } = await service
    .from('matchup_participant')
    .select('id', { count: 'exact', head: true })
    .eq('matchup_id', matchupId);

  if ((count ?? 0) > 1) {
    return NextResponse.json(
      { ok: false, error: 'Cannot cancel a matchup that already has an opponent.' },
      { status: 409 }
    );
  }

  const { error: deleteError } = await service
    .from('matchup')
    .delete()
    .eq('id', matchupId);

  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
