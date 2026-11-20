// End-to-end tests of the headless CLI (Test Contract v1.0): output format, exit codes, determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-'));
const SCN = path.join(ROOT, 'tests', 'scenarios');

function headless(args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'src', 'headless.js'), ...args], { encoding: 'utf8' });
  return r;
}
function runTo(name, args) {
  const out = path.join(TMP, name + '.jsonl');
  const r = headless([...args, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  const text = fs.readFileSync(out, 'utf8');
  return { text, lines: text.trim().split('\n').map((l) => JSON.parse(l)) };
}
function writeTmp(name, obj) {
  const f = path.join(TMP, name);
  fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return f;
}

test('output: snapshot at tick 0 and every N ticks, end line last', () => {
  const { lines } = runTo('basic', ['--seed', '3', '--night', '1', '--ticks', '25', '--snapshot-every', '10']);
  const snaps = lines.filter((l) => l.type === 'snapshot');
  assert.deepEqual(snaps.map((s) => s.tick), [0, 10, 20]);
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 25, state: 'playing', score: lines.at(-1).score });
  const s = snaps[1];
  for (const k of ['sim_tick', 'state', 'time_left_s', 'score', 'player', 'lanterns', 'shades', 'motes_active']) assert.ok(k in s, k);
  assert.equal(s.sim_tick, 10);
  assert.equal(s.time_left_s, 299.833);
});

test('default snapshot-every is 10', () => {
  const { lines } = runTo('def', ['--seed', '1', '--night', '1', '--ticks', '30']);
  assert.deepEqual(lines.filter((l) => l.type === 'snapshot').map((s) => s.tick), [0, 10, 20, 30]);
});

test('determinism: same seed + scenario + inputs -> identical output; other seed differs', () => {
  const args = ['--night', '1', '--ticks', '3000', '--inputs', path.join(SCN, 'win_run.inputs.json')];
  const a = runTo('d1', ['--seed', '42', ...args]).text;
  const b = runTo('d2', ['--seed', '42', ...args]).text;
  const c = runTo('d3', ['--seed', '43', ...args]).text;
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('game over stops early with exit 0, end.ticks = steps run', () => {
  const sc = writeTmp('lose.json', { random_motes: false, random_shades: false, player: { flames: 1 }, shades: [{ id: 'S1', pos: [0.5, 0, 0] }] });
  const { lines } = runTo('lose', ['--seed', '1', '--night', '1', '--ticks', '500', '--scenario', sc]);
  assert.deepEqual(lines.at(-2), { type: 'event', tick: 1, name: 'game_over', data: { result: 'lost', reason: 'no_flames' } });
  assert.deepEqual(lines.at(-1), { type: 'end', ticks: 1, state: 'lost', score: 0 });
});

test('coordinates rounded to 3 decimals', () => {
  const inp = writeTmp('diag.json', { frames: [{ tick: 0, move: [0.3, 0.7], cam_yaw_deg: 17 }] });
  const { lines } = runTo('round', ['--seed', '1', '--night', '1', '--ticks', '7', '--snapshot-every', '7', '--inputs', inp]);
  for (const v of lines[1].player.pos) assert.equal(v, Math.round(v * 1000) / 1000);
});

test('exit code 2 on malformed inputs/scenario', () => {
  const cases = [
    writeTmp('bad1.json', '{ not json'),
    writeTmp('bad2.json', { frames: [{ tick: 5 }, { tick: 5 }] }),
    writeTmp('bad3.json', { frames: [{ tick: 0, move: [0] }] }),
    writeTmp('bad4.json', { frames: [{ tick: 0, jump: 1 }] }),
    writeTmp('bad5.json', { nope: [] }),
  ];
  for (const f of cases) {
    const r = headless(['--seed', '1', '--night', '1', '--ticks', '10', '--out', path.join(TMP, 'x.jsonl'), '--inputs', f]);
    assert.equal(r.status, 2, f);
    assert.ok(r.stderr.length > 0);
  }
  const badSc = writeTmp('badsc.json', { shades: [{ pos: [1, 2] }] });
  const r = headless(['--seed', '1', '--night', '1', '--ticks', '10', '--out', path.join(TMP, 'x.jsonl'), '--scenario', badSc]);
  assert.equal(r.status, 2);
});

test('other errors -> non-zero exit (not 2) with stderr message', () => {
  const r = headless(['--seed', '1', '--night', '1', '--out', path.join(TMP, 'x.jsonl')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ticks/);
});

test('scenario from contract example builds without events or score', () => {
  const { lines } = runTo('example', ['--seed', '1', '--night', '1', '--ticks', '0', '--scenario', path.join(SCN, 'contract_example.scenario.json')]);
  const s = lines[0];
  assert.equal(s.score, 0);
  assert.equal(s.motes_active, 1);
  assert.deepEqual(s.shades.map((x) => x.id), ['S1']);
  assert.equal(lines.length, 2);
});

test('scripted full run of the default level reaches won', () => {
  const { lines } = runTo('win', ['--seed', '42', '--night', '1', '--ticks', '18000', '--inputs', path.join(SCN, 'win_run.inputs.json'), '--scenario', path.join(SCN, 'win_run.scenario.json')]);
  assert.equal(lines.at(-1).state, 'won');
  assert.equal(lines.filter((l) => l.name === 'lantern_lit').length, 5);
});
