// Unit tests for the game logic, one block per acceptance criterion (see docs/notes/phase-1.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSim, WORLD } from '../src/sim/sim.js';
import { makeInputReader } from '../src/sim/validate.js';

const contract = JSON.parse(fs.readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const T = contract.tuning;
const EMPTY = { random_motes: false, random_shades: false, motes: [], shades: [] };

// run n steps with a constant (or per-tick function) input; collect events with tick numbers
function run(sim, n, input = {}) {
  const events = [];
  for (let k = 0; k < n && sim.state.state === 'playing'; k++) {
    const inp = typeof input === 'function' ? input(k) : input;
    for (const e of sim.step(inp)) events.push({ tick: sim.state.steps, ...e });
  }
  return events;
}
const press = (key, atTick) => (k) => ({ [key]: k === atTick });

test('contract file: version, commands and all tuning keys present', () => {
  assert.equal(contract.contract_version, '1.0');
  for (const k of ['team', 'build_cmd', 'run_cmd', 'headless_cmd']) assert.ok(contract[k]);
  for (const k of ['player_speed', 'carry_capacity', 'lantern_cost', 'pickup_radius', 'interact_radius', 'pulse_cost',
    'pulse_radius', 'night1_duration_s', 'flames', 'invuln_s', 'hit_drop_ratio', 'pulse_stun_s', 'pulse_push_m',
    'pulse_cooldown_s', 'safe_radius', 'shade_speed', 'shade_hit_radius', 'fall_enabled']) assert.ok(k in T, k);
  assert.equal(T.lantern_count_night1, 5);
});

test('initial state: player at origin, 5 lanterns, L1 at (0,0,25), time = night duration', () => {
  const snap = createSim(T, { seed: 1 }).snapshot();
  assert.deepEqual(snap.player.pos, [0, 0, 0]);
  assert.equal(snap.player.flames, T.flames);
  assert.equal(snap.lanterns.length, 5);
  assert.deepEqual(snap.lanterns[0].pos, [0, 0, 25]);
  assert.equal(snap.time_left_s, T.night1_duration_s);
  assert.equal(snap.motes_active, WORLD.initial_motes);
  assert.equal(snap.shades.length, WORLD.initial_shades);
  assert.equal(snap.tick, 0);
});

test('movement: player_speed m/s along +Z, normalized diagonal, camera yaw rotation', () => {
  let sim = createSim(T, { scenario: EMPTY });
  run(sim, 60, { move: [0, 1] });
  assert.ok(Math.abs(sim.snapshot().player.pos[2] - T.player_speed) < 1e-6);

  sim = createSim(T, { scenario: EMPTY });
  run(sim, 60, { move: [1, 1] }); // length sqrt2 -> normalized
  const p = sim.snapshot().player.pos;
  assert.ok(Math.abs(Math.hypot(p[0], p[2]) - T.player_speed) < 1e-3);

  sim = createSim(T, { scenario: EMPTY });
  run(sim, 60, { move: [0, 1], cam_yaw_deg: 90 }); // x' = z*sin90 = +X
  const q = sim.snapshot().player.pos;
  assert.ok(Math.abs(q[0] - T.player_speed) < 1e-6 && Math.abs(q[2]) < 1e-6);

  sim = createSim(T, { scenario: EMPTY });
  run(sim, 60, { move: [1, 0], cam_yaw_deg: 90 }); // z' = -x*sin90 = -Z
  assert.ok(Math.abs(sim.snapshot().player.pos[2] + T.player_speed) < 1e-6);
});

test('island edge: fall disabled, player clamped to island radius', () => {
  const sim = createSim(T, { scenario: EMPTY });
  run(sim, 60 * 20, { move: [0, 1] });
  assert.ok(Math.abs(sim.snapshot().player.pos[2] - WORLD.island_radius) < 1e-6);
  assert.equal(sim.state.state, 'playing');
});

test('jump: rises above ground then lands, only on rising edge', () => {
  const sim = createSim(T, { scenario: EMPTY });
  run(sim, 10, press('jump', 0));
  assert.ok(sim.state.player.y > 0);
  run(sim, 120, { jump: true }); // held -> no re-jump after landing
  assert.equal(sim.state.player.y, 0);
});

test('pickup: within pickup_radius picks (score += per_mote), outside does not', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, motes: [[T.pickup_radius, 0, 0], [T.pickup_radius + 0.01, 0, 0]] } });
  const ev = run(sim, 1);
  assert.deepEqual(ev.map((e) => e.name), ['mote_picked']);
  assert.equal(ev[0].tick, 1);
  assert.deepEqual(ev[0].data, { carried: 1 });
  assert.equal(sim.snapshot().motes_active, 1);
  assert.equal(sim.state.score, T.score.per_mote);
});

