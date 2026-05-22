import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import { resolveTournamentId } from '@/lib/supabase/matchups';

/**
 * FIFA 2026 World Cup — Group Stage Round-Robin Fixtures
 *
 * Source: Official draw held December 5, 2025, at the Kennedy Center, Washington D.C.
 * Groups A–F confirmed. Groups G–L TBD.
 *
 *   A: Mexico (host), South Africa, South Korea, Czech Republic
 *   B: Canada (host), Bosnia and Herzegovina, Qatar, Switzerland
 *   C: Brazil, Morocco, Haiti, Scotland
 *   D: United States (host), Paraguay, Australia, Turkey
 *   E: Germany, Curaçao, Ivory Coast, Ecuador
 *   F: Netherlands, Japan, Sweden, TBD
 *
 * Kick-off times are estimated placeholders — FIFA has not published per-match
 * times yet. Opening match: Mexico on June 11 at Estadio Azteca.
 */

type Fixture = { homeTeam: string; awayTeam: string; startsAt: string };

// ── Group A ────────────────────────────────────────────────────────────────────
const GROUP_A: Fixture[] = [
  { homeTeam: 'Mexico',         awayTeam: 'South Africa',    startsAt: '2026-06-11T23:00:00Z' },
  { homeTeam: 'South Korea',    awayTeam: 'Czech Republic',  startsAt: '2026-06-12T20:00:00Z' },
  { homeTeam: 'Mexico',         awayTeam: 'Czech Republic',  startsAt: '2026-06-17T20:00:00Z' },
  { homeTeam: 'South Africa',   awayTeam: 'South Korea',     startsAt: '2026-06-17T23:00:00Z' },
  { homeTeam: 'Mexico',         awayTeam: 'South Korea',     startsAt: '2026-06-22T20:00:00Z' },
  { homeTeam: 'Czech Republic', awayTeam: 'South Africa',    startsAt: '2026-06-22T20:00:00Z' },
];

// ── Group B ────────────────────────────────────────────────────────────────────
const GROUP_B: Fixture[] = [
  { homeTeam: 'Canada',                 awayTeam: 'Bosnia and Herzegovina', startsAt: '2026-06-12T17:00:00Z' },
  { homeTeam: 'Qatar',                  awayTeam: 'Switzerland',            startsAt: '2026-06-12T23:00:00Z' },
  { homeTeam: 'Canada',                 awayTeam: 'Qatar',                  startsAt: '2026-06-17T17:00:00Z' },
  { homeTeam: 'Bosnia and Herzegovina', awayTeam: 'Switzerland',            startsAt: '2026-06-17T20:00:00Z' },
  { homeTeam: 'Canada',                 awayTeam: 'Switzerland',            startsAt: '2026-06-22T16:00:00Z' },
  { homeTeam: 'Bosnia and Herzegovina', awayTeam: 'Qatar',                  startsAt: '2026-06-22T16:00:00Z' },
];

// ── Group C ────────────────────────────────────────────────────────────────────
const GROUP_C: Fixture[] = [
  { homeTeam: 'Brazil',  awayTeam: 'Morocco',  startsAt: '2026-06-13T23:00:00Z' },
  { homeTeam: 'Haiti',   awayTeam: 'Scotland',  startsAt: '2026-06-13T20:00:00Z' },
  { homeTeam: 'Brazil',  awayTeam: 'Haiti',     startsAt: '2026-06-18T23:00:00Z' },
  { homeTeam: 'Morocco', awayTeam: 'Scotland',  startsAt: '2026-06-18T20:00:00Z' },
  { homeTeam: 'Brazil',  awayTeam: 'Scotland',  startsAt: '2026-06-23T20:00:00Z' },
  { homeTeam: 'Morocco', awayTeam: 'Haiti',     startsAt: '2026-06-23T20:00:00Z' },
];

// ── Group D ────────────────────────────────────────────────────────────────────
const GROUP_D: Fixture[] = [
  { homeTeam: 'United States', awayTeam: 'Paraguay',  startsAt: '2026-06-12T20:00:00Z' },
  { homeTeam: 'Australia',     awayTeam: 'Turkey',    startsAt: '2026-06-13T17:00:00Z' },
  { homeTeam: 'United States', awayTeam: 'Australia', startsAt: '2026-06-18T17:00:00Z' },
  { homeTeam: 'Paraguay',      awayTeam: 'Turkey',    startsAt: '2026-06-18T20:00:00Z' },
  { homeTeam: 'United States', awayTeam: 'Turkey',    startsAt: '2026-06-23T16:00:00Z' },
  { homeTeam: 'Paraguay',      awayTeam: 'Australia', startsAt: '2026-06-23T16:00:00Z' },
];

