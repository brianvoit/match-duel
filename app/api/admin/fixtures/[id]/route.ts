import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { runRoundTransitions } from '@/lib/jobs/roundTransitions';

const schema = z.object({
  homeScore: z.number().int().min(0).nullable().optional(),
  awayScore: z.number().int().min(0).nullable().optional(),
  status: z.enum(['SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED']).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid payload.' }, { status: 400 });

  const service = createServiceRoleClient();
  const updates: Record<string, unknown> = { last_synced_at: new Date().toISOString() };
  if (parsed.data.homeScore !== undefined) updates.home_score = parsed.data.homeScore;
  if (parsed.data.awayScore !== undefined) updates.away_score = parsed.data.awayScore;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;

  const { error } = await service.from('fixture').update(updates).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Settle any rounds that are now complete
  const transitions = await runRoundTransitions();
  return NextResponse.json({ ok: true, transitions });
}
