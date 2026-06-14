import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Lightweight liveness probe used by the post-deploy pre-warm script.
 * Returns immediately with no DB calls — just confirms the Worker initialized.
 * Exempt from auth middleware (see middleware.ts).
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
