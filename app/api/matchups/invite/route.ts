import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTournamentId, createMatchupWithInvite } from '@/lib/supabase/matchups';
import { getStartingRoundId } from '@/lib/supabase/pickOrder';

const createInviteSchema = z.object({
  tournamentYear: z.number().int().min(1900).max(3000).optional()
});

export async function POST(request: Request) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const rawBody = await request.json().catch(() => ({}));
  const parsed = createInviteSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const tournamentId = await resolveTournamentId(parsed.data.tournamentYear);

    // A matchup must be able to start in a round whose fixtures haven't kicked
    // off yet. Mid-tournament, before the next round is scheduled, there isn't
    // one — block creating a matchup nobody could start.
    const startingRoundId = await getStartingRoundId(tournamentId);
    if (!startingRoundId) {
      return NextResponse.json(
        { ok: false, error: 'New matchups can’t start right now — the next round’s fixtures haven’t been scheduled yet. Try again once the next round is set.' },
        { status: 409 }
      );
    }

    const matchup = await createMatchupWithInvite({
      tournamentId,
      createdByAppUserId: appUser.id
    });

    return NextResponse.json({
      ok: true,
      matchup: {
        id: matchup.id,
        inviteCode: matchup.invite_code,
        status: matchup.status,
        tournamentId: matchup.tournament_id,
        createdAt: matchup.created_at
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invite.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
