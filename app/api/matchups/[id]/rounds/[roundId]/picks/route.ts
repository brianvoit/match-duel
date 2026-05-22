import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bulkUpsertRoundPicks, BulkPickError } from '@/lib/supabase/picks';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';

const pickSchema = z.object({
  fixtureId: z.string().uuid(),
  side: z.enum(['HOME', 'AWAY'])
});

const bulkPickSchema = z.object({
  picks: z.array(pickSchema).min(1)
});

interface RouteContext {
  params: Promise<{ id: string; roundId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { id: matchupId, roundId } = await context.params;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = bulkPickSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const appUser = await ensureAppUser(user);

    const result = await bulkUpsertRoundPicks({
      matchupId,
      roundId,
      appUserId: appUser.id,
      picks: parsed.data.picks
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof BulkPickError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'Failed to submit picks.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
