import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
import { getCached, setCached } from '@/lib/jobs/fixtureApiCache';
import { sideForApiTeam } from '@/lib/domain/teamSides';

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
  comments: string | null; // e.g. 'Penalty Shootout' — marks tie-break kicks
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
    .select('external_provider_id, home_team, away_team, status, home_pen_score, away_pen_score')
    .eq('id', id)
    .maybeSingle() as {
      data: { external_provider_id: string | null; home_team: string; away_team: string; status: string; home_pen_score: number | null; away_pen_score: number | null } | null;
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
        comments: string | null;
      }>;
      errors?: Record<string, string>;
    };

    if (data.errors && Object.keys(data.errors).length) {
      return NextResponse.json({ ok: true, available: false, reason: 'api_error', ...base });
    }

    // The external provider id can be a stand-in whose real teams differ from
    // our fixture's. Look up the API fixture's home/away team names so we can
    // relabel each event's team to OUR fixture's teams (keeps the recap's
    // home/away split correct).
    let apiHome: string | null = null;
    let apiAway: string | null = null;
    try {
      const fxRes = await fetch(
        `https://v3.football.api-sports.io/fixtures?id=${fixture.external_provider_id}`,
        { headers: { 'x-apisports-key': key }, cache: 'no-store' }
      );
      const fxData = await fxRes.json() as {
        response?: Array<{ teams?: { home?: { name?: string }; away?: { name?: string } } }>;
      };
      apiHome = fxData.response?.[0]?.teams?.home?.name ?? null;
      apiAway = fxData.response?.[0]?.teams?.away?.name ?? null;
    } catch { /* fall back to name match */ }

    const relabelTeam = (apiName: string): string => {
      // Identity first (shared helper). A knockout fixture's home/away can be
      // reversed relative to the API (we seed orientation from the bracket), so
      // mapping the API's home to ours *positionally* would flip every event
      // onto the wrong team; matching by code also absorbs API name variants.
      const side = sideForApiTeam(apiName, fixture.home_team, fixture.away_team);
      if (side) return side === 'HOME' ? fixture.home_team : fixture.away_team;
      // Only fall back to position for a stand-in id whose real teams aren't ours.
      if (apiHome && apiName === apiHome) return fixture.home_team;
      if (apiAway && apiName === apiAway) return fixture.away_team;
      return fixture.home_team;
    };

    const events: MatchEvent[] = (data.response ?? []).map(e => ({
      minute:      e.time.elapsed,
      extraMinute: e.time.extra ?? null,
      team:        relabelTeam(e.team.name),
      player:      e.player.name,
      assist:      e.assist?.name ?? null,
      type:        e.type as MatchEvent['type'],
      detail:      e.detail,
      comments:    e.comments ?? null,
    }));

    // A fixture decided on penalties whose events feed carries no shootout kicks
    // is incomplete — don't let the FINAL Infinity TTL freeze it forever; a later
    // read re-fetches until the provider fills the shootout in.
    const wentToPens = fixture.home_pen_score != null && fixture.away_pen_score != null;
    const hasShootoutKicks = events.some((e) => (e.comments ?? '').toLowerCase().includes('shootout'));
    const complete = !(wentToPens && !hasShootoutKicks);
    await setCached(id, 'events', { events } as unknown as Record<string, unknown>, { complete });
    return NextResponse.json({ ok: true, available: true, ...base, events } satisfies EventsData & { ok: boolean });
  } catch {
    return NextResponse.json({ ok: true, available: false, reason: 'api_error', ...base });
  }
}
