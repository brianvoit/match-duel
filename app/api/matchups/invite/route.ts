import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveTournamentId, createMatchupWithInvite } from '@/lib/supabase/matchups';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ensureAppUser } from '@/lib/supabase/user';

const createInviteSchema = z.object({
  tournamentYear: z.number().int().min(1900).max(3000).optional()
});

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = createInviteSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload.', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const appUser = await ensureAppUser(user);
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