test('carry_capacity: cannot pick when full', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, player: { carried: T.carry_capacity }, motes: [[0, 0, 0]] } });
  assert.equal(run(sim, 5).length, 0);
  assert.equal(sim.state.player.carried, T.carry_capacity);
});

test('deposit + lantern_lit: interact in range deposits up to lantern_cost, lights the lantern', () => {
  const sc = { ...EMPTY, player: { pos: [0, 0, 25 - T.interact_radius], carried: 3 } };
  const sim = createSim(T, { scenario: sc });
  let ev = run(sim, 2, press('interact', 0));
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: 3, deposited: 3 });
  sim.state.player.carried = 7;
  ev = run(sim, 2, press('interact', 0));
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: 2, deposited: 5 });
  assert.equal(sim.state.player.carried, 5);
  assert.equal(sim.state.score, T.score.per_lantern);
  assert.equal(sim.snapshot().lanterns[0].lit, true);
});

test('interact out of range or held button does nothing', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, player: { pos: [0, 0, 25 - T.interact_radius - 0.01], carried: 5 } } });
  assert.equal(run(sim, 3, { interact: true }).length, 0);
});

test('win: lighting the last lantern -> won/all_lit with time + flame bonus', () => {
  const lit = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const sim = createSim(T, { scenario: { ...EMPTY, player: { pos: [0, 0, 24], carried: 5 }, lanterns: lit, time_left_s: 100 } });
  assert.equal(sim.state.score, 0); // preset lit lanterns give no score
  const ev = run(sim, 5, press('interact', 0));
  assert.deepEqual(ev.at(-1), { tick: 1, name: 'game_over', data: { result: 'won', reason: 'all_lit' } });
  const timeBonus = T.score.per_second_left * Math.floor(100 - 1 / 60);
  assert.equal(sim.state.score, T.score.per_lantern + timeBonus + T.score.per_flame_left * T.flames);
  assert.equal(sim.state.state, 'won');
  assert.equal(sim.state.steps, 1); // stops after game over
});

test('pulse: costs pulse_cost, stuns + pushes shades in radius, cooldown, score per_stun', () => {
  const sc = { ...EMPTY, player: { carried: 3 }, shades: [{ id: 'A', pos: [T.pulse_radius, 0, 0] }, { id: 'B', pos: [T.pulse_radius + 1, 0, 0] }] };
  const sim = createSim(T, { scenario: sc });
  const ev = run(sim, 1, { pulse: true });
  assert.deepEqual(ev[0], { tick: 1, name: 'pulse', data: { stunned_ids: ['A'] } });
  const snap = sim.snapshot();
  assert.equal(snap.player.carried, 3 - T.pulse_cost);
  assert.equal(snap.shades[0].state, 'stunned');
  assert.ok(Math.abs(snap.shades[0].pos[0] - (T.pulse_radius + T.pulse_push_m)) < 1e-6);
  assert.notEqual(snap.shades[1].state, 'stunned');
  assert.equal(sim.state.score, T.score.per_stun);
  // re-press during cooldown -> nothing
  const ev2 = run(sim, 4, (k) => ({ pulse: k % 2 === 1 }));
  assert.equal(ev2.filter((e) => e.name === 'pulse').length, 0);
});

