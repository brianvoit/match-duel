import { NextRequest, NextResponse } from 'next/server';
import { assertAdminJobRequest } from '@/lib/jobs/auth';
import { fixtureSyncPayloadSchema } from '@/lib/jobs/fixtureProvider';
import { runFixtureSync } from '@/lib/jobs/fixtureSync';

export async function POST(request: NextRequest) {
  try {
    assertAdminJobRequest(request);

    const body = await request.json().catch(() => null);
    const parsed = fixtureSyncPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid fixture sync payload.', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await runFixtureSync(parsed.data);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fixture sync failed.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
