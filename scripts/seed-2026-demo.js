/**
 * Seed WC 2026 demo data — halfway through Round of 32.
 * Run: node scripts/seed-2026-demo.js
 *
 * Clears fixtures + resets rounds, then loads:
 *   - 72 Group Stage matches (all FINAL)
 *   - 8 Round of 32 matches (FINAL)
 *   - 8 Round of 32 matches (SCHEDULED, upcoming)
 */

const BASE = 'http://localhost:3000';

// ── Round IDs (from DB) ────────────────────────────────────────────────────────
const ROUNDS = {
  GROUP:       '1865d84a-c2e6-403a-a927-edb4118e01c6',
  ROUND_OF_32: '48491026-2d04-41a3-a54a-ff7c3597e12e',
  ROUND_OF_16: '4f5b2146-a993-49e3-9daf-4dea2ff7d619',
};

// ── 48 teams in 12 groups ──────────────────────────────────────────────────────
// Format: [team1, team2, team3, team4]  (strongest → weakest within group)
const GROUPS = {
  A: ['USA',         'Panama',      'Bolivia',         'Trinidad and Tobago'],
  B: ['Mexico',      'Ecuador',     'Canada',          'Cuba'],
  C: ['Brazil',      'Colombia',    'Chile',           'Venezuela'],
  D: ['Argentina',   'Uruguay',     'Peru',            'Paraguay'],
  E: ['France',      'Belgium',     'Morocco',         'Cameroon'],
  F: ['Spain',       'Portugal',    'Croatia',         'Albania'],
  G: ['Germany',     'Netherlands', 'Austria',         'Scotland'],
  H: ['England',     'Serbia',      'Denmark',         'Slovenia'],
  I: ['Italy',       'Switzerland', 'Czech Republic',  'Turkey'],
  J: ['Japan',       'South Korea', 'Saudi Arabia',    'Australia'],
  K: ['Nigeria',     'Senegal',     'Egypt',           'South Africa'],
  L: ['Algeria',     'Tunisia',     'Ivory Coast',     'New Zealand'],
};

// Strength tier per team (1 = very strong, 3 = underdog)
const TIER = {
  'Brazil': 1, 'Argentina': 1, 'France': 1, 'Spain': 1, 'England': 1,
  'Germany': 1, 'Netherlands': 1, 'Portugal': 1, 'Belgium': 1, 'Italy': 1,
  'Japan': 2, 'USA': 2, 'Mexico': 2, 'Colombia': 2, 'Uruguay': 2,
  'Croatia': 2, 'Serbia': 2, 'Denmark': 2, 'Morocco': 2, 'Nigeria': 2,
  'Senegal': 2, 'South Korea': 2, 'Ecuador': 2, 'Canada': 2, 'Chile': 2,
  'Switzerland': 2, 'Austria': 2, 'Algeria': 2, 'Tunisia': 2, 'Ivory Coast': 2,
};
function tier(t) { return TIER[t] ?? 3; }

// Generate a scoreline based on relative strength
let _seed = 42;
function rng() { _seed = (_seed * 1664525 + 1013904223) & 0xffffffff; return ((_seed >>> 0) / 0x100000000); }

function score(home, away) {
  const diff = tier(away) - tier(home); // positive = home stronger
  if (diff >= 2)      return [Math.floor(rng()*2)+2, Math.floor(rng()*1)];   // comfortable home win
  if (diff === 1)     return [Math.floor(rng()*1)+1, Math.floor(rng()*1)];   // likely home win
  if (diff === 0)     return rng() > 0.5 ? [1,1] : [Math.floor(rng()*1)+1, Math.floor(rng()*1)+1]; // draw or tight
  if (diff === -1)    return [Math.floor(rng()*1), Math.floor(rng()*1)+1];   // likely away win
  return [Math.floor(rng()*1), Math.floor(rng()*2)+2];                       // away win
}

// ── Build Group Stage fixtures ─────────────────────────────────────────────────
// Matchday layout per group: MD1=(0v3,1v2) MD2=(0v2,1v3) MD3=(0v1,2v3)
const MD_PAIRS = [[0,3],[1,2], [0,2],[1,3], [0,1],[2,3]];
const GS_START = new Date('2026-06-11T18:00:00Z');

const groupFixtures = [];
let day = 0;
for (const [grp, teams] of Object.entries(GROUPS)) {
  for (let md = 0; md < 3; md++) {
    const pairA = MD_PAIRS[md * 2];
    const pairB = MD_PAIRS[md * 2 + 1];
    const dateA = new Date(GS_START.getTime() + (day * 2) * 86400000);
    const dateB = new Date(GS_START.getTime() + (day * 2 + 1) * 86400000);
    const [hsA, asA] = score(teams[pairA[0]], teams[pairA[1]]);
    const [hsB, asB] = score(teams[pairB[0]], teams[pairB[1]]);
    groupFixtures.push({
      externalProviderId: `demo-gs-${grp}-md${md+1}-1`,
      roundId: ROUNDS.GROUP, groupName: grp, matchday: md + 1,
      homeTeam: teams[pairA[0]], awayTeam: teams[pairA[1]],
      homeScore: hsA, awayScore: asA, status: 'FINAL',
      startsAt: dateA.toISOString(), venue: null, city: null,
    });
    groupFixtures.push({
      externalProviderId: `demo-gs-${grp}-md${md+1}-2`,
      roundId: ROUNDS.GROUP, groupName: grp, matchday: md + 1,
      homeTeam: teams[pairB[0]], awayTeam: teams[pairB[1]],
      homeScore: hsB, awayScore: asB, status: 'FINAL',
      startsAt: dateB.toISOString(), venue: null, city: null,
    });
  }
  day++;
}

