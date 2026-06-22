// Analysis: derive the Annex C third-place assignment from the candidate sets
// (FIFA Regulations §3) as a bipartite perfect matching, and compare against the
// generated table to (a) validate the 486 good rows and (b) see whether the 9
// bad rows have a unique solution we can trust.
//
// Usage: node scripts/solve-annexc.mjs

import { readFileSync } from 'node:fs';

// Read the generated table without a TS loader: extract the JSON object literal.
const annexSrc = readFileSync(new URL('../lib/domain/annexC.ts', import.meta.url), 'utf8');
const jsonStart = annexSrc.indexOf('= {', annexSrc.indexOf('ANNEX_C')) + 2;
const jsonEnd = annexSrc.lastIndexOf('}') + 1;
const ANNEX_C = JSON.parse(annexSrc.slice(jsonStart, jsonEnd));

// Candidate 3rd-place groups for each variable match (1X vs best 3rd of …).
const CANDIDATES = {
  M74: ['A', 'B', 'C', 'D', 'F'],
  M77: ['C', 'D', 'F', 'G', 'H'],
  M79: ['C', 'E', 'F', 'H', 'I'],
  M80: ['E', 'H', 'I', 'J', 'K'],
  M81: ['B', 'E', 'F', 'I', 'J'],
  M82: ['A', 'E', 'H', 'I', 'J'],
  M85: ['E', 'F', 'G', 'I', 'J'],
  M87: ['D', 'E', 'I', 'J', 'L'],
};
const MATCHES = Object.keys(CANDIDATES);

// All perfect matchings of the 8 qualifying groups onto the 8 match slots.
function solve(groups) {
  const solutions = [];
  const assign = {};
  const used = new Set();
  // Order matches by fewest available candidates first (faster, and stable).
  const order = [...MATCHES];
  function bt(i) {
    if (i === order.length) { solutions.push({ ...assign }); return; }
    const m = order[i];
    for (const g of CANDIDATES[m]) {
      if (!groups.includes(g) || used.has(g)) continue;
      used.add(g); assign[m] = g;
      bt(i + 1);
      used.delete(g); delete assign[m];
      if (solutions.length > 1) return; // we only care whether it's unique
    }
  }
  bt(0);
  return solutions;
}

let unique = 0, multi = 0, none = 0, mismatches = 0;
const badRowFixes = {};

for (const [key, tableRow] of Object.entries(ANNEX_C)) {
  const groups = key.split('');
  const sols = solve(groups);
  if (sols.length === 0) { none++; continue; }
  if (sols.length > 1) { multi++; }
  else unique++;

  // Validate table row (good rows = assigned set equals key).
  const assigned = MATCHES.map((m) => tableRow[m]);
  const tableValid = [...new Set(assigned)].sort().join('') === key;

  if (sols.length === 1) {
    const sol = sols[0];
    const matchesTable = MATCHES.every((m) => sol[m] === tableRow[m]);
    if (tableValid && !matchesTable) mismatches++;
    if (!tableValid) badRowFixes[key] = sol; // unique solution → confident fix
  }
}

console.log(`Rows: ${Object.keys(ANNEX_C).length}`);
console.log(`Unique matching: ${unique}, multiple: ${multi}, none: ${none}`);
console.log(`Good rows where solver disagrees with table: ${mismatches}`);
console.log(`\nBad rows with a UNIQUE solver solution (confident fixes): ${Object.keys(badRowFixes).length}`);
for (const [key, sol] of Object.entries(badRowFixes)) {
  console.log(`  ${key}: ${MATCHES.map((m) => `${m}=${sol[m]}`).join(' ')}`);
}