// ── Group E ────────────────────────────────────────────────────────────────────
const GROUP_E: Fixture[] = [
  { homeTeam: 'Germany',     awayTeam: 'Curaçao',     startsAt: '2026-06-14T17:00:00Z' },
  { homeTeam: 'Ivory Coast', awayTeam: 'Ecuador',     startsAt: '2026-06-14T20:00:00Z' },
  { homeTeam: 'Germany',     awayTeam: 'Ivory Coast', startsAt: '2026-06-19T20:00:00Z' },
  { homeTeam: 'Curaçao',     awayTeam: 'Ecuador',     startsAt: '2026-06-19T17:00:00Z' },
  { homeTeam: 'Germany',     awayTeam: 'Ecuador',     startsAt: '2026-06-24T20:00:00Z' },
  { homeTeam: 'Curaçao',     awayTeam: 'Ivory Coast', startsAt: '2026-06-24T20:00:00Z' },
];

// ── Group F (4th team TBD) ─────────────────────────────────────────────────────
const GROUP_F: Fixture[] = [
  { homeTeam: 'Netherlands', awayTeam: 'Japan',    startsAt: '2026-06-14T23:00:00Z' },
  { homeTeam: 'Sweden',      awayTeam: 'TBD',      startsAt: '2026-06-15T17:00:00Z' },
  { homeTeam: 'Netherlands', awayTeam: 'Sweden',   startsAt: '2026-06-19T23:00:00Z' },
  { homeTeam: 'Japan',       awayTeam: 'TBD',      startsAt: '2026-06-19T20:00:00Z' },
  { homeTeam: 'Netherlands', awayTeam: 'TBD',      startsAt: '2026-06-24T16:00:00Z' },
  { homeTeam: 'Japan',       awayTeam: 'Sweden',   startsAt: '2026-06-24T16:00:00Z' },
];

const ALL_FIXTURES: Fixture[] = [
  ...GROUP_A,
  ...GROUP_B,
  ...GROUP_C,
  ...GROUP_D,
  ...GROUP_E,
  ...GROUP_F,
];

/**
 * POST /api/admin/demo/fixtures
 *
 * Seeds confirmed Group Stage fixtures onto the active tournament.
 * Idempotent — uses upsert on (round_id, home_team, away_team, starts_at).
 * Creates the GROUP round if it does not yet exist.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await createServerSupabaseClient();
    const {
      data: { user }
    } = await auth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 });
    }

    const service = createServiceRoleClient();
    const tournamentId = await resolveTournamentId();

    // Find or create the GROUP stage round
    let roundId: string;

    const { data: existingRound } = await service
      .from('round')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('stage', 'GROUP')
      .maybeSingle();

    if (existingRound) {
      roundId = existingRound.id as string;
    } else {
      const { data: newRound, error: roundError } = await service
        .from('round')
        .insert({
          tournament_id: tournamentId,
          stage: 'GROUP',
          order_index: 1,
          starts_at: '2026-06-11T00:00:00Z',
          ends_at: '2026-07-02T23:59:59Z',
          is_complete: false
        })
        .select('id')
        .single();

      if (roundError || !newRound) throw new Error(`Failed to create round: ${roundError?.message}`);
      roundId = newRound.id as string;
    }

    const rows = ALL_FIXTURES.map((f) => ({
      round_id: roundId,
      home_team: f.homeTeam,
      away_team: f.awayTeam,
      starts_at: f.startsAt,
      status: 'SCHEDULED' as const
    }));

    const { error: fixtureError } = await service
      .from('fixture')
      .upsert(rows, { onConflict: 'round_id,home_team,away_team,starts_at' });

    if (fixtureError) throw new Error(`Failed to upsert fixtures: ${fixtureError.message}`);

    return NextResponse.json({
      ok: true,
      roundId,
      fixturesSeeded: rows.length,
      stage: 'GROUP',
      note: 'Groups A–F seeded. Groups G–L pending official draw confirmation.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fixture seed failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