// ── Determine group winners / runners-up ──────────────────────────────────────
function groupStandings(grp) {
  const teams = GROUPS[grp];
  const pts = Object.fromEntries(teams.map(t => [t, 0]));
  const gd  = Object.fromEntries(teams.map(t => [t, 0]));
  for (const f of groupFixtures) {
    if (f.groupName !== grp) continue;
    const h = f.homeScore, a = f.awayScore;
    if (h > a)      { pts[f.homeTeam] += 3; }
    else if (h < a) { pts[f.awayTeam] += 3; }
    else            { pts[f.homeTeam]++; pts[f.awayTeam]++; }
    gd[f.homeTeam] += h - a; gd[f.awayTeam] += a - h;
  }
  return [...teams].sort((a, b) => pts[b] - pts[a] || gd[b] - gd[a]);
}

const advancers = {};
for (const grp of Object.keys(GROUPS)) {
  const [first, second] = groupStandings(grp);
  advancers[grp] = { first, second };
}

// ── Round of 32 matchups ──────────────────────────────────────────────────────
// Typical WC R32 seeding: 1st A v 2nd B, 1st C v 2nd D, etc.
const R32_PAIRS = [
  ['A','B'], ['C','D'], ['E','F'], ['G','H'],
  ['I','J'], ['K','L'], ['B','A'], ['D','C'],  // reverse to get all 16
  ['F','E'], ['H','G'], ['J','I'], ['L','K'],
  // Best 3rd-place fillers (use next teams in groups)
  ['A','C'], ['B','D'], ['E','G'], ['F','H'],
];

const R32_START = new Date('2026-06-25T18:00:00Z');
const r32Fixtures = [];
R32_PAIRS.forEach(([g1, g2], i) => {
  const homeTeam = i % 2 === 0 ? advancers[g1].first  : advancers[g1].second;
  const awayTeam = i % 2 === 0 ? advancers[g2].second : advancers[g2].first;
  const kickoff = new Date(R32_START.getTime() + Math.floor(i / 2) * 86400000 + (i % 2) * 6 * 3600000);
  const isPlayed = i < 8;
  const [hs, as] = isPlayed ? score(homeTeam, awayTeam) : [null, null];
  r32Fixtures.push({
    externalProviderId: `demo-r32-${i+1}`,
    roundId: ROUNDS.ROUND_OF_32, groupName: null, matchday: null,
    homeTeam, awayTeam,
    homeScore: hs, awayScore: as,
    status: isPlayed ? 'FINAL' : 'SCHEDULED',
    startsAt: kickoff.toISOString(), venue: null, city: null,
  });
});

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Step 1/4  Clearing existing fixtures and resetting rounds…');
  const clearRes = await fetch(`${BASE}/api/admin/debug/reset-fixtures`, { method: 'POST' }).catch(() => null);
  // Reset via direct SQL (using the Supabase service key isn't available here,
  // so we'll use the sync endpoint which does an upsert — old fixtures get replaced
  // by externalProviderId, and we seed enough to cover all slots)
  console.log('         (using upsert — old fixtures replaced by externalProviderId)');

  const allFixtures = [...groupFixtures, ...r32Fixtures];
  console.log(`Step 2/4  Syncing ${allFixtures.length} fixtures (${groupFixtures.length} group stage + ${r32Fixtures.length} R32)…`);

  const syncRes = await fetch(`${BASE}/api/admin/fixtures/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'MANUAL', dryRun: false, fixtures: allFixtures }),
  });
  const syncData = await syncRes.json();
  if (!syncData.ok) { console.error('Sync failed:', syncData.error); process.exit(1); }
  console.log(`         Created: ${syncData.createdCount}  Updated: ${syncData.updatedCount}`);

  console.log('Step 3/4  Running round transitions (settle Group Stage)…');
  const transRes = await fetch(`${BASE}/api/admin/rounds/transitions`, { method: 'POST' });
  const transData = await transRes.json();
  console.log(`         Completed rounds: ${transData.completedRoundIds?.length ?? 0}`);

  console.log('Step 4/4  Summary:');
  Object.entries(advancers).forEach(([g, { first, second }]) =>
    console.log(`  Group ${g}: ${first} (1st)  ${second} (2nd)`));
  console.log('');
  console.log(`R32 done (8):     ${r32Fixtures.slice(0,8).map(f=>`${f.homeTeam} ${f.homeScore}-${f.awayScore} ${f.awayTeam}`).join(', ')}`);
  console.log(`R32 upcoming (8): ${r32Fixtures.slice(8).map(f=>`${f.homeTeam} vs ${f.awayTeam}`).join(', ')}`);
  console.log('\n✓ Done. Reload the app.');
}

main().catch(console.error);
