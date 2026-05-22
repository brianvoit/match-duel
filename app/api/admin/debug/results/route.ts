import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { createServiceRoleClient } from '@/lib/supabase/service';

const schema = z.object({
  fixtures: z.array(
    z.object({
      fixtureId: z.string().uuid(),
      homeScore: z.number().int().min(0),
      awayScore: z.number().int().min(0),
      status: z.enum(['SCHEDULED', 'LIVE', 'FINAL', 'POSTPONED', 'CANCELED'])
    })
  ).min(1)
});

/**
 * POST /api/admin/debug/results
 *
 * Injects scores and status onto fixtures directly.
 * No validation beyond field types — designed for simulation use.
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

    const service = createServiceRoleClient();
    const syncedAt = new Date().toISOString();
    const results: Array<{ fixtureId: string; ok: boolean; error?: string }> = [];

    for (const fixture of parsed.data.fixtures) {
      const { error } = await service
        .from('fixture')
        .update({
          home_score: fixture.homeScore,
          away_score: fixture.awayScore,
          status: fixture.status,
          last_synced_at: syncedAt
        })
        .eq('id', fixture.fixtureId);

      results.push({ fixtureId: fixture.fixtureId, ok: !error, error: error?.message });
    }

    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ ok: failed.length === 0, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Debug results injection failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
