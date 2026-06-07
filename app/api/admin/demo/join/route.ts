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
 * - Picks the first bot (from the pool of 4) not already opposing the caller
 *   in another matchup — so each matchup gets a different-named opponent.
 * - Inserts the bot as the second matchup_participant.
 * - Initialises Round 1 pick order (caller = creator picks first in most
 *   rounds; bot = joiner picks first in Round 1).
 */

const BOT_EMAILS = [
  'bot@demo.local',
  'bot2@demo.local',
  'bot3@demo.local',
  'bot4@demo.local',
];

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

    // Find all bots already opposing the caller in any other matchup
    const { data: callerMatchups } = await service
      .from('matchup_participant')
      .select('matchup_id')
      .eq('user_id', callerUser.id);

    const callerMatchupIds = (callerMatchups ?? []).map((m) => m.matchup_id as string);

    // Find all bot user IDs already in any of the caller's matchups
    const usedBotIds = new Set<string>();
    if (callerMatchupIds.length > 0) {
      const { data: usedParticipants } = await service
        .from('matchup_participant')
        .select('user_id')
        .in('matchup_id', callerMatchupIds)
        .neq('user_id', callerUser.id);

      // Cross-reference with bot user records
      const { data: allBots } = await service
        .from('app_user')
        .select('id')
        .in('email', BOT_EMAILS);

      const botIdSet = new Set((allBots ?? []).map((b) => b.id as string));
      for (const p of usedParticipants ?? []) {
        if (botIdSet.has(p.user_id as string)) usedBotIds.add(p.user_id as string);
      }
    }

    // Fetch all bot users (they must already exist in the DB)
    const { data: botUsers } = await service
      .from('app_user')
      .select('id, email, display_name')
      .in('email', BOT_EMAILS);

    if (!botUsers || botUsers.length === 0) {
      return NextResponse.json({ ok: false, error: 'No demo bots found in DB.' }, { status: 500 });
    }

    // Sort by BOT_EMAILS order and pick first one not already used
    const ordered = BOT_EMAILS
      .map((email) => botUsers.find((b) => b.email === email))
      .filter(Boolean) as typeof botUsers;

    const chosenBot = ordered.find((b) => !usedBotIds.has(b.id as string));
    if (!chosenBot) {
      return NextResponse.json(
        { ok: false, error: 'All demo opponents are already in your matchups.' },
        { status: 409 }
      );
    }

    const botUserId = chosenBot.id as string;

    // Sanity check: bot isn't already in this specific matchup
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
      botEmail: chosenBot.email,
      botDisplayName: chosenBot.display_name,
      botParticipantId: botParticipant.id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Demo join failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
