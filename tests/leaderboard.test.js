// Leaderboard rules (Ticket-04 §3) + export command + soak smoke run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, validName, isoWithOffset, MAX_ENTRIES } from '../src/leaderboard.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(ROOT, '.tmp');
fs.mkdirSync(TMP, { recursive: true });
const e = (name, score, at, extra = {}) => ({ name, score, nights_won: 1, achieved_at: at, seed: 1, ...extra });

test('names: 3-12 of [A-Za-z0-9_], Vietnamese letters accepted (bonus)', () => {
  for (const ok of ['Mây', 'abc', 'A_1', 'x'.repeat(12), 'NguyễnGiang']) assert.ok(validName(ok), ok);
  for (const bad of ['ab', 'x'.repeat(13), 'a b', 'a-b', '', 'ab!', null]) assert.ok(!validName(bad), String(bad));
});

test('sort: score desc, ties -> earlier achieved_at first; keep top 10', () => {
  let lb = [];
  lb = addEntry(lb, e('late', 100, '2026-11-20T10:00:05+07:00'));
  lb = addEntry(lb, e('early', 100, '2026-11-20T10:00:01+07:00'));
  lb = addEntry(lb, e('best', 300, '2026-11-20T11:00:00+07:00'));
  assert.deepEqual(lb.map((x) => x.name), ['best', 'early', 'late']);
  for (let i = 0; i < 12; i++) lb = addEntry(lb, e('p' + String(i).padStart(2, '0'), 200 + i, '2026-11-20T12:00:00+07:00'));
  assert.equal(lb.length, MAX_ENTRIES);
  assert.equal(lb[0].name, 'best');
  assert.ok(!lb.some((x) => x.name === 'late'));
});

test('entry fields validated (nights_won 0-3, ISO time, integer seed)', () => {
  assert.throws(() => addEntry([], e('abc', 10, '2026-11-20T10:00:00+07:00', { nights_won: 4 })));
  assert.throws(() => addEntry([], e('abc', 10, 'yesterday')));
  assert.throws(() => addEntry([], e('abc', 10, '2026-11-20T10:00:00+07:00', { seed: 'x' })));
  assert.match(isoWithOffset(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
});

test('export: node server.js --export-leaderboard writes {"entries": [...]} in order from disk', () => {
  const store = path.join(TMP, 'lb-store.json');
  const entries = [e('bbb', 50, '2026-11-20T10:00:00+07:00'), e('aaa', 90, '2026-11-20T10:00:00+07:00')];
  fs.writeFileSync(store, JSON.stringify({ entries }));
  const out = path.join(TMP, 'lb-out.json');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server.js'), '--export-leaderboard', out], { env: { ...process.env, DDL_LEADERBOARD: store }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).entries.map((x) => x.name), ['aaa', 'bbb']);
});

test('soak: 3 nights in one process, no crash, report fields', () => {
  const out = path.join(TMP, 'soak-test.json');
  const r = spawnSync(process.execPath, ['--expose-gc', path.join(ROOT, 'scripts', 'soak.js'), '--seed', '7', '--nights', '3', '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(rep.nights, 3);
  assert.equal(rep.crashes, 0);
  assert.equal(rep.results.length, 3);
  for (const k of ['mem_start_mb', 'mem_end_mb', 'duration_s']) assert.equal(typeof rep[k], 'number');
});
