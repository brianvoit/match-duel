import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTournamentId, createMatchupWithInvite } from '@/lib/supabase/matchups';

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
