import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { runRoundTransitions } from '@/lib/jobs/roundTransitions';

const schema = z.object({
  roundId: z.string().uuid(),
  matchupId: z.string().uuid().optional()
});

/**
 * POST /api/admin/debug/advance
 *
 * Fast-forwards a full round cycle:
 * 1. Marks all non-FINAL fixtures in the round as FINAL (defaults to 1-0 if unscored)
 * 2. Calls runRoundTransitions which marks the round complete, settles it,
 *    and assigns next-round pick order automatically.
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

    const { roundId } = parsed.data;
    const service = createServiceRoleClient();

    // Fetch round to get tournament_id for the transition call
    const { data: round, error: roundError } = await service
      .from('round')
      .select('id, tournament_id, is_complete')
      .eq('id', roundId)
      .maybeSingle<{ id: string; tournament_id: string; is_complete: boolean }>();

    if (roundError) {
      throw new Error(`Failed to fetch round: ${roundError.message}`);
    }

    if (!round) {
      return NextResponse.json({ ok: false, error: 'Round not found.' }, { status: 404 });
    }

    if (round.is_complete) {
      return NextResponse.json({ ok: false, error: 'Round is already complete.' }, { status: 409 });
    }

    // Fetch all non-FINAL fixtures in the round
    const { data: fixtures, error: fixtureError } = await service
      .from('fixture')
      .select('id, home_score, away_score, status')
      .eq('round_id', roundId)
      .neq('status', 'FINAL') as {
      data: Array<{ id: string; home_score: number | null; away_score: number | null; status: string }> | null;
      error: { message: string } | null;
    };

    if (fixtureError) {
      throw new Error(`Failed to fetch fixtures: ${fixtureError.message}`);
    }

    const syncedAt = new Date().toISOString();

    // Mark every non-FINAL fixture as FINAL with a default 1-0 score if unset
    for (const fixture of fixtures ?? []) {
      await service
        .from('fixture')
        .update({
          status: 'FINAL',
          home_score: fixture.home_score ?? 1,
          away_score: fixture.away_score ?? 0,
          last_synced_at: syncedAt
        })
        .eq('id', fixture.id);
    }

    // Run transitions — this completes the round, settles picks, and assigns next-round pick order
    const result = await runRoundTransitions({ tournamentId: round.tournament_id });

    return NextResponse.json({
      ok: true,
      fixturesAdvanced: (fixtures ?? []).length,
      transitionResult: result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Debug advance failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
