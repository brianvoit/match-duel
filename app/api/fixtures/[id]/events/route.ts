import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
import { getCached, setCached } from '@/lib/jobs/fixtureApiCache';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export type MatchEvent = {
  minute: number;
  extraMinute: number | null;
  team: string;
  player: string;
  assist: string | null;
  type: 'Goal' | 'Card' | 'Subst' | 'Var';
  detail: string; // 'Normal Goal' | 'Penalty' | 'Own Goal' | 'Yellow Card' | 'Red Card' | 'Substitution 1' …
};

export type EventsData = {
  available: boolean;
  reason?: string;
  homeTeam: string;
  awayTeam: string;
  events: MatchEvent[];
};

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const service = createServiceRoleClient();

  const { data: fixture } = await service
    .from('fixture')
    .select('external_provider_id, home_team, away_team, status')
    .eq('id', id)
    .maybeSingle() as {
      data: { external_provider_id: string | null; home_team: string; away_team: string; status: string } | null;
    };

  if (!fixture) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const base = { homeTeam: fixture.home_team, awayTeam: fixture.away_team, events: [] };

  if (!fixture.external_provider_id) {
    return NextResponse.json({ ok: true, available: false, reason: 'no_external_id', ...base });
  }
  if (fixture.status !== 'FINAL' && fixture.status !== 'LIVE') {
    return NextResponse.json({ ok: true, available: false, reason: 'not_started', ...base });
  }

  // ── Check cache ───────────────────────────────────────────────────────────
  const cached = await getCached(id, 'events', fixture.status as never);
  if (cached) return NextResponse.json({ ok: true, available: true, ...base, ...cached });

  const key = serverEnv.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ ok: true, available: false, reason: 'no_api_key', ...base });

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures/events?fixture=${fixture.external_provider_id}`,
      { headers: { 'x-apisports-key': key }, cache: 'no-store' }
    );
    const data = await res.json() as {
      response: Array<{
        time: { elapsed: number; extra: number | null };
        team: { name: string };
        player: { name: string };
        assist: { name: string | null };
        type: string;
        detail: string;
      }>;
      errors?: Record<string, string>;
    };

    if (data.errors && Object.keys(data.errors).length) {
      return NextResponse.json({ ok: true, available: false, reason: 'api_error', ...base });
    }

    const events: MatchEvent[] = (data.response ?? []).map(e => ({
      minute:      e.time.elapsed,
      extraMinute: e.time.extra ?? null,
      team:        e.team.name,
      player:      e.player.name,
      assist:      e.assist?.name ?? null,
      type:        e.type as MatchEvent['type'],
      detail:      e.detail,
    }));

    await setCached(id, 'events', { events } as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, available: true, ...base, events } satisfies EventsData & { ok: boolean });
  } catch {
    return NextResponse.json({ ok: true, available: false, reason: 'api_error', ...base });
  }
}
