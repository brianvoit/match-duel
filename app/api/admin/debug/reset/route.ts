import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';

const schema = z.object({
  matchupId: z.string().uuid().optional()
}).optional();

/**
 * DELETE /api/admin/debug/reset
 *
 * Wipes all debug data via cascade deletes.
 * - If matchupId is provided: deletes only that matchup (and its cascade dependents).
 * - Otherwise: deletes ALL matchups where is_debug=true, then all app_users where is_debug=true.
 *
 * Cascade on matchup covers: matchup_participant, pick, round_result,
 * matchup_standing, pick_order_assignment.
 */
export async function DELETE(request: NextRequest) {
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

    const service = createServiceRoleClient();
    const matchupId = parsed.data?.matchupId;

    if (matchupId) {
      // Wipe a specific debug matchup
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
          { ok: false, error: 'This endpoint only deletes debug matchups.' },
          { status: 403 }
        );
      }

      const { error: deleteError } = await service
        .from('matchup')
        .delete()
        .eq('id', matchupId);

      if (deleteError) {
        throw new Error(`Failed to delete matchup: ${deleteError.message}`);
      }

      return NextResponse.json({ ok: true, deletedMatchups: 1 });
    }

    // Wipe all debug matchups then all debug users
    const { error: matchupDeleteError, count: matchupCount } = await service
      .from('matchup')
      .delete({ count: 'exact' })
      .eq('is_debug', true);

    if (matchupDeleteError) {
      throw new Error(`Failed to delete debug matchups: ${matchupDeleteError.message}`);
    }

    const { error: userDeleteError, count: userCount } = await service
      .from('app_user')
      .delete({ count: 'exact' })
      .eq('is_debug', true);

    if (userDeleteError) {
      throw new Error(`Failed to delete debug users: ${userDeleteError.message}`);
    }

    return NextResponse.json({
      ok: true,
      deletedMatchups: matchupCount ?? 0,
      deletedUsers: userCount ?? 0
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Debug reset failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
