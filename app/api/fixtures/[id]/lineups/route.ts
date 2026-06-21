import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
import { getCached, setCached } from '@/lib/jobs/fixtureApiCache';
import type { TeamLineup, SquadData } from '@/app/components/playground-types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// API-Football player shape from /fixtures/lineups
interface ApiPlayer {
  player: { name: string; number: number; pos: string; grid: string | null };
}

interface ApiLineup {
  team: { name: string };
  coach: { name: string | null };
  formation: string;
  startXI: ApiPlayer[];
  substitutes: ApiPlayer[];
}

function mapLineup(raw: ApiLineup): TeamLineup {
  const mapPlayer = (p: ApiPlayer) => ({
    name: p.player.name,
    number: p.player.number,
    pos: p.player.pos,
    grid: p.player.grid,
  });
  return {
    teamName: raw.team.name,
    formation: raw.formation,
    coachName: raw.coach?.name ?? null,
    starters: raw.startXI.map(mapPlayer),
    substitutes: raw.substitutes.map(mapPlayer),
    unavailable: [],
  };
}

// API-Football /injuries shape (players unavailable for the fixture)
interface ApiInjury {
  player: { name: string };
  team: { name: string };
  player_reason?: string | null;
  reason?: string | null;
}

/** Fetch players unavailable for this fixture and split them by team name.
 *  Best-effort: any failure just yields empty lists (the section hides). */
async function fetchUnavailable(externalId: string, key: string, homeName: string, awayName: string) {
  const empty = { home: [] as { name: string; reason: string | null }[], away: [] as { name: string; reason: string | null }[] };
  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/injuries?fixture=${externalId}`,
      { headers: { 'x-apisports-key': key }, cache: 'no-store' }
    );
    const data = await res.json() as { response?: ApiInjury[]; errors?: Record<string, string> };
    if (data.errors && Object.keys(data.errors).length > 0) return empty;
    const home: { name: string; reason: string | null }[] = [];
    const away: { name: string; reason: string | null }[] = [];
    for (const item of data.response ?? []) {
      const entry = { name: item.player.name, reason: item.reason ?? item.player_reason ?? null };
      if (item.team.name === awayName) away.push(entry);
      else home.push(entry);
    }
    return { home, away };
  } catch {
    return empty;
  }
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const service = createServiceRoleClient();

  // Look up the fixture to get its API-Football external ID
  const { data: fixture } = await service
    .from('fixture')
    .select('external_provider_id, home_team, away_team, status')
    .eq('id', id)
    .maybeSingle() as {
      data: { external_provider_id: string | null; home_team: string; away_team: string; status: string } | null;
    };

  if (!fixture?.external_provider_id) {
    return NextResponse.json({ ok: true, available: false, reason: 'no_external_id' } satisfies Partial<SquadData> & { ok: boolean });
  }

  // ── Check cache ───────────────────────────────────────────────────────────
  const cached = await getCached(id, 'lineup', fixture.status as never);
  if (cached) return NextResponse.json({ ok: true, available: true, ...cached });

  const key = serverEnv.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ ok: true, available: false, reason: 'no_api_key' });

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixture.external_provider_id}`,
      { headers: { 'x-apisports-key': key }, cache: 'no-store' }
    );

    const data = await res.json() as { response: ApiLineup[]; errors?: Record<string, string> };

    if (data.errors && Object.keys(data.errors).length > 0) {
      return NextResponse.json({ ok: true, available: false, reason: 'api_error' });
    }

    const lineups = data.response ?? [];
    if (!lineups.length) {
      return NextResponse.json({ ok: true, available: false, reason: 'not_yet_available' } satisfies Partial<SquadData> & { ok: boolean });
    }

    const homeRaw = lineups.find(l => l.team.name === fixture.home_team) ?? lineups[0];
    const awayRaw = lineups.find(l => l.team.name === fixture.away_team) ?? lineups[1] ?? null;

    const home = homeRaw ? mapLineup(homeRaw) : null;
    const away = awayRaw ? mapLineup(awayRaw) : null;

    // Players unavailable for this fixture (injured / suspended), split by team.
    const unavailable = await fetchUnavailable(
      fixture.external_provider_id, key,
      home?.teamName ?? fixture.home_team,
      away?.teamName ?? fixture.away_team,
    );
    if (home) home.unavailable = unavailable.home;
    if (away) away.unavailable = unavailable.away;

    const payload = { available: true, home, away };
    await setCached(id, 'lineup', payload as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, ...payload });
  } catch {
    return NextResponse.json({ ok: true, available: false, reason: 'api_error' });
  }
}
