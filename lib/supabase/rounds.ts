import { createServiceRoleClient } from '@/lib/supabase/service';
import { isPickLocked } from '@/lib/domain/lock';

interface MatchupTournamentRow {
  id: string;
  tournament_id: string;
}

interface RoundRow {
  id: string;
  stage: string;
  order_index: number;
  starts_at: string | null;
  ends_at: string | null;
  is_complete: boolean;
  tournament_id: string;
}

interface FixtureRow {
  id: string;
  starts_at: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
}

interface ParticipantRow {
  id: string;
  user_id: string;
}

interface ExistingPickRow {
  fixture_id: string;
  side: 'HOME' | 'AWAY';
  submitted_at: string;
}

export async function resolveTournamentForUserContext(input: {
  matchupId?: string;
  appUserId: string;
  tournamentYear?: number;
}): Promise<string> {
  const service = createServiceRoleClient();

  if (input.matchupId) {
    const { data: membership, error: membershipError } = await service
      .from('matchup_participant')
      .select('id')
      .eq('matchup_id', input.matchupId)
      .eq('user_id', input.appUserId)
      .maybeSingle();

    if (membershipError) {
      throw new Error(`Failed to verify matchup membership: ${membershipError.message}`);
    }

    if (!membership) {
      throw new Error('You are not a participant in this matchup.');
    }

    const { data: matchup, error: matchupError } = await service
      .from('matchup')
      .select('id, tournament_id')
      .eq('id', input.matchupId)
      .maybeSingle<MatchupTournamentRow>();

    if (matchupError) {
      throw new Error(`Failed to resolve matchup tournament: ${matchupError.message}`);
    }

    if (!matchup) {
      throw new Error('Matchup not found.');
    }

    return matchup.tournament_id;
  }

  if (input.tournamentYear) {
    const { data: yearTournament, error: yearError } = await service
      .from('tournament')
      .select('id')
      .eq('year', input.tournamentYear)
      .maybeSingle<{ id: string }>();

    if (yearError) {
      throw new Error(`Failed to resolve tournament year: ${yearError.message}`);
    }

    if (!yearTournament) {
      throw new Error(`Tournament year ${input.tournamentYear} not found.`);
    }

    return yearTournament.id;
  }

  const { data: active, error: activeError } = await service
    .from('tournament')
    .select('id')
    .eq('is_active', true)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (activeError) {
    throw new Error(`Failed to resolve active tournament: ${activeError.message}`);
  }

  if (active) {
    return active.id;
  }

  const { data: latest, error: latestError } = await service
    .from('tournament')
    .select('id')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (latestError) {
    throw new Error(`Failed to resolve latest tournament: ${latestError.message}`);
  }

  if (!latest) {
    throw new Error('No tournament exists.');
  }

  return latest.id;
}

/**
 * Round context scoped to a specific matchup. A matchup only "participates" in
 * a round once it has pick-order assignments for it, so a matchup formed mid-
 * tournament participates from its starting round onward (e.g. Round of 32) and
 * not in the rounds that ran before it joined.
 *
 * `current` is the earliest participating round that isn't complete. Every round
 * is tagged with `participating` so the feed can show earlier rounds read-only.
 */
export async function getRoundContextForMatchup(input: {
  tournamentId: string;
  matchupId: string;
}) {
  const service = createServiceRoleClient();

  const { data: rounds, error } = await service
    .from('round')
    .select('id, stage, order_index, starts_at, ends_at, is_complete, tournament_id')
    .eq('tournament_id', input.tournamentId)
    .order('order_index', { ascending: true }) as {
    data: RoundRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to list rounds: ${error.message}`);
  }

  const { data: assignments, error: assignError } = await service
    .from('pick_order_assignment')
    .select('round_id')
    .eq('matchup_id', input.matchupId) as {
    data: Array<{ round_id: string }> | null;
    error: { message: string } | null;
  };

  if (assignError) {
    throw new Error(`Failed to load matchup pick order: ${assignError.message}`);
  }

  const participatingRoundIds = new Set((assignments ?? []).map((a) => a.round_id));

  const sorted = (rounds ?? []).map((round) => ({
    ...round,
    participating: participatingRoundIds.has(round.id),
  }));

  let current =
    sorted.find((round) => round.participating && !round.is_complete) ?? null;

  // No pick order yet (e.g. a solo matchup before the opponent joins): preview
  // the tournament's current round read-only so the feed isn't blank.
  if (!current && participatingRoundIds.size === 0) {
    current = sorted.find((round) => !round.is_complete) ?? null;
  }

  return { current, rounds: sorted };
}

export async function getCurrentRoundForTournament(tournamentId: string) {
  const service = createServiceRoleClient();
  const { data: rounds, error } = await service
    .from('round')
    .select('id, stage, order_index, starts_at, ends_at, is_complete, tournament_id')
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true }) as {
    data: RoundRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to list rounds: ${error.message}`);
  }

  const sorted = rounds ?? [];
  const current = sorted.find((round) => !round.is_complete) ?? null;

  return {
    current,
    rounds: sorted
  };
}

/**
 * Returns fixtures for a round without any pick data.
 * Used when no matchup is selected (browse-only mode).
 */
