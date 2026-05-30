import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentRoundForTournament, resolveTournamentForUserContext } from '@/lib/supabase/rounds';

const querySchema = z.object({
  matchupId: z.string().uuid().optional(),
  tournamentYear: z.coerce.number().int().min(1900).max(3000).optional()
});

export async function GET(request: NextRequest) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const parsed = querySchema.safeParse({
    matchupId: request.nextUrl.searchParams.get('matchupId') ?? undefined,
    tournamentYear: request.nextUrl.searchParams.get('tournamentYear') ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid query params.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const tournamentId = await resolveTournamentForUserContext({
      matchupId: parsed.data.matchupId,
      appUserId: appUser.id,
      tournamentYear: parsed.data.tournamentYear
    });

    const { current, rounds } = await getCurrentRoundForTournament(tournamentId);

    return NextResponse.json({
      ok: true,
      tournamentId,
      currentRound: current,
      rounds
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve current round.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
