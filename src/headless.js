#!/usr/bin/env node
// Headless runner - Test Contract v1.1
// node src/headless.js --seed <int> --night 1|2|3 [--scenario f.json] [--inputs f.json]
//                      --ticks <int> --out <file.jsonl> [--snapshot-every <int, default 10>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSim } from './sim/sim.js';
import { FormatError, validateInputs, validateScenario, makeInputReader } from './sim/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class UsageError extends Error {}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) throw new UsageError(`unexpected argument: ${k}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`missing value for ${k}`);
    a[k.slice(2)] = v;
    i++;
  }
  const int = (name, required, def) => {
    if (a[name] === undefined) {
      if (required) throw new UsageError(`missing --${name}`);
      return def;
    }
    if (!/^-?\d+$/.test(a[name])) throw new UsageError(`--${name} must be an integer`);
    return parseInt(a[name], 10);
  };
  const opts = {
    seed: int('seed', true),
    night: int('night', true),
    ticks: int('ticks', true),
    every: int('snapshot-every', false, 10),
    out: a.out,
    scenario: a.scenario,
    inputs: a.inputs,
  };
  if (!opts.out) throw new UsageError('missing --out');
  if (![1, 2, 3].includes(opts.night)) throw new UsageError(`unsupported --night ${opts.night} (1, 2 or 3)`);
  if (opts.ticks < 0) throw new UsageError('--ticks must be >= 0');
  if (opts.every < 1) throw new UsageError('--snapshot-every must be >= 1');
  return opts;
}

function readJson(file, validate) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(`cannot read ${file}: ${e.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new FormatError(`${file}: invalid JSON (${e.message})`);
  }
  return validate(doc);
}

export function runHeadless(opts, tuning) {
  const scenario = opts.scenario ? readJson(opts.scenario, validateScenario) : null;
  const inputs = opts.inputs ? readJson(opts.inputs, validateInputs) : null;
  if (scenario && scenario.lanterns) {
    for (const l of scenario.lanterns) {
      if (!/^L[1-7]$/.test(l.id)) process.stderr.write(`warning: scenario lantern id ${l.id} not in level, ignored\n`);
    }
  }
  const sim = createSim(tuning, { seed: opts.seed, scenario, night: opts.night });
  const inputAt = makeInputReader(inputs);
  const lines = [JSON.stringify(sim.snapshot())];
  lines.push(JSON.stringify({ type: 'event', tick: 0, name: 'night_start', data: { night: opts.night } }));
  const running = () => sim.state.state === 'playing' || sim.state.state === 'paused';
  let k = 0;
  for (; k < opts.ticks && running(); k++) {
    const events = sim.step(inputAt(k));
    for (const e of events) lines.push(JSON.stringify({ type: 'event', tick: k + 1, name: e.name, data: e.data }));
    if ((k + 1) % opts.every === 0) lines.push(JSON.stringify(sim.snapshot()));
  }
  lines.push(JSON.stringify({ type: 'end', ticks: k, state: sim.state.state, score: sim.state.score }));
  fs.writeFileSync(opts.out, lines.join('\n') + '\n');
  return { ticks: k, state: sim.state.state, score: sim.state.score };
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.contract.json'), 'utf8'));
    runHeadless(opts, contract.tuning);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exit(e instanceof FormatError ? 2 : 1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
