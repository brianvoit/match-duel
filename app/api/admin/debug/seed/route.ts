import { NextRequest, NextResponse } from 'next/server';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { resolveTournamentId } from '@/lib/supabase/matchups';
import { initializeFirstRoundPickOrder } from '@/lib/supabase/pickOrder';

/**
 * POST /api/admin/debug/seed
 *
 * Creates two debug app_user rows, an is_debug matchup on the active tournament,
 * inserts both as matchup_participant, and initializes Round 1 pick order
 * with User B (joiner) picking first.
 *
 * Returns: { matchupId, participantA, participantB }
 */
export async function POST(request: NextRequest) {
  try {
    assertAdminJobRequest(request);

    const service = createServiceRoleClient();
    const tournamentId = await resolveTournamentId();

    // Create two debug users
    const { data: userA, error: userAError } = await service
      .from('app_user')
      .insert({ email: `debug-a-${Date.now()}@debug.invalid`, display_name: 'Debug Player A', is_debug: true })
      .select('id, email')
      .single();

    if (userAError) {
      throw new Error(`Failed to create debug user A: ${userAError.message}`);
    }

    const { data: userB, error: userBError } = await service
      .from('app_user')
      .insert({ email: `debug-b-${Date.now()}@debug.invalid`, display_name: 'Debug Player B', is_debug: true })
      .select('id, email')
      .single();

    if (userBError) {
      throw new Error(`Failed to create debug user B: ${userBError.message}`);
    }

    // Create a debug matchup (User A is creator)
    const inviteCode = `DBG${Date.now().toString(36).toUpperCase().slice(-7)}`;
    const { data: matchup, error: matchupError } = await service
      .from('matchup')
      .insert({
        tournament_id: tournamentId,
        invite_code: inviteCode,
        created_by: userA.id,
        is_debug: true
      })
      .select('id')
      .single();

    if (matchupError) {
      throw new Error(`Failed to create debug matchup: ${matchupError.message}`);
    }

    // Insert both participants
    const { data: participantA, error: pAError } = await service
      .from('matchup_participant')
      .insert({ matchup_id: matchup.id, user_id: userA.id })
      .select('id')
      .single();

    if (pAError) {
      throw new Error(`Failed to add participant A: ${pAError.message}`);
    }

    const { data: participantB, error: pBError } = await service
      .from('matchup_participant')
      .insert({ matchup_id: matchup.id, user_id: userB.id })
      .select('id')
      .single();

    if (pBError) {
      throw new Error(`Failed to add participant B: ${pBError.message}`);
    }

    // Initialize Round 1 pick order — User B (joiner) picks first
    await initializeFirstRoundPickOrder({
      matchupId: matchup.id,
      tournamentId,
      joinerParticipantId: participantB.id as string,
      creatorParticipantId: participantA.id as string
    });

    return NextResponse.json({
      ok: true,
      matchupId: matchup.id,
      inviteCode,
      participantA: { userId: userA.id, email: userA.email, participantId: participantA.id },
      participantB: { userId: userB.id, email: userB.email, participantId: participantB.id }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Debug seed failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
