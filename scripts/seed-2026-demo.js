/**
 * Seed real WC 2026 group stage fixtures + R32 halfway through.
 * Run: node scripts/seed-2026-demo.js
 */

const BASE = 'http://localhost:3000';

const ROUNDS = {
  GROUP:       '1865d84a-c2e6-403a-a927-edb4118e01c6',
  ROUND_OF_32: '48491026-2d04-41a3-a54a-ff7c3597e12e',
};

// ── Real WC 2026 Group Stage Fixtures ─────────────────────────────────────────
// Each entry: [home, away, group, matchday, date (UTC), venue, city, hs, as]
// Scores chosen to produce plausible standings (see GROUP_WINNERS below).

const GS = [
  // ─ Jun 11 ─
  ['Mexico',          'South Africa',            'A', 1, '2026-06-11T21:00:00Z', 'Estadio Azteca',          'Mexico City', 2, 0],
  ['Korea Republic',  'Czechia',                 'A', 1, '2026-06-12T00:00:00Z', 'Estadio Akron',           'Guadalajara', 1, 1],
  // ─ Jun 12 ─
  ['Canada',          'Bosnia and Herzegovina',  'B', 1, '2026-06-12T17:00:00Z', 'BMO Field',               'Toronto',     1, 1],
  ['USA',             'Paraguay',                'D', 1, '2026-06-12T20:00:00Z', 'SoFi Stadium',            'Los Angeles', 2, 0],
  // ─ Jun 13 ─
  ['Haiti',           'Scotland',                'C', 1, '2026-06-13T17:00:00Z', 'Gillette Stadium',        'Boston',      0, 2],
  ['Australia',       'Türkiye',                 'D', 1, '2026-06-13T20:00:00Z', 'BC Place',                'Vancouver',   0, 1],
  ['Brazil',          'Morocco',                 'C', 1, '2026-06-13T23:00:00Z', 'MetLife Stadium',         'New York',    3, 0],
  ['Qatar',           'Switzerland',             'B', 1, '2026-06-14T02:00:00Z', "Levi's Stadium",          'San Francisco', 0, 2],
  // ─ Jun 14 ─
  ["Côte d'Ivoire",   'Ecuador',                 'E', 1, '2026-06-14T17:00:00Z', 'Lincoln Financial Field', 'Philadelphia', 1, 1],
  ['Germany',         'Curaçao',                 'E', 1, '2026-06-14T20:00:00Z', 'NRG Stadium',             'Houston',     4, 0],
  ['Netherlands',     'Japan',                   'F', 1, '2026-06-14T23:00:00Z', "AT&T Stadium",            'Dallas',      2, 1],
  ['Sweden',          'Tunisia',                 'F', 1, '2026-06-15T02:00:00Z', 'Estadio BBVA',            'Monterrey',   1, 0],
  // ─ Jun 15 ─
  ['Saudi Arabia',    'Uruguay',                 'H', 1, '2026-06-15T17:00:00Z', 'Hard Rock Stadium',       'Miami',       0, 1],
  ['Spain',           'Cabo Verde',              'H', 1, '2026-06-15T20:00:00Z', 'Mercedes-Benz Stadium',   'Atlanta',     3, 0],
  ['IR Iran',         'New Zealand',             'G', 1, '2026-06-15T23:00:00Z', 'SoFi Stadium',            'Los Angeles', 1, 0],
  ['Belgium',         'Egypt',                   'G', 1, '2026-06-16T02:00:00Z', 'Lumen Field',             'Seattle',     2, 0],
  // ─ Jun 16 ─
  ['France',          'Senegal',                 'I', 1, '2026-06-16T17:00:00Z', 'MetLife Stadium',         'New York',    2, 1],
  ['Iraq',            'Norway',                  'I', 1, '2026-06-16T20:00:00Z', 'Gillette Stadium',        'Boston',      0, 1],
  ['Argentina',       'Algeria',                 'J', 1, '2026-06-16T23:00:00Z', 'Arrowhead Stadium',       'Kansas City', 2, 0],
  ['Austria',         'Jordan',                  'J', 1, '2026-06-17T02:00:00Z', "Levi's Stadium",          'San Francisco', 2, 0],
  // ─ Jun 17 ─
  ['Ghana',           'Panama',                  'L', 1, '2026-06-17T17:00:00Z', 'BMO Field',               'Toronto',     1, 0],
  ['England',         'Croatia',                 'L', 1, '2026-06-17T20:00:00Z', "AT&T Stadium",            'Dallas',      2, 0],
  ['Portugal',        'Congo DR',                'K', 1, '2026-06-17T23:00:00Z', 'NRG Stadium',             'Houston',     3, 0],
  ['Uzbekistan',      'Colombia',                'K', 1, '2026-06-18T02:00:00Z', 'Estadio Azteca',          'Mexico City', 0, 2],
  // ─ Jun 18 ─
  ['Czechia',         'South Africa',            'A', 2, '2026-06-18T17:00:00Z', 'Mercedes-Benz Stadium',   'Atlanta',     2, 0],
  ['Switzerland',     'Bosnia and Herzegovina',  'B', 2, '2026-06-18T20:00:00Z', 'SoFi Stadium',            'Los Angeles', 2, 0],
  ['Canada',          'Qatar',                   'B', 2, '2026-06-18T23:00:00Z', 'BC Place',                'Vancouver',   2, 0],
  ['Mexico',          'Korea Republic',          'A', 2, '2026-06-19T02:00:00Z', 'Estadio Akron',           'Guadalajara', 1, 0],
  // ─ Jun 19 ─
  ['Brazil',          'Haiti',                   'C', 2, '2026-06-19T17:00:00Z', 'Lincoln Financial Field', 'Philadelphia', 4, 0],
  ['Scotland',        'Morocco',                 'C', 2, '2026-06-19T20:00:00Z', 'Gillette Stadium',        'Boston',      1, 1],
  ['Türkiye',         'Paraguay',                'D', 2, '2026-06-19T23:00:00Z', "Levi's Stadium",          'San Francisco', 2, 0],
  ['USA',             'Australia',               'D', 2, '2026-06-20T02:00:00Z', 'Lumen Field',             'Seattle',     1, 0],
  // ─ Jun 20 ─
  ['Germany',         "Côte d'Ivoire",           'E', 2, '2026-06-20T17:00:00Z', 'BMO Field',               'Toronto',     2, 1],
  ['Ecuador',         'Curaçao',                 'E', 2, '2026-06-20T20:00:00Z', 'Arrowhead Stadium',       'Kansas City', 3, 0],
  ['Netherlands',     'Sweden',                  'F', 2, '2026-06-20T23:00:00Z', 'NRG Stadium',             'Houston',     2, 0],
  ['Tunisia',         'Japan',                   'F', 2, '2026-06-21T02:00:00Z', 'Estadio BBVA',            'Monterrey',   0, 2],
  // ─ Jun 21 ─
  ['Uruguay',         'Cabo Verde',              'H', 2, '2026-06-21T17:00:00Z', 'Hard Rock Stadium',       'Miami',       3, 0],
  ['Spain',           'Saudi Arabia',            'H', 2, '2026-06-21T20:00:00Z', 'Mercedes-Benz Stadium',   'Atlanta',     2, 0],
  ['Belgium',         'IR Iran',                 'G', 2, '2026-06-21T23:00:00Z', 'SoFi Stadium',            'Los Angeles', 2, 0],
  ['New Zealand',     'Egypt',                   'G', 2, '2026-06-22T02:00:00Z', 'BC Place',                'Vancouver',   0, 1],
  // ─ Jun 22 ─
  ['Norway',          'Senegal',                 'I', 2, '2026-06-22T17:00:00Z', 'MetLife Stadium',         'New York',    1, 1],
  ['France',          'Iraq',                    'I', 2, '2026-06-22T20:00:00Z', 'Lincoln Financial Field', 'Philadelphia', 3, 0],
  ['Argentina',       'Austria',                 'J', 2, '2026-06-22T23:00:00Z', "AT&T Stadium",            'Dallas',      1, 0],
  ['Jordan',          'Algeria',                 'J', 2, '2026-06-23T02:00:00Z', "Levi's Stadium",          'San Francisco', 0, 1],
  // ─ Jun 23 ─
  ['England',         'Ghana',                   'L', 2, '2026-06-23T17:00:00Z', 'Gillette Stadium',        'Boston',      2, 0],
  ['Panama',          'Croatia',                 'L', 2, '2026-06-23T20:00:00Z', 'BMO Field',               'Toronto',     0, 2],
  ['Portugal',        'Uzbekistan',              'K', 2, '2026-06-23T23:00:00Z', 'NRG Stadium',             'Houston',     4, 0],
  ['Colombia',        'Congo DR',                'K', 2, '2026-06-24T02:00:00Z', 'Estadio Akron',           'Guadalajara', 2, 0],
  // ─ Jun 24 (MD3 simultaneous pairs) ─
  ['Scotland',        'Brazil',                  'C', 3, '2026-06-24T17:00:00Z', 'Hard Rock Stadium',       'Miami',       0, 2],
  ['Morocco',         'Haiti',                   'C', 3, '2026-06-24T17:00:00Z', 'Mercedes-Benz Stadium',   'Atlanta',     2, 0],
  ['Switzerland',     'Canada',                  'B', 3, '2026-06-24T20:00:00Z', 'BC Place',                'Vancouver',   1, 1],
  ['Bosnia and Herzegovina', 'Qatar',            'B', 3, '2026-06-24T20:00:00Z', 'Lumen Field',             'Seattle',     2, 0],
  ['Czechia',         'Mexico',                  'A', 3, '2026-06-24T23:00:00Z', 'Estadio Azteca',          'Mexico City', 0, 2],
  ['South Africa',    'Korea Republic',          'A', 3, '2026-06-24T23:00:00Z', 'Estadio BBVA',            'Monterrey',   1, 2],
  // ─ Jun 25 ─
  ['Curaçao',         "Côte d'Ivoire",           'E', 3, '2026-06-25T17:00:00Z', 'Lincoln Financial Field', 'Philadelphia', 0, 2],
  ['Ecuador',         'Germany',                 'E', 3, '2026-06-25T17:00:00Z', 'MetLife Stadium',         'New York',    1, 2],
  ['Japan',           'Sweden',                  'F', 3, '2026-06-25T20:00:00Z', "AT&T Stadium",            'Dallas',      2, 1],
  ['Tunisia',         'Netherlands',             'F', 3, '2026-06-25T20:00:00Z', 'Arrowhead Stadium',       'Kansas City', 0, 3],
  ['Türkiye',         'USA',                     'D', 3, '2026-06-25T23:00:00Z', 'SoFi Stadium',            'Los Angeles', 1, 2],
  ['Paraguay',        'Australia',               'D', 3, '2026-06-25T23:00:00Z', "Levi's Stadium",          'San Francisco', 1, 1],
  // ─ Jun 26 ─
  ['Norway',          'France',                  'I', 3, '2026-06-26T17:00:00Z', 'Gillette Stadium',        'Boston',      1, 2],
  ['Senegal',         'Iraq',                    'I', 3, '2026-06-26T17:00:00Z', 'BMO Field',               'Toronto',     2, 0],
  ['Egypt',           'IR Iran',                 'G', 3, '2026-06-26T20:00:00Z', 'Lumen Field',             'Seattle',     1, 1],
  ['New Zealand',     'Belgium',                 'G', 3, '2026-06-26T20:00:00Z', 'BC Place',                'Vancouver',   0, 2],
  ['Cabo Verde',      'Saudi Arabia',            'H', 3, '2026-06-26T23:00:00Z', 'NRG Stadium',             'Houston',     1, 1],
  ['Uruguay',         'Spain',                   'H', 3, '2026-06-26T23:00:00Z', 'Estadio Akron',           'Guadalajara', 1, 2],
  // ─ Jun 27 ─
  ['Panama',          'England',                 'L', 3, '2026-06-27T17:00:00Z', 'MetLife Stadium',         'New York',    0, 2],
  ['Croatia',         'Ghana',                   'L', 3, '2026-06-27T17:00:00Z', 'Lincoln Financial Field', 'Philadelphia', 2, 1],
  ['Algeria',         'Austria',                 'J', 3, '2026-06-27T20:00:00Z', 'Arrowhead Stadium',       'Kansas City', 0, 1],
  ['Jordan',          'Argentina',               'J', 3, '2026-06-27T20:00:00Z', "AT&T Stadium",            'Dallas',      0, 3],
  ['Colombia',        'Portugal',                'K', 3, '2026-06-27T23:00:00Z', 'Hard Rock Stadium',       'Miami',       1, 2],
  ['Congo DR',        'Uzbekistan',              'K', 3, '2026-06-27T23:00:00Z', 'Mercedes-Benz Stadium',   'Atlanta',     1, 0],
];

