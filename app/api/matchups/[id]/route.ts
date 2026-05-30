import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id: matchupId } = await context.params;

  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
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
