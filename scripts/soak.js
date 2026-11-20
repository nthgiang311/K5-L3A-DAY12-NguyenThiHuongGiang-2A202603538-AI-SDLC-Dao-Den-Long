#!/usr/bin/env node
// Soak test (Ticket-04): node --expose-gc scripts/soak.js --seed 7 --nights 10 --out soak.json
// Runs N nights back to back in ONE process (night 1 -> 2 -> 3 -> 1 ...), night i uses seed + i,
// seeded random input: new move direction every 30 ticks; per tick 5% jump, 3% dash, 2% pulse, 10% interact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim } from '../src/sim/sim.js';
import { mulberry32 } from '../src/sim/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const seed = parseInt(args.seed ?? '7', 10);
const nights = parseInt(args.nights ?? '10', 10);
const out = args.out;
if (!out || !Number.isInteger(seed) || !Number.isInteger(nights) || nights < 1) {
  process.stderr.write('usage: soak.js --seed <int> --nights <int> --out <file.json>\n');
  process.exit(1);
}
const tuning = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8')).tuning;
const rssMb = () => {
  if (global.gc) global.gc();
  return Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
};

const t0 = performance.now();
const results = [];
let crashes = 0, memStart = null;
for (let i = 0; i < nights; i++) {
  const night = (i % 3) + 1;
  const s = seed + i;
  try {
    let sim = createSim(tuning, { seed: s, night });
    if (i === 0) memStart = rssMb(); // after the first night is loaded
    const rng = mulberry32((s * 2654435761) >>> 0);
    const maxTicks = Math.round(tuning[`night${night}_duration_s`] * 60) + 10;
    let move = [0, 0];
    for (let k = 0; k < maxTicks && sim.state.state === 'playing'; k++) {
      if (k % 30 === 0) {
        const a = rng() * 2 * Math.PI;
        move = [Math.cos(a), Math.sin(a)];
      }
      sim.step({ move, cam_yaw_deg: 0, jump: rng() < 0.05, dash: rng() < 0.03, pulse: rng() < 0.02, interact: rng() < 0.1 });
    }
    results.push(sim.state.state === 'won' ? 'won' : 'lost');
    sim = null; // reset: drop the night
  } catch (e) {
    crashes++;
    results.push('crash');
    process.stderr.write(`night ${i + 1} crashed: ${e.stack}\n`);
  }
}
const memEnd = rssMb(); // after the last night was reset
const report = {
  nights,
  crashes,
  results,
  mem_start_mb: memStart,
  mem_end_mb: memEnd,
  duration_s: Math.round((performance.now() - t0) / 100) / 10,
  node: process.version,
  os: `${process.platform} ${process.arch}`,
};
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
process.exit(crashes === 0 ? 0 : 1);
