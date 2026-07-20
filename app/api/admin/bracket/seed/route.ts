import { NextRequest, NextResponse } from 'next/server';
import { ensureBracketSeeded, runBracketResolution, reconcileBracketFromApi } from '@/lib/jobs/resolveBracket';

/**
 * Manual trigger for the knockout-bracket pipeline (seed skeleton → resolve from
 * results → reconcile with the API draw). The cron runs this every tick too, so
 * this is mostly a convenience / first-run kick. All steps are idempotent.
 */
export async function POST(req: NextRequest) {
  const token = process.env.JOB_ADMIN_TOKEN;
  if (token) {
    const auth = req.headers.get('Authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Optional ?tournamentId= targets a specific (e.g. not-yet-active) tournament,
    // so a newly-provisioned bracket can be seeded before it goes live.
    const tid = new URL(req.url).searchParams.get('tournamentId') ?? undefined;
    const input = tid ? { tournamentId: tid } : undefined;
    const seed = await ensureBracketSeeded(input);
    const resolved = await runBracketResolution(input);
    const reconciled = await reconcileBracketFromApi(input);
    return NextResponse.json({ ok: true, ...seed, ...resolved, ...reconciled });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
