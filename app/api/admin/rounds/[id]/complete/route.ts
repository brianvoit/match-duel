import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { runRoundSettlement } from '@/lib/jobs/settleRound';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const { id: roundId } = await context.params;
  const service = createServiceRoleClient();

  // Mark all LIVE/SCHEDULED fixtures in this round as FINAL so transitions will fire
  // (only do this if the admin explicitly wants to force-complete)
  const { error: updateError } = await service
    .from('round')
    .update({ is_complete: true, ends_at: new Date().toISOString() })
    .eq('id', roundId)
    .eq('is_complete', false);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  // Run settlement (calculate points for all picks in this round)
  await runRoundSettlement({ roundId });

  return NextResponse.json({ ok: true, roundId });
}
