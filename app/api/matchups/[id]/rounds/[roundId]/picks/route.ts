import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { bulkUpsertRoundPicks, BulkPickError } from '@/lib/supabase/picks';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { createNotificationEvents } from '@/lib/notifications';

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

  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const rawBody = await request.json().catch(() => null);
  const parsed = bulkPickSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {

    const result = await bulkUpsertRoundPicks({
      matchupId,
      roundId,
      appUserId: appUser.id,
      picks: parsed.data.picks
    });

    // Notify opponent — fire-and-forget, never block the response
    notifyOpponent(matchupId, appUser.id, parsed.data.picks.length).catch(() => {});

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof BulkPickError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'Failed to submit picks.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function notifyOpponent(matchupId: string, submitterUserId: string, pickCount: number) {
  const service = createServiceRoleClient();

  const { data: participants } = await service
    .from('matchup_participant')
    .select('user_id')
    .eq('matchup_id', matchupId) as { data: Array<{ user_id: string }> | null };

  const opponent = (participants ?? []).find((p) => p.user_id !== submitterUserId);
  if (!opponent) return;

  await createNotificationEvents([{
    userId: opponent.user_id,
    matchupId,
    eventType: 'OPPONENT_PICKED',
    payload: {
      title: 'Opponent just picked!',
      body: pickCount === 1
        ? 'Your opponent made their pick — open the app to see it.'
        : `Your opponent made ${pickCount} picks — open the app to check the board.`,
      url: '/play',
      tag: 'opponent-picked',
    },
  }]);
}
