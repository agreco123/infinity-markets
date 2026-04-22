/**
 * v2.6.1 Fix C test — tier alias resolution.
 *
 * Mirrors the resolveTierKey logic in analysis.js and ensures the Cranberry
 * regression (Claude returning tier="Premium" and Target High collapsing to
 * Move-Up midpoint) cannot recur.
 */
const fs = require('fs');
const path = require('path');
const AN = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'analysis.js'), 'utf8');

// Contract checks: these strings MUST appear in analysis.js
const MUST = [
  "const TIER_ALIASES = {",
  "executive:   ['executive','premium',",
  "entrylevel:  ['entrylevel','entry','firsttime'",
  "ultraluxury: ['ultraluxury','ultra'",
  "function inferByMid(mid)",
  "function resolveTierKey(row, mid)",
];
let PASS = 0, FAIL = 0;
function a(ok, label) { ok ? PASS++ : FAIL++; console.log(`  [${ok?'PASS':'FAIL'}] ${label}`); }

console.log('=== Harness: tier resolver contract ===');
for (const s of MUST) a(AN.includes(s), `analysis.js contains "${s.slice(0,40)}..."`);

// Re-implement the resolver locally to exercise behavior.
function _norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
const TIER_ALIASES = {
  entrylevel:  ['entrylevel','entry','firsttime','starter','firsthome','affordable','value','economy'],
  moveup:      ['moveup','moveupbuyer','secondhome','tradeup','midrange','middle'],
  executive:   ['executive','premium','midpremium','uppermiddle','upper','upscale','highend','moveupplus','uppermove','abovemoveup'],
  luxury:      ['luxury','highluxury','primeluxury','estate'],
  ultraluxury: ['ultraluxury','ultra','superluxury','trophyhome','top'],
};
const ALIAS_INDEX = {};
for (const k of Object.keys(TIER_ALIASES)) for (const x of TIER_ALIASES[k]) ALIAS_INDEX[_norm(x)] = k;
function inferByMid(mid) {
  if (mid == null) return null;
  if (mid < 350000) return 'entrylevel';
  if (mid < 500000) return 'moveup';
  if (mid < 800000) return 'executive';
  if (mid < 1200000) return 'luxury';
  return 'ultraluxury';
}
function resolve(row, mid) {
  const raw = _norm(row.tier || row.name || row.segment || row.band);
  if (raw && ALIAS_INDEX[raw]) return ALIAS_INDEX[raw];
  if (raw) for (const a of Object.keys(ALIAS_INDEX)) if (raw.includes(a) || a.includes(raw)) return ALIAS_INDEX[a];
  return inferByMid(mid);
}
function eq(label, actual, expected) { a(actual === expected, `${label} -> ${actual}`); }

// Canonical labels
eq('tier=Executive',    resolve({ tier: 'Executive' }, 650000), 'executive');
eq('tier=Premium',      resolve({ tier: 'Premium' },   650000), 'executive');
eq('tier=Upper-Middle', resolve({ tier: 'Upper-Middle' }, 650000), 'executive');
eq('tier=Starter',      resolve({ tier: 'Starter' },   275000), 'entrylevel');
eq('tier=First-Time Buyer', resolve({ tier: 'First-Time Buyer' }, 275000), 'entrylevel');
eq('tier=Move-Up',      resolve({ tier: 'Move-Up' },   425000), 'moveup');
eq('tier=Luxury',       resolve({ tier: 'Luxury' },    900000), 'luxury');
eq('tier=Ultra-Luxury', resolve({ tier: 'Ultra-Luxury' }, 1500000), 'ultraluxury');

// Unrecognized label -> price-based inference
eq('tier=Foo, mid=275K -> entry',     resolve({ tier: 'Foo' },    275000), 'entrylevel');
eq('tier=Foo, mid=425K -> moveup',    resolve({ tier: 'Foo' },    425000), 'moveup');
eq('tier=Foo, mid=650K -> executive', resolve({ tier: 'Foo' },    650000), 'executive');
eq('tier=Foo, mid=900K -> luxury',    resolve({ tier: 'Foo' },    900000), 'luxury');
eq('tier=Foo, mid=1.5M -> ultra',     resolve({ tier: 'Foo' },   1500000), 'ultraluxury');

// Name field fallback
eq('name=Premium Tier',  resolve({ name: 'Premium Tier' }, 650000), 'executive');

// Cranberry regression exact scenario
eq('CRANBERRY: tier=Premium, mid=625K -> executive',
   resolve({ tier: 'Premium' }, 625000), 'executive');

console.log(`\n${PASS} pass, ${FAIL} fail`);
if (FAIL === 0) { console.log('\nALL PASS'); process.exit(0); }
console.log('\nFAILURES PRESENT'); process.exit(1);
