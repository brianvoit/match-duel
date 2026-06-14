import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { serverEnv } from '@/lib/supabase/env';
import { HISTORICAL_WC_MATCHES } from '@/lib/data/historicalWcMatches';

const BASE = 'https://v3.football.api-sports.io';

async function apiFetch(key: string, path: string) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-apisports-key': key },
      next: { revalidate: 86400 }, // H2H history rarely changes — cache 24 h
    });
    const data = await res.json();
    if (data.errors && Object.keys(data.errors).length) return null;
    return data.response ?? null;
  } catch { return null; }
}

/** Map WC round strings to short human labels. */
function wcRound(round: string): string {
  const r = round.toLowerCase();
  if (r === 'final')           return 'World Cup Final';
  if (r.includes('semi'))      return 'World Cup SF';
  if (r.includes('quarter'))   return 'World Cup QF';
  if (r.includes('8th') || r.includes('round of 16')) return 'World Cup R16';
  if (r.includes('third') || r.includes('3rd')) return 'World Cup 3rd Place';
  return 'World Cup';
}

/** Normalize WC stage strings from static data to short labels. */
function wcStaticRound(stage: string): string {
  const s = stage.toLowerCase();
  if (s === 'final')                             return 'World Cup Final';
  if (s.includes('semi'))                        return 'World Cup SF';
  if (s.includes('quarter'))                     return 'World Cup QF';
  if (s.includes('round of 16') || s.includes('second round') || s.includes('8th')) return 'World Cup R16';
  if (s.includes('third') || s.includes('3rd')) return 'World Cup 3rd Place';
  return 'World Cup';   // group stages → just "World Cup"
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: fixture, error } = await service
    .from('fixture')
    .select('home_team, away_team, external_provider_id')
    .eq('id', id)
    .single();

  if (error || !fixture) {
    return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
  }

  const home = fixture.home_team as string;
  const away = fixture.away_team as string;
  const extId = fixture.external_provider_id as string | null;
  const apiKey = serverEnv.API_FOOTBALL_KEY;

  // ── Alias map for static WC fallback ─────────────────────────────────────
  const ALIASES: Record<string, string[]> = {
    'USA':              ['United States'],
    'Korea Republic':   ['South Korea'],
    'Czechia':          ['Czech Republic'],
    "Côte d'Ivoire":   ['Ivory Coast'],
    'IR Iran':          ['Iran'],
    'Congo DR':         ['DR Congo'],
    'Türkiye':          ['Turkey'],
  };
  function allNames(team: string): Set<string> {
    const s = new Set([team]);
    for (const alias of (ALIASES[team] ?? [])) s.add(alias);
    return s;
  }
  const homeNames = allNames(home);
  const awayNames = allNames(away);

  type Meeting = {
    year: number;
    stage: string;
    home: string;
    away: string;
    homeGoals: number | null;
    awayGoals: number | null;
  };

  let meetings: Meeting[] = [];

  // ── Try API-Football H2H ──────────────────────────────────────────────────
  if (apiKey && extId) {
    // Get team IDs from predictions (needed to build H2H query)
    const predRaw = await apiFetch(apiKey, `/predictions?fixture=${extId}`);
    const pred = Array.isArray(predRaw) ? predRaw[0] : predRaw;
    const homeTeamId: number | null = pred?.teams?.home?.id ?? null;
    const awayTeamId: number | null = pred?.teams?.away?.id ?? null;

    if (homeTeamId && awayTeamId) {
      const h2hRaw = await apiFetch(apiKey, `/fixtures/headtohead?h2h=${homeTeamId}-${awayTeamId}`);

      if (Array.isArray(h2hRaw)) {
        // Only finished, competitive past meetings. Exclude the current fixture
        // itself (the H2H feed includes it, so once it kicks off it would otherwise
        // appear here) and any meeting that isn't actually over yet.
        const FINISHED = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
        const competitive = h2hRaw.filter((m) => {
          const name: string = m.league?.name ?? '';
          const status: string = m.fixture?.status?.short ?? '';
          return (
            String(m.fixture?.id) !== String(extId) &&
            FINISHED.has(status) &&
            !name.toLowerCase().includes('friendl') &&
            m.goals?.home !== null &&
            m.goals?.away !== null
          );
        });

        if (competitive.length > 0) {
          meetings = competitive
            .sort(
              (a, b) =>
                new Date(b.fixture.date).getTime() -
                new Date(a.fixture.date).getTime()
            )
            .slice(0, 5)
            .map((m) => {
              const apiHomeIsFixtureHome = m.teams.home.id === homeTeamId;
              const leagueName: string = m.league?.name ?? '';
              const round: string = m.league?.round ?? '';
              const stage =
                leagueName === 'World Cup' ? wcRound(round) : leagueName;
              return {
                year: new Date(m.fixture.date).getFullYear(),
                stage,
                // Normalise home/away to current fixture team names
                home: apiHomeIsFixtureHome ? home : away,
                away: apiHomeIsFixtureHome ? away : home,
                homeGoals: m.goals.home as number,
                awayGoals: m.goals.away as number,
              };
            });
        }
      }
    }
  }

  // ── Fall back to static WC data if API returned nothing ───────────────────
  if (meetings.length === 0) {
    meetings = HISTORICAL_WC_MATCHES
      .filter(m =>
        (homeNames.has(m.home) && awayNames.has(m.away)) ||
        (awayNames.has(m.home) && homeNames.has(m.away))
      )
      .sort((a, b) => b.year - a.year)
      .slice(0, 5)
      .map(m => {
        const fixtureHomeWasHome = homeNames.has(m.home);
        return {
          year: m.year,
          stage: wcStaticRound(m.stage),
          // Normalise historical names → current fixture team names
          home: fixtureHomeWasHome ? home : away,
          away: fixtureHomeWasHome ? away : home,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
        };
      });
  }

  return NextResponse.json({ home, away, meetings });
}
