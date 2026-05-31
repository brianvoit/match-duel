import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

export async function GET() {
  const service = createServiceRoleClient();

  const [
    { data: tournament },
    { data: rounds },
    { data: fixtures },
    { count: matchupCount },
    { count: participantCount },
  ] = await Promise.all([
    service.from('tournament').select('id, year, is_active').eq('is_active', true).maybeSingle(),
    service.from('round').select('id, stage, order_index, is_complete').order('order_index'),
    service.from('fixture').select('id, home_team, away_team, home_score, away_score, status, starts_at, round_id, last_synced_at'),
    service.from('matchup').select('*', { count: 'exact', head: true }),
    service.from('matchup_participant').select('*', { count: 'exact', head: true }),
  ]);

  const byStatus: Record<string, number> = {};
  const byRound: Record<string, number> = {};
  let lastSynced: string | null = null;

  for (const f of fixtures ?? []) {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    byRound[f.round_id] = (byRound[f.round_id] ?? 0) + 1;
    if (f.last_synced_at && (!lastSynced || f.last_synced_at > lastSynced)) lastSynced = f.last_synced_at;
  }

  const roundsWithCounts = (rounds ?? []).map(r => ({
    ...r,
    fixtureCount: byRound[r.id] ?? 0,
  }));

  const currentRound =
    roundsWithCounts.find(r => !r.is_complete && r.fixtureCount > 0) ??
    roundsWithCounts.find(r => !r.is_complete) ??
    null;

  // Live fixtures
  const liveFixtures = (fixtures ?? []).filter(f => f.status === 'LIVE');

  // Pick completion for upcoming fixtures in the current round (starting within 48h)
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const upcomingFixtureIds = (fixtures ?? [])
    .filter(f => f.status === 'SCHEDULED' && f.round_id === currentRound?.id
      && new Date(f.starts_at) <= in48h)
    .map(f => f.id);

  let pickCompletion: Array<{
    fixtureId: string; homeTeam: string; awayTeam: string; startsAt: string;
    totalPickers: number; submittedPicks: number;
  }> = [];

  if (upcomingFixtureIds.length > 0) {
    const [{ data: assignments }, { data: picks }] = await Promise.all([
      service.from('pick_order_assignment')
        .select('fixture_id, first_picker_participant_id')
        .in('fixture_id', upcomingFixtureIds),
      service.from('pick')
        .select('fixture_id, participant_id')
        .in('fixture_id', upcomingFixtureIds),
    ]);

    const pickedSet = new Set(
      (picks ?? []).map(p => `${p.fixture_id}:${p.participant_id}`)
    );
    const assignmentsByFixture = new Map<string, string[]>();
    for (const a of assignments ?? []) {
      const list = assignmentsByFixture.get(a.fixture_id) ?? [];
      list.push(a.first_picker_participant_id);
      assignmentsByFixture.set(a.fixture_id, list);
    }

    const upcomingFix = (fixtures ?? []).filter(f => upcomingFixtureIds.includes(f.id));
    pickCompletion = upcomingFix.map(f => {
      const pickers = assignmentsByFixture.get(f.id) ?? [];
      const submitted = pickers.filter(pid => pickedSet.has(`${f.id}:${pid}`)).length;
      return {
        fixtureId: f.id,
        homeTeam: f.home_team,
        awayTeam: f.away_team,
        startsAt: f.starts_at,
        totalPickers: pickers.length,
        submittedPicks: submitted,
      };
    }).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  return NextResponse.json({
    ok: true,
    tournament,
    currentRound,
    rounds: roundsWithCounts,
    fixtures: { total: (fixtures ?? []).length, byStatus },
    liveFixtures: liveFixtures.map(f => ({
      id: f.id, homeTeam: f.home_team, awayTeam: f.away_team,
      homeScore: f.home_score, awayScore: f.away_score,
      startsAt: f.starts_at,
    })),
    pickCompletion,
    matchups: matchupCount ?? 0,
    participants: participantCount ?? 0,
    lastSynced,
    season: parseInt(process.env.API_FOOTBALL_SEASON ?? '2026', 10),
  });
}
