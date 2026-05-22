import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { initializeFirstRoundPickOrder } from '@/lib/supabase/pickOrder';

/**
 * POST /api/admin/demo/join
 *
 * Adds a bot participant to an existing matchup so the owner can test
 * the full two-player experience alone.
 *
 * Body: { matchupId: string }
 *
 * - Verifies the caller is already a participant in the matchup.
 * - Rejects if the matchup already has 2+ participants.
 * - Creates (or finds) a permanent bot user: bot@demo.local
 * - Inserts the bot as the second matchup_participant.
 * - Initialises Round 1 pick order (caller = creator picks first in most
 *   rounds; bot = joiner picks first in Round 1).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await createServerSupabaseClient();
    const {
      data: { user }
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 });
    }

    const body = await request.json();
    const { matchupId } = body as { matchupId?: string };
    if (!matchupId) {
      return NextResponse.json({ ok: false, error: 'matchupId is required.' }, { status: 400 });
    }

    const service = createServiceRoleClient();

    // Find the caller's app_user
    const { data: callerUser, error: callerError } = await service
      .from('app_user')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();
    if (callerError || !callerUser) {
      return NextResponse.json({ ok: false, error: 'App user not found.' }, { status: 404 });
    }

    // Verify caller is already a participant and get all current participants
    const { data: participants, error: partError } = await service
      .from('matchup_participant')
      .select('id, user_id')
      .eq('matchup_id', matchupId);
    if (partError) throw partError;

    const callerIsParticipant = participants?.some((p) => p.user_id === callerUser.id);
    if (!callerIsParticipant) {
      return NextResponse.json(
        { ok: false, error: 'You are not a participant in this matchup.' },
        { status: 403 }
      );
    }

    if ((participants?.length ?? 0) >= 2) {
      return NextResponse.json(
        { ok: false, error: 'This matchup already has two players.' },
        { status: 409 }
      );
    }

    // Get the matchup's tournament_id
    const { data: matchup, error: matchupError } = await service
      .from('matchup')
      .select('id, tournament_id')
      .eq('id', matchupId)
      .single();
    if (matchupError || !matchup) {
      return NextResponse.json({ ok: false, error: 'Matchup not found.' }, { status: 404 });
    }

    // Find or create the demo bot user
    const botEmail = 'bot@demo.local';
    let botUserId: string;

    const { data: existingBot } = await service
      .from('app_user')
      .select('id')
      .eq('email', botEmail)
      .maybeSingle();

    if (existingBot) {
      botUserId = existingBot.id as string;
    } else {
      const { data: newBot, error: botError } = await service
        .from('app_user')
        .insert({ email: botEmail, display_name: 'Demo Opponent' })
        .select('id')
        .single();
      if (botError || !newBot) throw new Error('Failed to create bot user.');
      botUserId = newBot.id as string;
    }

    // Check bot isn't already in this matchup
    const botAlreadyIn = participants?.some((p) => p.user_id === botUserId);
    if (botAlreadyIn) {
      return NextResponse.json(
        { ok: false, error: 'Bot is already a participant in this matchup.' },
        { status: 409 }
      );
    }

    // Add bot as second participant
    const { data: botParticipant, error: botPartError } = await service
      .from('matchup_participant')
      .insert({ matchup_id: matchupId, user_id: botUserId })
      .select('id')
      .single();
    if (botPartError || !botParticipant) throw new Error('Failed to add bot participant.');

    // Initialise Round 1 pick order — bot (joiner) picks first
    const callerParticipant = participants!.find((p) => p.user_id === callerUser.id)!;
    await initializeFirstRoundPickOrder({
      matchupId,
      tournamentId: matchup.tournament_id as string,
      joinerParticipantId: botParticipant.id as string,
      creatorParticipantId: callerParticipant.id as string
    });

    return NextResponse.json({
      ok: true,
      matchupId,
      botEmail,
      botParticipantId: botParticipant.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Demo join failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
