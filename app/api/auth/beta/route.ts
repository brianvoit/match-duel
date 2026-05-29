import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/supabase/env';

function hashCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase().trim()).digest('hex');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const submitted = typeof body.code === 'string' ? body.code.toUpperCase().trim() : '';

  const betaCode = serverEnv.BETA_CODE;
  if (!betaCode) {
    return NextResponse.json({ ok: false, error: 'Beta access is not configured.' }, { status: 503 });
  }

  if (submitted !== betaCode.toUpperCase().trim()) {
    return NextResponse.json({ ok: false, error: 'Invalid beta code.' }, { status: 401 });
  }

  const store = await cookies();
  store.set('beta_session', hashCode(betaCode), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  });

  return NextResponse.json({ ok: true });
}
