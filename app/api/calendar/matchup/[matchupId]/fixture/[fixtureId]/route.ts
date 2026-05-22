import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { ensureAppUser } from '@/lib/supabase/user';
import { buildIcs, IcsFixture } from '@/lib/utils/ics';
import { teamCode } from '@/lib/data/teamInfo';

interface RouteContext {
  params: Promise<{ matchupId: string; fixtureId: string }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { matchupId, fixtureId } = await context.params;
  const service = createServiceRoleClient();
  const appUser = await ensureAppUser(user);

  // Verify user is a participant in this matchup
  const { data: participant } = await service
    .from('matchup_participant')
    .select('id')
    .eq('matchup_id', matchupId)
    .eq('user_id', appUser.id)
    .maybeSingle();

  if (!participant) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  // Load fixture
  const { data: fixture, error: fixtureError } = await service
    .from('fixture')
    .select('id, home_team, away_team, starts_at, group_name, venue, city')
    .eq('id', fixtureId)
    .single();

  if (fixtureError || !fixture) {
    return NextResponse.json({ ok: false, error: 'Fixture not found' }, { status: 404 });
  }

  // Load picks for this matchup + fixture
  const { data: picks } = await service
    .from('pick')
    .select('participant_id, side')
    .eq('matchup_id', matchupId)
    .eq('fixture_id', fixtureId);

  const myPick = picks?.find((p) => p.participant_id === participant.id);
  const oppPick = picks?.find((p) => p.participant_id !== participant.id);

  const icsFixture: IcsFixture = {
    id: fixture.id,
    homeTeam: fixture.home_team,
    awayTeam: fixture.away_team,
    startsAt: fixture.starts_at,
    groupName: fixture.group_name ?? null,
    venue: fixture.venue ?? null,
    city: fixture.city ?? null,
    myPickSide: (myPick?.side as 'HOME' | 'AWAY' | null) ?? null,
    opponentPickSide: (oppPick?.side as 'HOME' | 'AWAY' | null) ?? null,
  };

  const ics = buildIcs([icsFixture]);
  const homeCode = teamCode(fixture.home_team);
  const awayCode = teamCode(fixture.away_team);
  const filename = `${homeCode}-vs-${awayCode}.ics`;

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
