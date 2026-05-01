#!/usr/bin/env node
// Produces a clean comparison table from the per-level k6 outputs
// written by scripts/perf-stress-ladder.sh.
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'perf/benchmarks-2026-05-01-final/ladder';
const LEVELS = [10, 20, 30, 50, 100, 150, 200];

function read(file) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
const num = (v) => typeof v === 'number' ? v : 0;

function row(j) {
  if (!j) return null;
  const m = j.metrics || {};
  const dur = m.http_req_duration || {};
  const reqs = m.http_reqs || {};
  const failed = m.http_req_failed || {};
  return {
    reqs:  num(reqs.count),
    rps:   num(reqs.rate),
    p50:   num(dur.med),
    p95:   num(dur['p(95)']),
    p99:   num(dur['p(99)']),
    max:   num(dur.max),
    errPct: num(failed.rate) * 100,
  };
}

function table(kind) {
  console.log(`\n=== ${kind.toUpperCase()} ===`);
  console.log('VUs   reqs    rps    p50    p95    p99    max    err%');
  console.log('-'.repeat(60));
  for (const L of LEVELS) {
    const r = row(read(`${kind}-${L}vu.json`));
    if (!r) { console.log(`${String(L).padStart(3)}   (missing)`); continue; }
    console.log(
      `${String(L).padStart(3)}   ` +
      `${String(r.reqs).padStart(5)}   ` +
      `${r.rps.toFixed(1).padStart(5)}   ` +
      `${r.p50.toFixed(0).padStart(4)}   ` +
      `${r.p95.toFixed(0).padStart(4)}   ` +
      `${r.p99.toFixed(0).padStart(4)}   ` +
      `${r.max.toFixed(0).padStart(4)}   ` +
      `${r.errPct.toFixed(2).padStart(5)}`
    );
  }
}

table('workday');
table('stampede');

// Verdict per level
console.log(`\nVerdict heuristic (workday only):`);
for (const L of LEVELS) {
  const r = row(read(`workday-${L}vu.json`));
  if (!r) { console.log(`  ${L} VU: missing`); continue; }
  const v =
    r.p95 < 300 && r.errPct < 1 ? 'smooth — comfortable' :
    r.p95 < 800 && r.errPct < 2 ? 'usable — noticeable but ok' :
    r.p95 < 2000 && r.errPct < 5 ? 'degraded — feels slow' :
    'broken — past the ceiling';
  console.log(`  ${String(L).padStart(3)} VU → p95=${r.p95.toFixed(0)}ms, err=${r.errPct.toFixed(2)}% → ${v}`);
}
