import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { runRoundTransitions } from '@/lib/jobs/roundTransitions';

const transitionPayloadSchema = z.object({
  tournamentId: z.string().uuid().optional()
});

export async function POST(request: NextRequest) {
  try {
    assertAdminJobRequest(request);

    const body = await request.json().catch(() => ({}));
    const parsed = transitionPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid transition payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await runRoundTransitions({ tournamentId: parsed.data.tournamentId });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Round transition failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
