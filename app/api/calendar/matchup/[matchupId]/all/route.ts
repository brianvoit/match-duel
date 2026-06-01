import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { buildIcs, IcsFixture } from '@/lib/utils/ics';

interface RouteContext {
  params: Promise<{ matchupId: string }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const { matchupId } = await context.params;
  const service = createServiceRoleClient();

  // Verify participant + get tournament ID
  const { data: participant } = await service
    .from('matchup_participant')
    .select('id')
    .eq('matchup_id', matchupId)
    .eq('user_id', appUser.id)
    .maybeSingle();

  if (!participant) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const { data: matchup } = await service
    .from('matchup')
    .select('tournament_id')
    .eq('id', matchupId)
    .single();

  if (!matchup) {
    return NextResponse.json({ ok: false, error: 'Matchup not found' }, { status: 404 });
  }

  // Load all fixtures for the tournament, ordered chronologically
  const { data: fixtures, error: fixturesError } = await service
    .from('fixture')
    .select('id, home_team, away_team, starts_at, group_name, venue, city')
    .eq('tournament_id', matchup.tournament_id)
    .order('starts_at', { ascending: true });

  if (fixturesError || !fixtures) {
    return NextResponse.json({ ok: false, error: 'Failed to load fixtures' }, { status: 500 });
  }

  // Load all picks for this matchup in one query
  const { data: picks } = await service
    .from('pick')
    .select('fixture_id, participant_id, side')
    .eq('matchup_id', matchupId);

  const picksByFixture = new Map<string, { myPickSide: 'HOME' | 'AWAY' | null; opponentPickSide: 'HOME' | 'AWAY' | null }>();
  for (const pick of picks ?? []) {
    const entry = picksByFixture.get(pick.fixture_id) ?? { myPickSide: null, opponentPickSide: null };
    if (pick.participant_id === participant.id) {
      entry.myPickSide = pick.side as 'HOME' | 'AWAY';
    } else {
      entry.opponentPickSide = pick.side as 'HOME' | 'AWAY';
    }
    picksByFixture.set(pick.fixture_id, entry);
  }

  const icsFixtures: IcsFixture[] = fixtures.map((f) => {
    const picks = picksByFixture.get(f.id) ?? { myPickSide: null, opponentPickSide: null };
    return {
      id: f.id,
      homeTeam: f.home_team,
      awayTeam: f.away_team,
      startsAt: f.starts_at,
      groupName: f.group_name ?? null,
      venue: f.venue ?? null,
      city: f.city ?? null,
      myPickSide: picks.myPickSide,
      opponentPickSide: picks.opponentPickSide,
    };
  });

  const ics = buildIcs(icsFixtures, 'Match Duel – FIFA World Cup 2026');

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="match-duel-2026.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