export async function getRoundFixtures(input: { roundId: string }) {
  const service = createServiceRoleClient();

  const { data: fixtures, error: fixtureError } = await service
    .from('fixture')
    .select('id, starts_at, home_team, away_team, home_score, away_score, home_pen_score, away_pen_score, status, elapsed_minute, period, last_synced_at, group_name, venue, city, matchday')
    .eq('round_id', input.roundId)
    .order('starts_at', { ascending: true }) as {
    data: FixtureRow[] | null;
    error: { message: string } | null;
  };

  if (fixtureError) {
    throw new Error(`Failed to list round fixtures: ${fixtureError.message}`);
  }

  const now = new Date();

  return {
    fixtures: (fixtures ?? []).map((fixture) => {
      const raw = fixture as unknown as Record<string, unknown>;
      return {
        id: fixture.id,
        startsAt: fixture.starts_at,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        homeScore: fixture.home_score,
        awayScore: fixture.away_score,
        homePenScore: raw.home_pen_score as number | null ?? null,
        awayPenScore: raw.away_pen_score as number | null ?? null,
        status: fixture.status,
        elapsedMinute: raw.elapsed_minute as number | null ?? null,
        period: raw.period as string | null ?? null,
        lastSyncedAt: raw.last_synced_at as string | null ?? null,
        isLocked: isPickLocked(fixture.starts_at, now),
        myPickSide: null,
        myPickSubmittedAt: null,
        opponentPickSide: null,
        groupName: raw.group_name as string | null ?? null,
        venue: raw.venue as string | null ?? null,
        city: raw.city as string | null ?? null,
        matchday: raw.matchday as number | null ?? null,
      };
    })
  };
}

export async function getRoundFixturesForUser(input: {
  roundId: string;
  matchupId: string;
  appUserId: string;
}) {
  const service = createServiceRoleClient();

  const { data: allParticipants, error: participantsError } = await service
    .from('matchup_participant')
    .select('id, user_id')
    .eq('matchup_id', input.matchupId) as {
    data: ParticipantRow[] | null;
    error: { message: string } | null;
  };

  if (participantsError) {
    throw new Error(`Failed to resolve matchup participants: ${participantsError.message}`);
  }

  const participant = (allParticipants ?? []).find((p) => p.user_id === input.appUserId) ?? null;

  if (!participant) {
    throw new Error('You are not a participant in this matchup.');
  }

  const opponent = (allParticipants ?? []).find((p) => p.user_id !== input.appUserId) ?? null;

  const { data: fixtures, error: fixtureError } = await service
    .from('fixture')
    .select('id, starts_at, home_team, away_team, home_score, away_score, home_pen_score, away_pen_score, status, elapsed_minute, period, last_synced_at, group_name, venue, city, matchday')
    .eq('round_id', input.roundId)
    .order('starts_at', { ascending: true }) as {
    data: FixtureRow[] | null;
    error: { message: string } | null;
  };

  if (fixtureError) {
    throw new Error(`Failed to list round fixtures: ${fixtureError.message}`);
  }

  const fixtureIds = (fixtures ?? []).map((fixture) => fixture.id);

  let picks: ExistingPickRow[] = [];

  if (fixtureIds.length > 0) {
    const { data: pickRows, error: pickError } = await service
      .from('pick')
      .select('fixture_id, side, submitted_at')
      .eq('matchup_id', input.matchupId)
      .eq('round_id', input.roundId)
      .eq('participant_id', participant.id)
      .in('fixture_id', fixtureIds) as {
      data: ExistingPickRow[] | null;
      error: { message: string } | null;
    };

    if (pickError) {
      throw new Error(`Failed to read existing picks: ${pickError.message}`);
    }

    picks = pickRows ?? [];
  }

  const pickByFixture = new Map(picks.map((pick) => [pick.fixture_id, pick]));

  let opponentPickByFixture = new Map<string, ExistingPickRow>();

  if (opponent && fixtureIds.length > 0) {
    const { data: opponentPickRows, error: opponentPickError } = await service
      .from('pick')
      .select('fixture_id, side, submitted_at')
      .eq('matchup_id', input.matchupId)
      .eq('round_id', input.roundId)
      .eq('participant_id', opponent.id)
      .in('fixture_id', fixtureIds) as {
      data: ExistingPickRow[] | null;
      error: { message: string } | null;
    };

    if (opponentPickError) {
      throw new Error(`Failed to read opponent picks: ${opponentPickError.message}`);
    }

    opponentPickByFixture = new Map(
      (opponentPickRows ?? []).map((pick) => [pick.fixture_id, pick])
    );
  }

  const now = new Date();

  return {
    fixtures: (fixtures ?? []).map((fixture) => {
      const existingPick = pickByFixture.get(fixture.id);
      const locked = isPickLocked(fixture.starts_at, now);
      const opponentPick = opponentPickByFixture.get(fixture.id);

      return {
        id: fixture.id,
        startsAt: fixture.starts_at,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        homeScore: fixture.home_score,
        awayScore: fixture.away_score,
        homePenScore: (fixture as unknown as Record<string, unknown>).home_pen_score as number | null ?? null,
        awayPenScore: (fixture as unknown as Record<string, unknown>).away_pen_score as number | null ?? null,
        status: fixture.status,
        elapsedMinute: (fixture as unknown as Record<string, unknown>).elapsed_minute as number | null ?? null,
        period: (fixture as unknown as Record<string, unknown>).period as string | null ?? null,
        lastSyncedAt: (fixture as unknown as Record<string, unknown>).last_synced_at as string | null ?? null,
        isLocked: locked,
        myPickSide: existingPick?.side ?? null,
        myPickSubmittedAt: existingPick?.submitted_at ?? null,
        opponentPickSide: opponentPick?.side ?? null,
        groupName: (fixture as unknown as Record<string, unknown>).group_name as string | null ?? null,
        venue: (fixture as unknown as Record<string, unknown>).venue as string | null ?? null,
        city: (fixture as unknown as Record<string, unknown>).city as string | null ?? null,
        matchday: (fixture as unknown as Record<string, unknown>).matchday as number | null ?? null,
      };
    })
  };
}
