import { NextRequest, NextResponse } from 'next/server';
import { getReadiness, getDataHealth } from '@/lib/jobs/tournamentHealth';

/**
 * Pre-tournament go/no-go board + data-health watchdog, in one call.
 *   ?tournamentId=  — check a specific (e.g. not-yet-active) tournament.
 * Read-only and DB-only (no API-Football calls), so it's safe to hit freely.
 */
export async function GET(req: NextRequest) {
  const token = process.env.JOB_ADMIN_TOKEN;
  if (token) {
    const auth = req.headers.get('Authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const tid = req.nextUrl.searchParams.get('tournamentId') ?? undefined;
    const [readiness, health] = await Promise.all([getReadiness(tid), getDataHealth()]);
    return NextResponse.json({
      ok: readiness.ok && health.ok,
      readiness,
      health,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
