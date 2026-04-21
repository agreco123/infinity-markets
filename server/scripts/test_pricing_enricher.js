/**
 * Infinity Markets v2.6 - Pricing Enricher Test Harness
 *
 * Standalone. Extracts parsePriceRange, parsePsfRangeMid, safeNumA,
 * deriveBandsFromCompetition, and enrichAnalysisForDeliverables from
 * analysis.js and evaluates them in isolation (no express / npm deps).
 */

const fs   = require('fs');
const path = require('path');

const ANALYSIS_PATH = path.resolve(__dirname, '..', 'routes', 'analysis.js');
const src = fs.readFileSync(ANALYSIS_PATH, 'utf8');

// Extract parsePriceRange + parsePsfRangeMid (they are adjacent)
const ppStart = src.indexOf('function parsePriceRange(s)');
const psfEnd  = src.indexOf('function pctOfAsp', ppStart);
if (ppStart < 0 || psfEnd < 0) {
  console.error('FATAL: could not locate parsePriceRange/parsePsfRangeMid');
  process.exit(2);
}
const priceFnSrc = src.slice(ppStart, psfEnd);

// Extract safeNumA through enrichAnalysisForDeliverables (ends where parsePriceRange starts)
const safeStart   = src.indexOf('function safeNumA');
const enrichStart = src.indexOf('function enrichAnalysisForDeliverables');
const enrichEnd   = src.indexOf('function parsePriceRange', enrichStart);
if (enrichStart < 0 || enrichEnd < 0) {
  console.error('FATAL: could not locate enrichAnalysisForDeliverables');
  process.exit(2);
}
const helpersStart = safeStart >= 0 && safeStart < enrichStart ? safeStart : enrichStart;
const helperSrc    = src.slice(helpersStart, enrichEnd);

const bundle = `${priceFnSrc}\n${helperSrc}\nreturn { parsePriceRange, enrichAnalysisForDeliverables };`;
let parsePriceRange, enrichAnalysisForDeliverables;
try {
  const mod = (new Function(bundle))();
  parsePriceRange = mod.parsePriceRange;
  enrichAnalysisForDeliverables = mod.enrichAnalysisForDeliverables;
} catch (e) {
  console.error('FATAL: failed to eval extracted helpers:', e.message);
  process.exit(2);
}

let PASS = 0, FAIL = 0;
const results = [];

function assertEq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ label, ok, actual, expected });
  if (ok) PASS++; else FAIL++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`);
}

function assertRange(label, actual, lo, hi) {
  const ok = typeof actual === 'number' && actual >= lo && actual <= hi;
  results.push({ label, ok, actual, expected: `${lo}..${hi}` });
  if (ok) PASS++; else FAIL++;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`);
}

console.log('=== Harness 1: parsePriceRange ===');
assertEq('parse "$600-750K"',         parsePriceRange('$600-750K'),     { min: 600000, max: 750000 });
assertEq('parse "$800K-$1.5M"',       parsePriceRange('$800K-$1.5M'),   { min: 800000, max: 1500000 });
assertEq('parse "$450-550K"',         parsePriceRange('$450-550K'),     { min: 450000, max: 550000 });
assertEq('parse "$1.5M+" openEnded',  parsePriceRange('$1.5M+'),        { min: 1500000, max: null, openEnded: true });
assertEq('parse "$850K+" openEnded',  parsePriceRange('$850K+'),        { min: 850000,  max: null, openEnded: true });
assertEq('parse "$275K" no plus',     parsePriceRange('$275K'),         { min: 275000,  max: null, openEnded: false });
assertEq('parse empty -> null',       parsePriceRange(''),              null);
assertEq('parse null -> null',        parsePriceRange(null),            null);
assertEq('parse "TBD" -> null',       parsePriceRange('TBD'),           null);

console.log('\n=== Harness 2: targetHomePrice derivation ===');

const caseA = {
  pricing: {
    stratification: [
      { tier: 'Entry-Level',   priceRange: '$350-450K' },
      { tier: 'Move-Up',       priceRange: '$500-650K', recommended: true },
      { tier: 'Executive',     priceRange: '$700-850K' },
      { tier: 'Luxury',        priceRange: '$900K-$1.2M' },
      { tier: 'Ultra-Luxury',  priceRange: '$1.5M+' },
    ],
  },
};
enrichAnalysisForDeliverables(caseA, null, null);
const thpA = caseA.pricing.targetHomePrice;
assertEq('A: Low  = Entry-Level midpoint',   thpA && thpA.low,  400000);
assertEq('A: Mid  = recommended Move-Up',    thpA && thpA.mid,  575000);
assertEq('A: High = Executive (NOT Lux)',    thpA && thpA.high, 775000);
assertRange('A: High must not exceed $900K', thpA && thpA.high, 600000, 899999);

const caseB = {
  pricing: {
    stratification: [
      { tier: 'Entry-Level',  priceRange: '$300-400K' },
      { tier: 'Move-Up',      priceRange: '$450-600K', recommended: true },
      { tier: 'Luxury',       priceRange: '$900K-$1.1M' },
    ],
  },
};
enrichAnalysisForDeliverables(caseB, null, null);
const thpB = caseB.pricing.targetHomePrice;
assertRange('B: High < $900K (Luxury excluded)', thpB && thpB.high, 0, 899999);

const caseC = { pricing: {} };
enrichAnalysisForDeliverables(caseC, { medianHomeValue: 500000 }, null);
const thpC = caseC.pricing.targetHomePrice;
assertEq('C: housing fallback low  = mhv*0.85', thpC && thpC.low,  425000);
assertEq('C: housing fallback mid  = mhv*1.05', thpC && thpC.mid,  525000);
assertEq('C: housing fallback high = mhv*1.40', thpC && thpC.high, 700000);

const caseD = {
  pricing: {
    stratification: [
      { tier: 'Entry-Level',  priceRange: '$400-500K' },
      { tier: 'Move-Up',      priceRange: '$550-700K', recommended: true },
      { tier: 'Executive',    priceRange: '$750-900K' },
      { tier: 'Ultra-Luxury', priceRange: '$1.5M+' },
    ],
  },
};
enrichAnalysisForDeliverables(caseD, null, null);
const thpD = caseD.pricing.targetHomePrice;
assertEq('D: High = Executive midpoint (ignores $1.5M+)', thpD && thpD.high, 825000);

console.log(`\n${PASS} pass, ${FAIL} fail`);
if (FAIL === 0) {
  console.log('\nALL PASS');
  process.exit(0);
} else {
  for (const r of results.filter(r => !r.ok)) {
    console.log(`  FAIL: ${r.label}  actual=${JSON.stringify(r.actual)}  expected=${JSON.stringify(r.expected)}`);
  }
  console.log('\nFAILURES PRESENT');
  process.exit(1);
}
