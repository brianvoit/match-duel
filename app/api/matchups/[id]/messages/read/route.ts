import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const { id: matchupId } = await context.params;
    const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const service = createServiceRoleClient();

  await service
    .from('matchup_participant')
    .update({ last_read_at: new Date().toISOString() })
    .eq('matchup_id', matchupId)
    .eq('user_id', appUser.id);

  return NextResponse.json({ ok: true });
}
