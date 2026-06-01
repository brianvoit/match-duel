import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
import type { RecapData } from '@/app/components/playground-types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Stats to show, in order (skip noise like pass %)
const STAT_WHITELIST = [
  'Shots on Goal',
  'Shots off Goal',
  'Total Shots',
  'Blocked Shots',
  'Shots insidebox',
  'Shots outsidebox',
  'Fouls',
  'Corner Kicks',
  'Offsides',
  'Ball Possession',
  'Yellow Cards',
  'Red Cards',
  'Goalkeeper Saves',
];

function parseVal(v: string | number | null): number | string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  // "51%" → "51%" keep as string for display; parse for bar math
  return String(v);
}

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

  if (!fixture?.external_provider_id) {
    return NextResponse.json({ ok: true, available: false, reason: 'no_external_id', stats: [] } satisfies Partial<RecapData> & { ok: boolean });
  }
  if (fixture.status !== 'FINAL' && fixture.status !== 'LIVE') {
    return NextResponse.json({ ok: true, available: false, reason: 'not_final', stats: [] });
  }

  const key = serverEnv.API_FOOTBALL_KEY;
  if (!key) {
    return NextResponse.json({ ok: true, available: false, reason: 'no_api_key', stats: [] });
  }

  try {
    const res = await fetch(
      `https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixture.external_provider_id}`,
      { headers: { 'x-apisports-key': key }, cache: 'no-store' }
    );
    const data = await res.json() as {
      response: Array<{ team: { name: string }; statistics: Array<{ type: string; value: string | number | null }> }>;
      errors?: Record<string, string>;
    };

    if (data.errors && Object.keys(data.errors).length > 0) {
      return NextResponse.json({ ok: true, available: false, reason: 'api_error', stats: [] });
    }

    const teams = data.response ?? [];
    if (!teams.length) {
      return NextResponse.json({ ok: true, available: false, reason: 'no_stats', stats: [] });
    }

    const homeTeamData = teams.find(t => t.team.name === fixture.home_team) ?? teams[0];
    const awayTeamData = teams.find(t => t.team.name === fixture.away_team) ?? teams[1] ?? null;

    const homeMap = new Map(homeTeamData.statistics.map(s => [s.type, s.value]));
    const awayMap = new Map((awayTeamData?.statistics ?? []).map(s => [s.type, s.value]));

    const stats = STAT_WHITELIST
      .filter(type => homeMap.has(type) || awayMap.has(type))
      .map(type => ({
        type,
        home: parseVal(homeMap.get(type) ?? null),
        away: parseVal(awayMap.get(type) ?? null),
      }))
      .filter(s => s.home !== null || s.away !== null);

    const result: RecapData & { ok: boolean } = {
      ok: true,
      available: true,
      homeTeam: homeTeamData.team.name,
      awayTeam: awayTeamData?.team.name ?? fixture.away_team,
      stats,
    };
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ ok: true, available: false, reason: 'api_error', stats: [] });
  }
}
