import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/supabase/env';

export async function GET() {
  const key = serverEnv.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ ok: false, error: 'API_FOOTBALL_KEY not set.' }, { status: 500 });

  try {
    const res = await fetch('https://v3.football.api-sports.io/status', {
      headers: { 'x-apisports-key': key },
      cache: 'no-store',
    });
    const data = await res.json() as {
      response: { subscription: { plan: string }; requests: { current: number; limit_day: number } };
    };
    const { subscription, requests } = data.response;
    return NextResponse.json({ ok: true, plan: subscription.plan, current: requests.current, limit: requests.limit_day });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
