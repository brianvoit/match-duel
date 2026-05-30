import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/supabase/env';

/**
 * POST /api/admin/notifications/picks-due-soon
 *
 * Triggers the picks-due-soon Supabase edge function which:
 *   - finds fixtures kicking off in the next 24 hours
 *   - identifies first-pickers who haven't picked yet
 *   - sends them a push notification (deduped to once per 20h per fixture)
 *
 * Called every 30 minutes by the Cloudflare scheduled worker trigger.
 * Can also be hit manually with the JOB_ADMIN_TOKEN for testing.
 */
export async function POST(req: NextRequest) {
  const token = process.env.JOB_ADMIN_TOKEN;
  if (token) {
    const auth = req.headers.get('Authorization');
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const functionsUrl = serverEnv.SUPABASE_FUNCTIONS_URL;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!functionsUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: 'SUPABASE_FUNCTIONS_URL or SUPABASE_SERVICE_ROLE_KEY not configured.' }, { status: 500 });
  }

  try {
    const res = await fetch(`${functionsUrl}/picks-due-soon`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to call picks-due-soon.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
