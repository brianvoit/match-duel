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
  const teams = new Set([home, away]);

  const meetings = HISTORICAL_WC_MATCHES
    .filter((m) => teams.has(m.home) && teams.has(m.away))
    .sort((a, b) => b.year - a.year)
    .slice(0, 5);

  return NextResponse.json({ home, away, meetings });
}
