import { NextRequest, NextResponse } from 'next/server';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { initializeFirstRoundPickOrder } from '@/lib/supabase/pickOrder';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertAdminJobRequest(request);
    const { id: matchupId } = await context.params;
    const service = createServiceRoleClient();

    const { data: matchup } = await service
      .from('matchup')
      .select('id, tournament_id, created_by')
      .eq('id', matchupId)
      .single() as { data: { id: string; tournament_id: string; created_by: string } | null };

    if (!matchup) {
      return NextResponse.json({ ok: false, error: 'Matchup not found.' }, { status: 404 });
    }

    const { data: participants } = await service
      .from('matchup_participant')
      .select('id, user_id')
      .eq('matchup_id', matchupId) as {
      data: Array<{ id: string; user_id: string }> | null;
    };

    if (!participants || participants.length < 2) {
      return NextResponse.json({ ok: false, error: 'Matchup needs 2 participants.' }, { status: 409 });
    }

    const creator = participants.find((p) => p.user_id === matchup.created_by);
    const joiner = participants.find((p) => p.user_id !== matchup.created_by);

    if (!creator || !joiner) {
      return NextResponse.json({ ok: false, error: 'Could not resolve participants.' }, { status: 500 });
    }

    await initializeFirstRoundPickOrder({
      matchupId,
      tournamentId: matchup.tournament_id,
      joinerParticipantId: joiner.id,
      creatorParticipantId: creator.id
    });

    return NextResponse.json({ ok: true, matchupId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize pick order.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
