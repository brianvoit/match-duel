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
    service.from('fixture').select('status, round_id, last_synced_at'),
    service.from('matchup').select('*', { count: 'exact', head: true }),
    service.from('matchup_participant').select('*', { count: 'exact', head: true }),
  ]);

  const byStatus: Record<string, number> = {};
  const byRound: Record<string, number> = {};
  let lastSynced: string | null = null;

  for (const f of fixtures ?? []) {
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
    byRound[f.round_id] = (byRound[f.round_id] ?? 0) + 1;
    if (f.last_synced_at && (!lastSynced || f.last_synced_at > lastSynced)) {
      lastSynced = f.last_synced_at;
    }
  }

  const roundsWithCounts = (rounds ?? []).map(r => ({
    ...r,
    fixtureCount: byRound[r.id] ?? 0,
  }));

  const currentRound =
    roundsWithCounts.find(r => !r.is_complete && r.fixtureCount > 0) ??
    roundsWithCounts.find(r => !r.is_complete) ??
    null;

  return NextResponse.json({
    ok: true,
    tournament,
    currentRound,
    rounds: roundsWithCounts,
    fixtures: { total: (fixtures ?? []).length, byStatus },
    matchups: matchupCount ?? 0,
    participants: participantCount ?? 0,
    lastSynced,
    season: parseInt(process.env.API_FOOTBALL_SEASON ?? '2026', 10),
  });
}
