/**
 * Simulate picks for the demo matchup.
 * Run: node scripts/seed-picks-demo.js
 *
 * - Creates pick_order_assignments (alternating P1/P2 first picker per fixture)
 * - Creates picks for all FINAL fixtures (both participants)
 * - Leaves SCHEDULED fixtures with POA only — Brian picks those himself
 *
 * First picker wins ~70% of the time for realism.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MATCHUP_ID  = 'ef40bbda-fb9f-4ee0-9af0-955eec297478';
const P1_ID       = '5d97392c-ad3f-4435-92a5-43baaa03b7b0';  // Brian
const P2_ID       = 'cbbe402b-9834-41a2-b6ba-baf71433d94e';  // Demo opponent
const TOURNAMENT  = '3129a2d6-660b-44ef-9228-8375dd068ddd';

// Simple deterministic pseudo-random (seeded)
let _s = 7;
function rng() { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 0x100000000; }

async function main() {
  // 1. Load all rounds + fixtures for the tournament
  const { data: rounds } = await service
    .from('round').select('id, stage').eq('tournament_id', TOURNAMENT);
  const roundIds = rounds.map(r => r.id);
  const stageById = Object.fromEntries(rounds.map(r => [r.id, r.stage]));

  const { data: fixtures } = await service
    .from('fixture')
    .select('id, home_team, away_team, home_score, away_score, status, starts_at, round_id')
    .in('round_id', roundIds)
    .order('starts_at', { ascending: true });

  console.log(`Loaded ${fixtures.length} fixtures.`);

  // 2. Build pick_order_assignments (strict alternation across all fixtures)
  const poaRows = [];
  fixtures.forEach((f, i) => {
    poaRows.push({
      matchup_id:                   MATCHUP_ID,
      round_id:                     f.round_id,
      fixture_id:                   f.id,
      first_picker_participant_id:  i % 2 === 0 ? P1_ID : P2_ID,
    });
  });

  // Upsert POAs
  const { error: poaError } = await service
    .from('pick_order_assignment')
    .upsert(poaRows, { onConflict: 'matchup_id,fixture_id' });
  if (poaError) { console.error('POA error:', poaError.message); process.exit(1); }
  console.log(`Created ${poaRows.length} pick order assignments.`);

  // 3. Build picks for FINAL fixtures only
  const pickRows = [];
  const now = new Date().toISOString();

  for (const f of fixtures) {
    if (f.status !== 'FINAL') continue;

    const poa = poaRows.find(p => p.fixture_id === f.id);
    const firstId  = poa.first_picker_participant_id;
    const secondId = firstId === P1_ID ? P2_ID : P1_ID;

    const { hs, as } = { hs: f.home_score ?? 0, as: f.away_score ?? 0 };
    const winnerSide = hs > as ? 'HOME' : as > hs ? 'AWAY' : null; // null = draw

    // First picker: ~70% picks winner (or HOME on draw), ~30% picks loser
    let firstSide;
    if (!winnerSide) {
      firstSide = 'HOME'; // draw — assign home to first picker
    } else {
      firstSide = rng() < 0.70 ? winnerSide : (winnerSide === 'HOME' ? 'AWAY' : 'HOME');
    }
    const secondSide = firstSide === 'HOME' ? 'AWAY' : 'HOME';

    pickRows.push({
      matchup_id: MATCHUP_ID, round_id: f.round_id, fixture_id: f.id,
      participant_id: firstId,  side: firstSide,
      submitted_at: now, locked_at: now,
    });
    pickRows.push({
      matchup_id: MATCHUP_ID, round_id: f.round_id, fixture_id: f.id,
      participant_id: secondId, side: secondSide,
      submitted_at: now, locked_at: now,
    });
  }

  // Upsert picks in batches of 200
  for (let i = 0; i < pickRows.length; i += 200) {
    const batch = pickRows.slice(i, i + 200);
    const { error } = await service
      .from('pick')
      .upsert(batch, { onConflict: 'fixture_id,participant_id' });
    if (error) { console.error('Pick error:', error.message); process.exit(1); }
  }
  console.log(`Created ${pickRows.length} picks (${pickRows.length / 2} fixtures × 2 players).`);

  // 4. Quick tally
  const byParticipant = { [P1_ID]: { w: 0, l: 0, d: 0, pts: 0 }, [P2_ID]: { w: 0, l: 0, d: 0, pts: 0 } };
  const stagePoints = { GROUP: 1, ROUND_OF_32: 2, ROUND_OF_16: 4, QUARTERFINAL: 8, SEMIFINAL: 8, THIRD_PLACE: 16, FINAL: 32 };

  for (const f of fixtures) {
    if (f.status !== 'FINAL') continue;
    const hs = f.home_score ?? 0, as = f.away_score ?? 0;
    const winner = hs > as ? 'HOME' : as > hs ? 'AWAY' : null;
    const pts = stagePoints[stageById[f.round_id]] ?? 1;
    for (const pid of [P1_ID, P2_ID]) {
      const pick = pickRows.find(p => p.fixture_id === f.id && p.participant_id === pid);
      if (!pick) continue;
      if (!winner) { byParticipant[pid].d++; }
      else if (pick.side === winner) { byParticipant[pid].w++; byParticipant[pid].pts += pts; }
      else { byParticipant[pid].l++; }
    }
  }

  const p1 = byParticipant[P1_ID], p2 = byParticipant[P2_ID];
  console.log('\nSimulated results:');
  console.log(`  Brian (you):   ${p1.w}W ${p1.l}L ${p1.d}D — ${p1.pts} pts`);
  console.log(`  Demo opponent: ${p2.w}W ${p2.l}L ${p2.d}D — ${p2.pts} pts`);
  console.log('\n✓ Done. Run round transitions to calculate standings.');
}

main().catch(console.error);
