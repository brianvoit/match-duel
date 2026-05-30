import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRoundFixtures, getRoundFixturesForUser } from '@/lib/supabase/rounds';

const querySchema = z.object({
  matchupId: z.string().uuid().optional()
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: roundId } = await context.params;

  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const parsed = querySchema.safeParse({
    matchupId: request.nextUrl.searchParams.get('matchupId') ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'matchupId must be a valid UUID if provided.' },
      { status: 400 }
    );
  }

  try {

    // No matchupId → browse-only mode, no picks returned
    if (!parsed.data.matchupId) {
      const result = await getRoundFixtures({ roundId });
      return NextResponse.json({ ok: true, roundId, matchupId: null, ...result });
    }

    const result = await getRoundFixturesForUser({
      roundId,
      matchupId: parsed.data.matchupId,
      appUserId: appUser.id
    });

    return NextResponse.json({ ok: true, roundId, matchupId: parsed.data.matchupId, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list fixtures.';
    const status = message.includes('not a participant') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
