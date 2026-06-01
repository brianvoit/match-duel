import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { getAuthenticatedUser } from '@/lib/supabase/get-user';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const matchupId = req.nextUrl.searchParams.get('matchupId');

  const service = createServiceRoleClient();

  // 1. Look up the fixture
  const { data: fixture } = await service
    .from('fixture')
    .select('home_team, away_team, round_id')
    .eq('id', id)
    .maybeSingle() as { data: { home_team: string; away_team: string; round_id: string } | null };

  if (!fixture) return NextResponse.json({ ok: false, error: 'Fixture not found.' }, { status: 404 });

  // 2. Resolve tournament via round
  const { data: round } = await service
    .from('round')
    .select('tournament_id')
    .eq('id', fixture.round_id)
    .maybeSingle() as { data: { tournament_id: string } | null };

  if (!round) return NextResponse.json({ ok: false, error: 'Round not found.' }, { status: 404 });

  // 3. All rounds in the tournament (for stage lookup)
  const { data: rounds } = await service
    .from('round')
    .select('id, stage')
    .eq('tournament_id', round.tournament_id) as {
      data: Array<{ id: string; stage: string }> | null;
    };

  const roundIds = (rounds ?? []).map(r => r.id);
  const stageByRound = new Map((rounds ?? []).map(r => [r.id, r.stage]));

  // 4. All FINAL fixtures in this tournament involving either team (excluding current)
  const { data: allFinal } = await service
    .from('fixture')
    .select('id, home_team, away_team, home_score, away_score, status, starts_at, round_id, group_name')
    .in('round_id', roundIds)
    .eq('status', 'FINAL')
    .neq('id', id)
    .order('starts_at', { ascending: true }) as {
      data: Array<{
        id: string; home_team: string; away_team: string;
        home_score: number | null; away_score: number | null;
        status: string; starts_at: string; round_id: string; group_name: string | null;
      }> | null;
    };

  const homeTeam = fixture.home_team;
  const awayTeam = fixture.away_team;

  const homeFixtures = (allFinal ?? []).filter(
    f => f.home_team === homeTeam || f.away_team === homeTeam
  );
  const awayFixtures = (allFinal ?? []).filter(
    f => f.home_team === awayTeam || f.away_team === awayTeam
  );

  // 5. Pick data — only if matchupId and user are available
  const allIds = [...homeFixtures, ...awayFixtures].map(f => f.id);
  const picksMap = new Map<string, { myPickSide: 'HOME' | 'AWAY' | null; opponentPickSide: 'HOME' | 'AWAY' | null }>();

  if (matchupId && allIds.length > 0) {
    const appUser = await getAuthenticatedUser();

    if (appUser) {
      const { data: participants } = await service
        .from('matchup_participant')
        .select('id, user_id')
        .eq('matchup_id', matchupId) as {
          data: Array<{ id: string; user_id: string }> | null;
        };

      const myP  = participants?.find(p => p.user_id === appUser.id);
      const oppP = participants?.find(p => p.user_id !== appUser.id);

      if (myP || oppP) {
        const participantIds = [myP?.id, oppP?.id].filter(Boolean) as string[];
        const { data: picks } = await service
          .from('pick')
          .select('fixture_id, participant_id, side')
          .in('fixture_id', allIds)
          .in('participant_id', participantIds) as {
            data: Array<{ fixture_id: string; participant_id: string; side: string }> | null;
          };

        for (const fid of allIds) {
          const myPick  = picks?.find(p => p.fixture_id === fid && p.participant_id === myP?.id);
          const oppPick = picks?.find(p => p.fixture_id === fid && p.participant_id === oppP?.id);
          picksMap.set(fid, {
            myPickSide:       (myPick?.side  as 'HOME' | 'AWAY') ?? null,
            opponentPickSide: (oppPick?.side as 'HOME' | 'AWAY') ?? null,
          });
        }
      }
    }
  }

  const fmt = (f: { id: string; home_team: string; away_team: string; home_score: number | null; away_score: number | null; status: string; starts_at: string; round_id: string; group_name: string | null }) => ({
    id:               f.id,
    homeTeam:         f.home_team,
    awayTeam:         f.away_team,
    homeScore:        f.home_score,
    awayScore:        f.away_score,
    status:           f.status,
    startsAt:         f.starts_at,
    stage:            stageByRound.get(f.round_id) ?? 'GROUP',
    groupName:        f.group_name,
    isLocked:         true,
    myPickSide:       picksMap.get(f.id)?.myPickSide       ?? null,
    opponentPickSide: picksMap.get(f.id)?.opponentPickSide ?? null,
  });

  return NextResponse.json({
    ok: true,
    homeTeam,
    awayTeam,
    homeFixtures: homeFixtures.map(fmt),
    awayFixtures: awayFixtures.map(fmt),
  });
}