// ── R32 Fixtures ──────────────────────────────────────────────────────────────
// First 8 FINAL, last 8 SCHEDULED (Brian picks these)
// Standings from GS above:
//   A: Mexico, Korea Republic   B: Switzerland, Canada
//   C: Brazil, Morocco          D: USA, Türkiye
//   E: Germany, Ecuador         F: Netherlands, Japan
//   G: Belgium, Egypt           H: Spain, Uruguay
//   I: France, Norway           J: Argentina, Austria
//   K: Portugal, Colombia       L: England, Croatia
// Best 3rd: Scotland(C), Bosnia(B), Australia(D), Côte d'Ivoire(E),
//           Senegal(I), IR Iran(G), Saudi Arabia(H), Algeria(J)

const R32 = [
  // FINAL (8) — Jun 28-30
  ['Brazil',       'Bosnia and Herzegovina', '2026-06-28T18:00:00Z', 'MetLife Stadium',         'New York',    2, 0, 'FINAL'],
  ['Germany',      'Scotland',               '2026-06-28T21:00:00Z', 'NRG Stadium',             'Houston',     3, 0, 'FINAL'],
  ['France',       'Algeria',                '2026-06-29T18:00:00Z', "AT&T Stadium",            'Dallas',      2, 0, 'FINAL'],
  ['Argentina',    'Saudi Arabia',           '2026-06-29T21:00:00Z', 'Hard Rock Stadium',       'Miami',       3, 1, 'FINAL'],
  ['Spain',        'Australia',              '2026-06-30T18:00:00Z', 'Lumen Field',             'Seattle',     2, 1, 'FINAL'],
  ['England',      "Côte d'Ivoire",          '2026-06-30T21:00:00Z', 'Gillette Stadium',        'Boston',      1, 0, 'FINAL'],
  ['Portugal',     'IR Iran',                '2026-07-01T18:00:00Z', 'SoFi Stadium',            'Los Angeles', 3, 0, 'FINAL'],
  ['Netherlands',  'Senegal',                '2026-07-01T21:00:00Z', 'Mercedes-Benz Stadium',   'Atlanta',     2, 0, 'FINAL'],
  // SCHEDULED (8) — Jul 2-3 — Brian picks these
  ['USA',          'Morocco',                '2026-07-02T18:00:00Z', 'Arrowhead Stadium',       'Kansas City', null, null, 'SCHEDULED'],
  ['Belgium',      'Korea Republic',         '2026-07-02T21:00:00Z', 'Estadio Azteca',          'Mexico City', null, null, 'SCHEDULED'],
  ['Norway',       'Ecuador',                '2026-07-03T18:00:00Z', 'BC Place',                'Vancouver',   null, null, 'SCHEDULED'],
  ['Austria',      'Colombia',               '2026-07-03T21:00:00Z', "Levi's Stadium",          'San Francisco', null, null, 'SCHEDULED'],
  ['Mexico',       'Bosnia and Herzegovina', '2026-07-04T18:00:00Z', 'Estadio BBVA',            'Monterrey',   null, null, 'SCHEDULED'],
  ['Uruguay',      'Japan',                  '2026-07-04T21:00:00Z', 'Lincoln Financial Field', 'Philadelphia', null, null, 'SCHEDULED'],
  ['Canada',       'Croatia',                '2026-07-05T18:00:00Z', 'BMO Field',               'Toronto',     null, null, 'SCHEDULED'],
  ['Egypt',        'Türkiye',                '2026-07-05T21:00:00Z', 'Hard Rock Stadium',       'Miami',       null, null, 'SCHEDULED'],
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Clearing existing fixtures and resetting rounds…');
  // Reset via SQL (handled separately) — upsert by externalProviderId will overwrite

  const gsFixtures = GS.map(([home, away, group, md, date, venue, city, hs, as], i) => ({
    externalProviderId: `wc26-gs-${i + 1}`,
    roundId: ROUNDS.GROUP,
    homeTeam: home, awayTeam: away,
    groupName: group, matchday: md,
    startsAt: date, venue, city,
    homeScore: hs, awayScore: as,
    status: 'FINAL',
  }));

  const r32Fixtures = R32.map(([home, away, date, venue, city, hs, as, status], i) => ({
    externalProviderId: `wc26-r32-${i + 1}`,
    roundId: ROUNDS.ROUND_OF_32,
    homeTeam: home, awayTeam: away,
    groupName: null, matchday: null,
    startsAt: date, venue, city,
    homeScore: hs ?? null, awayScore: as ?? null,
    status,
  }));

  const all = [...gsFixtures, ...r32Fixtures];
  console.log(`Syncing ${gsFixtures.length} group stage + ${r32Fixtures.length} R32 fixtures…`);

  const res = await fetch(`${BASE}/api/admin/fixtures/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'MANUAL', dryRun: false, fixtures: all }),
  });
  const data = await res.json();
  if (!res.ok) { console.error('Sync failed:', data); process.exit(1); }
  console.log(`Sync: created=${data.createdCount ?? '?'} updated=${data.updatedCount ?? '?'}`);

  console.log('Running round transitions…');
  const tr = await fetch(`${BASE}/api/admin/rounds/transitions`, { method: 'POST' });
  const trData = await tr.json();
  console.log(`Completed rounds: ${trData.result?.completedRoundIds?.length ?? 0}`);
  console.log('\n✓ Done — Group Stage complete, R32 halfway through.');
  console.log('Now run: node scripts/seed-picks-demo.js');
}

main().catch(console.error);
