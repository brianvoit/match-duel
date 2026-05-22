import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';

const schema = z.object({
  matchupId: z.string().uuid(),
  roundId: z.string().uuid(),
  participantId: z.string().uuid(),
  picks: z.array(
    z.object({
      fixtureId: z.string().uuid(),
      side: z.enum(['HOME', 'AWAY'])
    })
  ).min(1)
});

/**
 * POST /api/admin/debug/picks
 *
 * Submits picks for a participant, bypassing the kickoff-lock check.
 * Only operates on matchups marked is_debug=true.
 */
export async function POST(request: NextRequest) {
  try {
    assertAdminJobRequest(request);

    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { matchupId, roundId, participantId, picks } = parsed.data;
    const service = createServiceRoleClient();

    // Safety guard: only allow debug matchups
    const { data: matchup, error: matchupError } = await service
      .from('matchup')
      .select('id, is_debug')
      .eq('id', matchupId)
      .maybeSingle<{ id: string; is_debug: boolean }>();

    if (matchupError) {
      throw new Error(`Failed to fetch matchup: ${matchupError.message}`);
    }

    if (!matchup) {
      return NextResponse.json({ ok: false, error: 'Matchup not found.' }, { status: 404 });
    }

    if (!matchup.is_debug) {
      return NextResponse.json(
        { ok: false, error: 'This endpoint only operates on debug matchups.' },
        { status: 403 }
      );
    }

    const rows = picks.map((pick) => ({
      matchup_id: matchupId,
      round_id: roundId,
      fixture_id: pick.fixtureId,
      participant_id: participantId,
      side: pick.side,
      submitted_at: new Date().toISOString(),
      locked_at: null
    }));

    const { error: upsertError } = await service
      .from('pick')
      .upsert(rows, { onConflict: 'fixture_id,participant_id' });

    if (upsertError) {
      throw new Error(`Failed to upsert picks: ${upsertError.message}`);
    }

    return NextResponse.json({ ok: true, inserted: picks.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Debug picks failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
