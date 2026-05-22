import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { runRoundSettlement } from '@/lib/jobs/settleRound';

const settlePayloadSchema = z.object({
  roundId: z.string().uuid(),
  matchupId: z.string().uuid().optional()
});

export async function POST(request: NextRequest) {
  try {
    assertAdminJobRequest(request);

    const body = await request.json().catch(() => ({}));
    const parsed = settlePayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid settle payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await runRoundSettlement(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Round settlement failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
