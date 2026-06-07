import { getAuthenticatedUser } from '@/lib/supabase/get-user';
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/service';

/**
 * GET /api/notifications/summary
 *
 * Returns per-matchup pick counts for the current authenticated user.
 * Only counts fixtures where:
 *   - the user is the first-picker (they must act)
 *   - they haven't submitted a pick yet
 *   - the fixture hasn't kicked off (not locked)
 *
 * Response:
 * {
 *   ok: true,
 *   matchups: Array<{
 *     matchupId: string;
 *     opponentName: string | null;   // null when invite is pending (no opponent yet)
 *     opponentAvatarUrl: string | null;
 *     isPending: boolean;             // true when invite hasn't been accepted yet
 *     total: number;                  // all unpicked fixtures user must act on
 *     urgent: number;                 // kicking off within 24h
 *   }>
 * }
 */

const URGENT_HOURS = 24;

export async function GET() {
  const appUser = await getAuthenticatedUser();
  if (!appUser) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const service = createServiceRoleClient();

  // 1. Get all matchups the user is in
  const { data: participantRows, error: partError } = await service
    .from('matchup_participant')
    .select('id, matchup_id')
    .eq('user_id', appUser.id);

  if (partError) {
    return NextResponse.json({ ok: false, error: partError.message }, { status: 500 });
  }

  if (!participantRows || participantRows.length === 0) {
    return NextResponse.json({ ok: true, matchups: [] });
  }

  const matchupIds = participantRows.map((p) => p.matchup_id as string);

  // Build a map: matchupId → user's participant ID
  const userParticipantIdByMatchup = new Map<string, string>(
    participantRows.map((p) => [p.matchup_id as string, p.id as string])
  );

  // 2. Get opponent info for each matchup
  const { data: opponents } = await service
    .from('matchup_participant')
    .select(`
      matchup_id,
      app_user:user_id (
        display_name,
        email,
        avatar_url
      )
    `)
    .in('matchup_id', matchupIds)
    .neq('user_id', appUser.id);

  const opponentByMatchup = new Map<string, { name: string; avatarUrl: string | null }>();
  for (const row of opponents ?? []) {
    const u = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    if (u) {
      const fullName = (u.display_name as string | null) ?? (u.email as string) ?? 'Opponent';
      // Use just the first name for concise display
      const firstName = fullName.split(' ')[0];
      opponentByMatchup.set(row.matchup_id as string, {
        name: firstName,
        avatarUrl: (u.avatar_url as string | null) ?? null,
      });
    }
  }

  // 3. For each matchup, get the current (lowest incomplete) round via the matchup's tournament
  const { data: matchupRows } = await service
    .from('matchup')
    .select('id, tournament_id, status')
    .in('id', matchupIds)
    .eq('status', 'ACTIVE');

  const activMatchups = (matchupRows ?? []) as Array<{ id: string; tournament_id: string; status: string }>;
  if (activMatchups.length === 0) {
    return NextResponse.json({ ok: true, matchups: [] });
  }

  const tournamentIds = [...new Set(activMatchups.map((m) => m.tournament_id))];

  // Get current round per tournament (lowest order_index where is_complete = false)
  const { data: roundRows } = await service
    .from('round')
    .select('id, tournament_id, order_index')
    .in('tournament_id', tournamentIds)
    .eq('is_complete', false)
    .order('order_index', { ascending: true });

  // Map: tournamentId → current round id (first incomplete round)
  const currentRoundByTournament = new Map<string, string>();
  for (const r of roundRows ?? []) {
    if (!currentRoundByTournament.has(r.tournament_id as string)) {
      currentRoundByTournament.set(r.tournament_id as string, r.id as string);
    }
  }

  // 4. Get all fixtures for those rounds
  const roundIds = [...new Set(currentRoundByTournament.values())];
  if (roundIds.length === 0) {
    return NextResponse.json({ ok: true, matchups: [] });
  }

  const now = new Date();
  const urgentCutoff = new Date(now.getTime() + URGENT_HOURS * 60 * 60 * 1000);

  const { data: fixtureRows } = await service
    .from('fixture')
    .select('id, round_id, starts_at')
    .in('round_id', roundIds)
    .gt('starts_at', now.toISOString()); // only future (unlocked) fixtures

  const fixturesByRound = new Map<string, Array<{ id: string; starts_at: string }>>();
  for (const f of fixtureRows ?? []) {
    const list = fixturesByRound.get(f.round_id as string) ?? [];
    list.push({ id: f.id as string, starts_at: f.starts_at as string });
    fixturesByRound.set(f.round_id as string, list);
  }

  // 5. Build list of all fixture IDs that could be relevant
  const allFixtureIds = (fixtureRows ?? []).map((f) => f.id as string);
  if (allFixtureIds.length === 0) {
    return NextResponse.json({ ok: true, matchups: [] });
  }

  // 6. Get pick_order_assignments across all active matchups (filtering to user's participant IDs)
  const userParticipantIds = [...userParticipantIdByMatchup.values()];

  const { data: assignmentRows } = await service
    .from('pick_order_assignment')
    .select('fixture_id, matchup_id, first_picker_participant_id')
    .in('matchup_id', matchupIds)
    .in('fixture_id', allFixtureIds)
    .in('first_picker_participant_id', userParticipantIds);

  // Map: matchupId → Set of fixture IDs where user is first picker
  const firstPickerFixturesByMatchup = new Map<string, Set<string>>();
  for (const row of assignmentRows ?? []) {
    const mid = row.matchup_id as string;
    const fid = row.fixture_id as string;
    if (!firstPickerFixturesByMatchup.has(mid)) {
      firstPickerFixturesByMatchup.set(mid, new Set());
    }
    firstPickerFixturesByMatchup.get(mid)!.add(fid);
  }

  // 7. Get existing picks by this user across all relevant fixtures
  const { data: existingPickRows } = await service
    .from('pick')
    .select('fixture_id, participant_id, pick_side')
    .in('fixture_id', allFixtureIds)
    .in('participant_id', userParticipantIds);

  // Set of "fixture_id:participant_id" combos that have picks
  const pickedKeys = new Set<string>(
    (existingPickRows ?? [])
      .filter((p) => p.pick_side !== null)
      .map((p) => `${p.fixture_id}:${p.participant_id}`)
  );

  // 8. Assemble per-matchup counts
  const result = activMatchups
    .map((matchup) => {
      const tournamentId = matchup.tournament_id;
      const currentRoundId = currentRoundByTournament.get(tournamentId);
      if (!currentRoundId) return null;

      const fixtures = fixturesByRound.get(currentRoundId) ?? [];
      const userParticipantId = userParticipantIdByMatchup.get(matchup.id);
      if (!userParticipantId) return null;

      const firstPickerFixtures = firstPickerFixturesByMatchup.get(matchup.id) ?? new Set();

      let total = 0;
      let urgent = 0;

      for (const fixture of fixtures) {
        if (!firstPickerFixtures.has(fixture.id)) continue;
        const alreadyPicked = pickedKeys.has(`${fixture.id}:${userParticipantId}`);
        if (alreadyPicked) continue;

        total++;
        if (new Date(fixture.starts_at) <= urgentCutoff) {
          urgent++;
        }
      }

      const opponent = opponentByMatchup.get(matchup.id);
      // No opponent in the DB yet → invite is still pending
      const isPending = !opponent;

      return {
        matchupId: matchup.id,
        opponentName: opponent?.name ?? null,
        opponentAvatarUrl: opponent?.avatarUrl ?? null,
        isPending,
        total: isPending ? 0 : total,
        urgent: isPending ? 0 : urgent,
      };
    })
    .filter(
      (item): item is { matchupId: string; opponentName: string | null; opponentAvatarUrl: string | null; isPending: boolean; total: number; urgent: number } =>
        item !== null
    );

  return NextResponse.json({ ok: true, matchups: result });
}
