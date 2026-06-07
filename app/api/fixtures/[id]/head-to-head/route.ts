import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { HISTORICAL_WC_MATCHES } from '@/lib/data/historicalWcMatches';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const service = createServiceRoleClient();

  const { data: fixture, error } = await service
    .from('fixture')
    .select('home_team, away_team')
    .eq('id', id)
    .single();

  if (error || !fixture) {
    return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });
  }

  const home = fixture.home_team as string;
  const away = fixture.away_team as string;

  // Historical data uses legacy names; map current fixture names to their aliases
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

  const meetings = HISTORICAL_WC_MATCHES
    .filter(m =>
      (homeNames.has(m.home) && awayNames.has(m.away)) ||
      (awayNames.has(m.home) && homeNames.has(m.away))
    )
    .sort((a, b) => b.year - a.year)
    .slice(0, 5);

  return NextResponse.json({ home, away, meetings });
}