test('pulse: stunned shade frozen for pulse_stun_s then chases again', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, player: { carried: 1 }, shades: [{ id: 'A', pos: [3, 0, 0] }] } });
  run(sim, 1, { pulse: true });
  const x0 = sim.state.shades[0].x;
  run(sim, Math.round(T.pulse_stun_s * 60) - 1);
  assert.equal(sim.state.shades[0].x, x0);
  assert.equal(sim.state.shades[0].state, 'stunned');
  run(sim, 1);
  assert.equal(sim.state.shades[0].state, 'chase');
  assert.ok(sim.state.shades[0].x < x0);
});

test('pulse: not enough light -> no pulse', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, player: { carried: 0 }, shades: [{ pos: [3, 0, 0] }] } });
  assert.equal(run(sim, 1, { pulse: true }).length, 0);
});

test('shade chases at shade_speed', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, shades: [{ id: 'S1', pos: [20, 0, 0] }] } });
  run(sim, 60);
  assert.ok(Math.abs(sim.state.shades[0].x - (20 - T.shade_speed)) < 1e-6);
});

test('hit: lose a flame, drop hit_drop_ratio of carried, invulnerable for invuln_s', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, player: { carried: 5 }, shades: [{ id: 'S1', pos: [0.5, 0, 0] }] } });
  const ev = run(sim, Math.round(T.invuln_s * 60) + 1);
  const hits = ev.filter((e) => e.name === 'player_hit');
  assert.equal(hits.length, 2);
  assert.deepEqual(hits[0], { tick: 1, name: 'player_hit', data: { by: 'shade', flames: T.flames - 1, dropped: Math.floor(5 * T.hit_drop_ratio) } });
  assert.equal(hits[1].tick - hits[0].tick, Math.round(T.invuln_s * 60));
});

test('lose: last flame -> lost/no_flames', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, player: { flames: 1 }, shades: [{ pos: [0.5, 0, 0] }] } });
  const ev = run(sim, 10);
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
  assert.equal(sim.state.state, 'lost');
});

test('safe_radius: shade cannot enter lit lantern radius, unlit lantern does not protect', () => {
  const sc = (lit) => ({ ...EMPTY, player: { pos: [0, 0, 25] }, lanterns: [{ id: 'L1', lit }], shades: [{ id: 'S1', pos: [0, 0, 10] }] });
  let sim = createSim(T, { scenario: sc(true) });
  const ev = run(sim, 600);
  assert.equal(ev.filter((e) => e.name === 'player_hit').length, 0);
  assert.ok(Math.hypot(sim.state.shades[0].x, sim.state.shades[0].z - 25) >= T.safe_radius - 1e-9);
  sim = createSim(T, { scenario: sc(false) });
  assert.ok(run(sim, 600).some((e) => e.name === 'player_hit'));
});

test('dawn: time runs out -> lost/dawn at the exact tick', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, time_left_s: 1 } });
  const ev = run(sim, 1000);
  assert.deepEqual(ev.at(-1), { tick: 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
});

test('random spawning: motes respawn, shades spawn with shade_spawned event and unique ids', () => {
  const sim = createSim(T, { seed: 7, scenario: { motes: [], shades: [] } });
  const ev = run(sim, WORLD.shade_spawn_ticks);
  assert.equal(sim.snapshot().motes_active, WORLD.shade_spawn_ticks / WORLD.mote_respawn_ticks);
  assert.deepEqual(ev.filter((e) => e.name === 'shade_spawned').map((e) => e.data.id), ['S1']);
});

test('scenario shade ids: auto ids skip ids given by the scenario', () => {
  const sim = createSim(T, { scenario: { ...EMPTY, shades: [{ pos: [30, 0, 0] }, { id: 'S1', pos: [-30, 0, 0] }] } });
  assert.deepEqual(sim.snapshot().shades.map((s) => s.id), ['S2', 'S1']);
});

test('input reader: fields persist, defaults before first frame', () => {
  const at = makeInputReader({ frames: [{ tick: 5, move: [0, 1], cam_yaw_deg: 30 }, { tick: 8, interact: true }] });
  assert.deepEqual(at(0).move, [0, 0]);
  assert.deepEqual(at(5), { move: [0, 1], cam_yaw_deg: 30, jump: false, interact: false, pulse: false, dash: false });
  assert.equal(at(9).interact, true);
  assert.equal(at(9).cam_yaw_deg, 30);
});
