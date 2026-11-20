// Unit tests for the game logic (Contract v1.1 standard numbers). One block per acceptance criterion
// in docs/notes/phase-1.md and docs/notes/phase-2.md. Phase-1 tests whose expectation changed are marked [P2 change].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSim, STD } from '../src/sim/sim.js';
import { LEVELS, groundAt } from '../src/sim/levels.js';
import { makeInputReader } from '../src/sim/validate.js';

const contract = JSON.parse(fs.readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const T = contract.tuning;
const EMPTY = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [], drifters: [] };
const mk = (sc = {}, night = 1, seed = 1) => createSim(T, { seed, night, scenario: { ...EMPTY, ...sc } });

function run(sim, n, input = {}) {
  const events = [];
  for (let k = 0; k < n && (sim.state.state === 'playing' || sim.state.state === 'paused'); k++) {
    const inp = typeof input === 'function' ? input(k) : input;
    for (const e of sim.step(inp)) events.push({ tick: sim.state.tick, ...e });
  }
  return events;
}
const press = (key, atTick, extra = {}) => (k) => ({ ...extra, [key]: k === atTick });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ---------------- contract ----------------
// [P3 change] v1.2: nights 240/270/300 s, fuel keys, new score table (time bonus removed)
test('contract v1.2: standard numbers from Ticket-02 + Ticket-03', () => {
  assert.equal(contract.contract_version, '1.2');
  const expect = { player_speed: 6, carry_capacity: 10, lantern_cost: 10, pickup_radius: 1, interact_radius: 2, pulse_cost: 3,
    pulse_radius: 5, night1_duration_s: 240, night2_duration_s: 270, night3_duration_s: 300, fuel_max: 100, fuel_decay_per_s: 1,
    fuel_per_mote: 10, relight_cost: 5, win_ratio: 0.6, drain_per_s: 5, low_fuel_threshold: 30, capacity_max: 20, flames: 3, invuln_s: 1.5,
    hit_drop_ratio: 0.5, pulse_stun_s: 2, pulse_push_m: 4, pulse_cooldown_s: 3, safe_radius: 6, shade_speed: 4,
    shade_hit_radius: 1, fall_enabled: true, dash_speed: 14, dash_duration_s: 0.2, dash_cooldown_s: 1.5, lantern_count_night1: 5 };
  for (const [k, v] of Object.entries(expect)) assert.equal(T[k], v, k);
  assert.deepEqual(T.score, { per_mote: 5, per_lantern: 100, per_relight: 40, per_stun: 5, per_stun_drain: 15, per_second_left: 0, per_flame_left: 50, per_lantern_at_dawn: 50 });
});

// ---------------- maps ----------------
test('maps: lantern positions and counts per night', () => {
  assert.deepEqual(createSim(T, { night: 1 }).snapshot().lanterns.map((l) => l.pos), LEVELS[1].lanterns);
  assert.equal(createSim(T, { night: 2 }).snapshot().lanterns.length, 6);
  const n3 = createSim(T, { night: 3 }).snapshot().lanterns;
  assert.deepEqual(n3.map((l) => l.id), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
  assert.deepEqual(n3[0].pos, [0, 6, 6]);
});

test('maps: spawn point counts (motes 24/24/30, shades 12/16/16)', () => {
  assert.deepEqual([1, 2, 3].map((n) => LEVELS[n].moteSpawns.length), [24, 24, 30]);
  assert.deepEqual([1, 2, 3].map((n) => LEVELS[n].shadeSpawns.length), [12, 16, 16]);
  // tier-1 mote points of night 3 are on the z > 0 half at Y = 3
  for (const p of LEVELS[3].moteSpawns.filter((q) => q[1] === 3)) assert.ok(p[2] > 0);
});

test('terrain: night 1 edge at 40 m, night 2 bridge, night 3 tiers/ramp/tower', () => {
  const L1 = LEVELS[1], L2 = LEVELS[2], L3 = LEVELS[3];
  assert.equal(groundAt(L1, 40, 0), 0);
  assert.equal(groundAt(L1, 40.01, 0), null);
  assert.equal(groundAt(L2, 35, 1.9), 0);
  assert.equal(groundAt(L2, 35, 2.1), null);
  assert.equal(groundAt(L3, 0, 18), 3); // tier 1
  assert.equal(groundAt(L3, 0, -18), 0); // z < 0 half is tier 0
  assert.equal(groundAt(L3, 5, 0), 6); // tier 2
  const a = Math.PI / 6;
  assert.ok(near(groundAt(L3, 27 * Math.cos(a), 27 * Math.sin(a)), 1.5)); // ramp middle
  assert.ok(groundAt(L3, 0.5, 0) > 6); // tower
});

// ---------------- movement ----------------
test('movement: 6 m/s, camera yaw rotation, normalized diagonal', () => {
  let sim = mk();
  run(sim, 60, { move: [0, 1] });
  assert.ok(near(sim.state.player.z, 6));
  sim = mk();
  run(sim, 60, { move: [0, 1], cam_yaw_deg: 90 });
  assert.ok(near(sim.state.player.x, 6) && near(sim.state.player.z, 0));
  sim = mk();
  run(sim, 60, { move: [1, 1] });
  assert.ok(near(Math.hypot(sim.state.player.x, sim.state.player.z), 6, 1e-3));
});

test('jump: 7 m/s, gravity 20 -> airborne ~0.7 s, only from the ground', () => {
  const sim = mk();
  const ys = [];
  run(sim, 50, (k) => (ys.push(sim.state.player.y), { jump: k === 0 || k === 10 }));
  const peak = Math.max(...ys);
  assert.ok(near(peak, (7 * 7) / 40, 0.1), `peak ${peak}`);
  assert.equal(sim.state.player.y, 0);
  assert.equal(sim.state.player.grounded, true);
});

test('[P2 change] fall: off the island -> lose flame + all motes, wait 60 ticks, respawn with 90 ticks invuln', () => {
  // Phase 1 clamped the player at the edge (fall_enabled false). Ticket-02 makes falling real.
  const sim = mk({ player: { pos: [39, 0, 0], carried: 4 } });
  const ev = run(sim, 200, (k) => ({ move: k < 30 ? [1, 0] : [0, 0] }));
  const hit = ev.find((e) => e.name === 'player_hit');
  assert.deepEqual(hit.data, { by: 'fall', flames: 2, dropped: 0, lost: 4 });
  assert.equal(ev.filter((e) => e.name === 'player_hit').length, 1);
  const s = sim.state.player;
  assert.deepEqual([s.x, s.y, s.z], [0, 0, 0]);
  const respawnTick = hit.tick + STD.fall_wait;
  assert.equal(s.invuln, Math.max(0, STD.respawn_invuln - (sim.state.tick - respawnTick)));
});

test('fall on last flame -> lost/no_flames, no respawn', () => {
  const sim = mk({ player: { pos: [39.9, 0, 0], flames: 1 } });
  const ev = run(sim, 300, { move: [1, 0] });
  assert.deepEqual(ev.at(-1).data, { result: 'lost', reason: 'no_flames' });
});

// ---------------- dash ----------------
test('dash: 14 m/s for 12 ticks along movement, 90-tick cooldown from start, keeps height in air', () => {
  let sim = mk();
  const ev = run(sim, 12, press('dash', 0));
  assert.deepEqual(ev[0], { tick: 1, name: 'dash', data: {} });
  assert.ok(near(sim.state.player.z, 14 * 0.2)); // standing still -> facing +Z
  sim = mk();
  run(sim, 30, (k) => ({ move: [0, 1], dash: k % 2 === 0 })); // spam: only the first one counts
  assert.ok(near(sim.state.player.z, 14 * 0.2 + 6 * (30 - 12) / 60));
  assert.equal(sim.state.player.dashCd, 90 - 29); // set on tick 1, decremented on ticks 2..30
  // in the air: height preserved during dash
  sim = mk();
  run(sim, 10, press('jump', 0));
  const y0 = sim.state.player.y;
  run(sim, 5, press('dash', 0));
  assert.ok(near(sim.state.player.y, y0));
});

test('charm: speed 7.2 and dash without cooldown for 600 ticks; presses during dash ignored', () => {
  const sim = mk({ charms: [{ id: 'C1', pos: [0, 0, 0.5] }] }, 2);
  const ev = run(sim, 1);
  assert.deepEqual(ev[0].data, { charm_id: 'C1', charm_ticks: 600 });
  run(sim, 60, { move: [1, 0] });
  assert.ok(near(sim.state.player.x, 7.2));
  const d = run(sim, 40, (k) => ({ dash: k % 2 === 0 })).filter((e) => e.name === 'dash');
  // a dash lasts 12 ticks; presses during it are ignored; with the charm the next press after it ends works
  assert.deepEqual(d.map((e) => e.tick - 61), [1, 13, 25, 37]);
  assert.equal(sim.snapshot().charms[0].available, false);
  assert.equal(sim.snapshot().charms[0].respawn_s, Math.round(((2700 - 100) / 60) * 1000) / 1000);
});

test('charm respawns after 2700 ticks', () => {
  const sim = mk({ charms: [{ id: 'C1', available: false, respawn_ticks: 5 }] }, 2);
  run(sim, 5);
  assert.equal(sim.snapshot().charms[0].available, true);
  assert.deepEqual(sim.snapshot().charms[0].pos, [35, 0, 0]);
});

// ---------------- motes ----------------
test('[P2 change] motes: 20 at start on distinct spawn points, +1 at tick 240k up to 30', () => {
  const sim = createSim(T, { seed: 3, night: 1, scenario: { random_shades: false } });
  const s0 = sim.snapshot();
  assert.equal(s0.motes_active, 20);
  assert.equal(new Set(s0.motes.map((m) => m.pos.join())).size, 20);
  run(sim, 239);
  assert.equal(sim.snapshot().motes_active, 20);
  run(sim, 1);
  assert.equal(sim.snapshot().motes_active, 21);
  run(sim, 240 * 10);
  assert.equal(sim.snapshot().motes_active, 24); // night 1 has only 24 points: no free point -> skipped
});

test('pickup: XZ <= 1.0 and height difference <= 1.5', () => {
  const sim = mk({ motes: [[1, 0, 0], [-1.01, 0, 0], [0, 0, 1], [0, 0, -1]] });
  sim.state.motes[3].y = 1.6; // too high above Mây's feet
  const ev = run(sim, 1);
  assert.equal(ev.filter((e) => e.name === 'mote_picked').length, 2);
});

test('carry capacity 10', () => {
  const sim = mk({ player: { carried: 10 }, motes: [[0, 0, 0]] });
  assert.equal(run(sim, 3).length, 0);
});

// ---------------- lanterns + score ----------------
// [P3 change] +5 per mote (was +10); lantern gets fuel 100 when lit
test('[P2 change][P3 change] deposit: cost 10, partial deposits remembered, +5 per mote, +100 first light, fuel 100', () => {
  const sim = mk({ player: { pos: [0, 0, 23], carried: 6 }, motes: [[0, 0, 23.5]] });
  run(sim, 1);
  assert.equal(sim.state.score, 0); // picking up gives no score
  let ev = run(sim, 2, press('interact', 0));
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: 7, deposited: 7 });
  assert.equal(sim.state.score, 35);
  sim.state.player.carried = 9;
  ev = run(sim, 2, press('interact', 0));
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.deepEqual(ev[1].data, { lantern_id: 'L1', relight: false });
  assert.equal(sim.state.player.carried, 6);
  assert.equal(sim.state.score, 50 + 100);
  const l = sim.snapshot().lanterns[0];
  assert.equal(l.ever_lit, true);
  assert.ok(l.fuel <= 100 && l.fuel >= 99.9);
});

test('interact radius 2.0, nearest unlit lantern, tie -> smaller id', () => {
  let sim = mk({ player: { pos: [0, 0, 22.99], carried: 1 } });
  assert.equal(run(sim, 1, { interact: true }).length, 0);
  sim = mk({ player: { pos: [5, 0, 0], carried: 2 }, lanterns: [{ id: 'L3', pos: [5, 0, 1] }, { id: 'L2', pos: [5, 0, -1] }] });
  const ev = run(sim, 1, { interact: true });
  assert.equal(ev[0].data.lantern_id, 'L2');
});

// [P3 change] replaced: no early win; win = alive at dawn with lit >= ceil(0.6 x total), reason dawn_survived
test('[P3 change] lighting every lantern does not end the night', () => {
  const lit = ['L2', 'L3', 'L4', 'L5'].map((id) => ({ id, lit: true }));
  const sim = mk({ player: { pos: [0, 0, 24], carried: 10 }, lanterns: lit, time_left_s: 100 });
  const ev = run(sim, 5, press('interact', 0));
  assert.ok(ev.some((e) => e.name === 'lantern_lit'));
  assert.ok(!ev.some((e) => e.name === 'game_over'));
  assert.equal(sim.state.state, 'playing');
});

test('[P3 change] dawn: 3/5 lit -> won dawn_survived with 50 + floor(fuel) per lit lantern + 50 per flame', () => {
  const lanterns = [{ id: 'L1', lit: true, fuel: 80 }, { id: 'L2', lit: true, fuel: 50.5 }, { id: 'L3', lit: true }];
  const sim = mk({ lanterns, time_left_s: 1 });
  const ev = run(sim, 100);
  assert.deepEqual(ev.at(-1), { tick: 60, name: 'game_over', data: { result: 'won', reason: 'dawn_survived' } });
  // fuel after 60 ticks: 79, 49.5, 99
  assert.equal(sim.state.score, 50 * 3 + 79 + 49 + 99 + 50 * 3);
});

test('[P3 change] dawn: 2/5 lit -> lost dawn (no bonus); night 2 needs 4/6, night 3 needs 5/7', () => {
  let sim = mk({ lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }], time_left_s: 1 });
  assert.deepEqual(run(sim, 100).at(-1).data, { result: 'lost', reason: 'dawn' });
  assert.equal(sim.state.score, 0);
  const lit = (n) => Array.from({ length: n }, (_, i) => ({ id: 'L' + (i + 1), lit: true }));
  sim = mk({ lanterns: lit(3), time_left_s: 0.5 }, 2);
  assert.equal(run(sim, 100).at(-1).data.reason, 'dawn');
  sim = mk({ lanterns: lit(4), time_left_s: 0.5 }, 2);
  assert.equal(run(sim, 100).at(-1).data.reason, 'dawn_survived');
  sim = mk({ player: { pos: [0, 0, -30] }, lanterns: lit(5), time_left_s: 0.5 }, 3);
  assert.equal(run(sim, 100).at(-1).data.reason, 'dawn_survived');
});

test('[P3 change] losing the last flame on the dawn tick is still no_flames', () => {
  const sim = mk({ player: { flames: 1 }, lanterns: [{ id: 'L1', lit: true }, { id: 'L2', lit: true }, { id: 'L3', lit: true }],
    shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }], time_left_s: 1 / 60 });
  assert.deepEqual(run(sim, 5).at(-1).data, { result: 'lost', reason: 'no_flames' });
});

// ---------------- Ticket-03: fuel ----------------
test('fuel: lit lantern loses 1/s, goes out at 0 -> lantern_out, deposited 0, ever_lit stays', () => {
  const sim = mk({ lanterns: [{ id: 'L1', lit: true, fuel: 2 }] });
  run(sim, 60);
  assert.equal(sim.snapshot().lanterns[0].fuel, 1);
  const ev = run(sim, 60);
  assert.deepEqual(ev.find((e) => e.name === 'lantern_out'), { tick: 120, name: 'lantern_out', data: { lantern_id: 'L1' } });
  assert.deepEqual(sim.snapshot().lanterns[0], { id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0, fuel: 0, ever_lit: true, relit_count: 0 });
});

test('refuel: used = min(carried, ceil((100 - fuel)/10)), +10 fuel and +5 score each', () => {
  const sim = mk({ player: { pos: [0, 0, 24], carried: 10 }, lanterns: [{ id: 'L1', lit: true, fuel: 55 }] });
  let ev = run(sim, 1, { interact: true });
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: 5, fuel: 100 });
  assert.equal(ev[0].name, 'refuel');
  assert.equal(sim.state.player.carried, 5);
  assert.equal(sim.state.score, 25);
  // after 1 tick of decay fuel is 99.98 -> used = 1
  ev = run(sim, 2, press('interact', 1)); // release, then press again (edge-triggered)
  assert.deepEqual(ev[0].data, { lantern_id: 'L1', amount: 1, fuel: 100 });
  // A lantern is never exactly full at interact time: decay (step 2) runs before interact (step 5),
  // so "used = 0" only happens with carried = 0 (no interact at all). See docs/adr/0001-lantern-fuel.md.
  const sim2 = mk({ player: { pos: [0, 0, 24], carried: 0 }, lanterns: [{ id: 'L1', lit: true }] });
  assert.equal(run(sim2, 1, { interact: true }).length, 0);
});

test('relight: lantern that was lit before needs 5 motes, +40, relight true, relit_count++', () => {
  const sim = mk({ player: { pos: [0, 0, 24], carried: 7 }, lanterns: [{ id: 'L1', lit: false, ever_lit: true }] });
  const ev = run(sim, 1, { interact: true });
  assert.deepEqual(ev.map((e) => e.name), ['deposit', 'lantern_lit']);
  assert.deepEqual(ev[1].data, { lantern_id: 'L1', relight: true });
  assert.equal(sim.state.player.carried, 2);
  assert.equal(sim.state.score, 25 + 40);
  assert.equal(sim.snapshot().lanterns[0].relit_count, 1);
});

test('capacity: 10 + 2 x successful lights (incl. relights, not scenario presets), max 20', () => {
  let sim = mk({ lanterns: [{ id: 'L1', lit: true }] });
  assert.equal(sim.snapshot().player.capacity, 10);
  sim = mk({ player: { successful_lights: 3 } });
  assert.equal(sim.snapshot().player.capacity, 16);
  sim = mk({ player: { successful_lights: 9 } });
  assert.equal(sim.snapshot().player.capacity, 20);
  sim = mk({ player: { pos: [0, 0, 24], carried: 5 }, lanterns: [{ id: 'L1', ever_lit: true }], motes: Array.from({ length: 12 }, () => [0, 0, 24]) });
  run(sim, 1, { interact: true });
  assert.equal(sim.snapshot().player.capacity, 12);
  run(sim, 1); // pickup (step 4) runs before interact (step 5): new capacity applies from the next tick
  assert.equal(sim.state.player.carried, 12);
});

test('low fuel (< 30) loses the safe zone; exactly 30 keeps it', () => {
  const sc = (fuel) => ({ player: { pos: [0, 0, 24] }, lanterns: [{ id: 'L1', lit: true, fuel }], shades: [{ id: 'S1', pos: [0, 1, 14], state: 'chase' }] });
  let sim = mk(sc(29.9));
  assert.ok(run(sim, 300).some((e) => e.name === 'player_hit'));
  sim = mk(sc(100));
  assert.ok(!run(sim, 300).some((e) => e.name === 'player_hit'));
});

test('drain: wander shade goes to nearest weak lantern, drains 5/s (+1/s decay) within 2 m, fuel_drain every 60 ticks', () => {
  const sim = mk({ player: { pos: [-30, 0, -10] }, lanterns: [{ id: 'L1', lit: true, fuel: 29 }], shades: [{ id: 'S1', pos: [0, 1, 18], state: 'wander' }] });
  run(sim, 120);
  const sh = sim.state.shades[0];
  assert.equal(sh.state, 'drain');
  assert.equal(sh.targetL, 'L1');
  const f0 = sim.state.lanterns[0].fuel;
  const ev = run(sim, 60);
  assert.equal(f0 - sim.state.lanterns[0].fuel, 60 * 6); // 6 fuel per second in 1/60 units
  assert.equal(ev.filter((e) => e.name === 'fuel_drain').length, 1);
  assert.equal(ev.find((e) => e.name === 'fuel_drain').data.shade_id, 'S1');
});

test('drain exits: Mây within 6 m -> chase; refuel >= 30 -> pushed out + wander; lantern out -> wander', () => {
  let sim = mk({ player: { pos: [0, 0, 32] }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 23.5], state: 'drain', target_lantern_id: 'L1' }] });
  run(sim, 1);
  assert.equal(sim.state.shades[0].state, 'drain');
  sim.state.player.z = 29;
  run(sim, 1);
  assert.equal(sim.state.shades[0].state, 'chase');
  // player 1.8 m from L1 (interact radius 2)
  sim = mk({ player: { pos: [1.5, 0, 26], carried: 2 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 23.5], state: 'drain', target_lantern_id: 'L1' }] });
  sim.state.player.invuln = 600;
  run(sim, 31, press('interact', 0));
  const sh = sim.state.shades[0];
  assert.notEqual(sh.state, 'drain');
  assert.ok(Math.hypot(sh.x, sh.z - 25) >= 6 - 1e-6);
  sim = mk({ player: { pos: [-30, 0, 0] }, lanterns: [{ id: 'L1', lit: true, fuel: 0.1 }], shades: [{ id: 'S1', pos: [0, 1, 23.5], state: 'drain', target_lantern_id: 'L1' }] });
  run(sim, 2);
  assert.equal(sim.state.lanterns[0].lit, false);
  assert.equal(sim.state.shades[0].state, 'wander');
});

test('pulse on a draining shade scores 15; stun ends -> wander', () => {
  const sim = mk({ player: { pos: [0, 0, 20], carried: 3 }, lanterns: [{ id: 'L1', lit: true, fuel: 20 }], shades: [{ id: 'S1', pos: [0, 1, 23.5], state: 'drain', target_lantern_id: 'L1' }] });
  run(sim, 1, { pulse: true });
  assert.equal(sim.state.score, 15);
  run(sim, 120);
  assert.equal(sim.state.shades[0].state !== 'stunned', true);
});

test('dawn: time runs out -> lost/dawn', () => {
  const sim = mk({ time_left_s: 1 });
  assert.deepEqual(run(sim, 100).at(-1), { tick: 60, name: 'game_over', data: { result: 'lost', reason: 'dawn' } });
});

// ---------------- pulse ----------------
test('pulse: cost 3, 3D radius 5 from feet+0.8, stun 120, push 4 m over 15 ticks, cooldown 180, +5 each', () => {
  const sim = mk({ player: { carried: 5 }, shades: [{ id: 'S1', pos: [4.9, 0.8, 0] }, { id: 'S2', pos: [0, 0.8 + 5.01, 0] }, { id: 'S3', pos: [3, 1, 3] }] });
  const ev = run(sim, 1, { pulse: true });
  assert.deepEqual(ev[0].data, { stunned_ids: ['S1', 'S3'] });
  assert.equal(sim.state.player.carried, 2);
  assert.equal(sim.state.score, 10);
  run(sim, 14);
  assert.ok(near(sim.state.shades[0].x, 4.9 + 4, 1e-6));
  run(sim, 5);
  assert.ok(near(sim.state.shades[0].x, 8.9, 1e-6)); // no more push after 15 ticks
  run(sim, 120 - 20);
  assert.equal(sim.state.shades[0].state, 'stunned');
  run(sim, 1);
  assert.notEqual(sim.state.shades[0].state, 'stunned');
  assert.equal(sim.state.player.pulseCd, 180 - 120);
});

test('pulse: not enough motes or on cooldown -> nothing; re-pulse refreshes stun and scores again', () => {
  let sim = mk({ player: { carried: 2 }, shades: [{ pos: [2, 1, 0] }] });
  assert.equal(run(sim, 1, { pulse: true }).length, 0);
  sim = mk({ player: { carried: 9 }, shades: [{ id: 'S1', pos: [1.5, 1, 0] }] });
  run(sim, 1, { pulse: true });
  run(sim, 179);
  sim.state.shades[0].x = 2;
  const ev = run(sim, 2, press('pulse', 0));
  assert.deepEqual(ev[0].data.stunned_ids, ['S1']);
  assert.equal(sim.state.shades[0].left, 119);
  assert.equal(sim.state.score, 10);
});

// ---------------- shades ----------------
test('[P2 change] shades: none at start, 2 at tick 300 (spawning), then every 480 ticks, max 6, ids in order', () => {
  // Phase 1 started with 2 shades and spawned every 30 s.
  const sim = createSim(T, { seed: 9, night: 1, scenario: { random_motes: false, motes: [] } });
  assert.equal(sim.snapshot().shades.length, 0);
  const ev = run(sim, 300 + 480, { move: [0, 0] }).filter((e) => e.name === 'shade_spawned');
  assert.deepEqual(ev.map((e) => [e.tick, e.data.id]), [[300, 'S1'], [300, 'S2'], [780, 'S3']]);
  for (const sh of sim.state.shades) {
    const p = LEVELS[1].shadeSpawns.find((q) => near(q[0], sh.x, 20));
    assert.ok(p);
  }
});

test('shade spawn points are >= 15 m from the player', () => {
  const sim = createSim(T, { seed: 2, night: 1, scenario: { random_motes: false, motes: [], player: { pos: [30, 0, 15] } } });
  run(sim, 300);
  const pts = LEVELS[1].shadeSpawns;
  for (const sh of sim.state.shades) assert.ok(pts.some((p) => near(p[0], sh.x) && near(p[2], sh.z) && Math.hypot(p[0] - 30, p[2] - 15) >= 15));
});

test('shades: detect 12 m -> chase at 4 m/s (4.5 on night 3), give up beyond 18 m', () => {
  let sim = mk({ shades: [{ id: 'S1', pos: [11, 1, 0] }] });
  assert.equal(sim.state.shades[0].state, 'chase');
  run(sim, 60);
  assert.ok(near(sim.state.shades[0].x, 7));
  sim = mk({ shades: [{ id: 'S1', pos: [13, 1, 0] }] });
  assert.equal(sim.state.shades[0].state, 'wander');
  sim = mk({ shades: [{ id: 'S1', pos: [17, 1, 0], state: 'chase' }] });
  run(sim, 30, { move: [-1, 0] });
  assert.equal(sim.state.shades[0].state, 'wander'); // player ran away: > 18 m
  sim = mk({ player: { pos: [0, 0, -30] }, shades: [{ id: 'S1', pos: [10, 1, -30] }] }, 3);
  run(sim, 60);
  assert.ok(near(sim.state.shades[0].x, 5.5));
});

test('hit: -1 flame, drop floor(carried/2) on a 1.5-2.5 m ring (TTL 480), invuln 90, shade recoils 2 m in 60 ticks', () => {
  // 50 flames so the game does not end before the TTL check (the shade keeps coming back)
  const sim = mk({ player: { carried: 5, flames: 50 }, shades: [{ id: 'S1', pos: [0.9, 1, 0], state: 'chase' }] });
  const ev = run(sim, 1);
  assert.deepEqual(ev[0].data, { by: 'shade', flames: 49, dropped: 2 });
  const snap = sim.snapshot();
  assert.equal(snap.player.carried, 3);
  assert.equal(snap.shades[0].state, 'recoil');
  const drops = snap.motes.filter((m) => m.kind === 'dropped');
  assert.equal(drops.length, 2);
  for (const m of drops) {
    const r = Math.hypot(m.pos[0], m.pos[2]);
    assert.ok(r >= 1.5 - 1e-3 && r <= 2.5 + 1e-3);
    assert.equal(m.ttl_s, 8);
  }
  const x0 = sim.state.shades[0].x;
  run(sim, 59);
  assert.ok(near(sim.state.shades[0].x - x0, 2 * 59 / 60, 1e-6));
  run(sim, 1);
  assert.ok(near(sim.state.shades[0].x - x0, 2, 1e-6)); // 2 m after 60 ticks of recoil
  run(sim, 1);
  assert.notEqual(sim.state.shades[0].state, 'recoil');
  assert.equal(sim.state.player.invuln, 90 - 61); // hit on tick 1, 61 ticks later
  const firstDrops = drops.map((m) => m.id);
  run(sim, 480 - 62);
  assert.ok(firstDrops.every((id) => sim.state.motes.some((m) => m.id === id)), 'still there at tick 480');
  run(sim, 1);
  assert.ok(firstDrops.every((id) => !sim.state.motes.some((m) => m.id === id)), 'TTL 480 expired');
});

test('hit: max one flame per tick, shades checked in id order; touching while invulnerable does nothing', () => {
  const sim = mk({ player: { invuln_ticks: 0 }, shades: [{ id: 'S2', pos: [0.5, 1, 0], state: 'chase' }, { id: 'S1', pos: [-0.5, 1, 0], state: 'chase' }] });
  const ev = run(sim, 1);
  assert.equal(ev.filter((e) => e.name === 'player_hit').length, 1);
  assert.equal(sim.state.shades.find((s) => s.id === 'S1').state, 'recoil');
  assert.equal(sim.state.shades.find((s) => s.id === 'S2').state, 'chase');
});

test('hit needs height difference <= 1.5 (night 3 tiers)', () => {
  const sim = mk({ player: { pos: [0, 3, 18] }, shades: [{ id: 'S1', pos: [0, 1, 18.5], state: 'chase' }] }, 3);
  assert.equal(run(sim, 1).filter((e) => e.name === 'player_hit').length, 0);
});

test('safe zone: shade outside is held at 6 m; shade inside when lit is pushed out within 30 ticks, harmless', () => {
  let sim = mk({ player: { pos: [0, 0, 24] }, lanterns: [{ id: 'L1', lit: true }], shades: [{ id: 'S1', pos: [0, 1, 12] }] });
  const ev = run(sim, 600);
  assert.equal(ev.filter((e) => e.name === 'player_hit').length, 0);
  assert.ok(Math.hypot(sim.state.shades[0].x, sim.state.shades[0].z - 25) >= 6 - 1e-9);
  sim = mk({ player: { pos: [0, 0, 23.5], carried: 10 }, shades: [{ id: 'S1', pos: [0, 1, 24.2], state: 'chase' }], lanterns: [{ id: 'L1', deposited: 0 }] });
  sim.state.player.invuln = 0;
  const ev2 = run(sim, 31, press('interact', 0));
  assert.ok(ev2.some((e) => e.name === 'lantern_lit'));
  assert.equal(ev2.filter((e) => e.name === 'player_hit').length, 0);
  assert.ok(Math.hypot(sim.state.shades[0].x, sim.state.shades[0].z - 25) >= 6 - 1e-6);
});

test('safe zone: a stunned (non-moving) shade inside a newly lit lantern is still pushed out within 30 ticks', () => {
  const sim = mk({ player: { pos: [0, 0, 23.5], carried: 10 }, shades: [{ id: 'S1', pos: [2, 1, 25], state: 'stunned', state_ticks_left: 120 }] });
  run(sim, 30, press('interact', 0));
  const sh = sim.state.shades[0];
  assert.equal(sh.state, 'stunned');
  assert.ok(Math.hypot(sh.x, sh.z - 25) >= 6 - 1e-6, `still inside: ${Math.hypot(sh.x, sh.z - 25)}`);
});

// ---------------- night 2 / 3 features ----------------
test('night 2 jump pad: lands on the other island in ~1.4 s, movement keys do not override', () => {
  const sim = mk({ player: { pos: [20, 0, 17.5] } }, 2);
  run(sim, 1);
  assert.equal(sim.state.player.grounded, false);
  run(sim, 100, { move: [-1, 0] });
  const p = sim.state.player;
  assert.equal(p.grounded, true);
  assert.ok(Math.hypot(p.x - 70, p.z) <= 28, `landed at ${p.x},${p.z}`);
  assert.equal(p.flames, 3);
});

test('night 3: tier walls block, ramp climbs to tier 1, pad lands on tier 2', () => {
  let sim = mk({ player: { pos: [0, 0, 10] } }, 3); // between tier 2 (r<=8) and tier 1 (r>=12)
  run(sim, 120, { move: [0, 1] });
  assert.ok(sim.state.player.z < 12 && sim.state.player.y === 0, 'wall to tier 1 blocks');
  const a = Math.PI / 6;
  sim = mk({ player: { pos: [31 * Math.cos(a), 0, 31 * Math.sin(a)] } }, 3);
  run(sim, 75, { move: [0, 1], cam_yaw_deg: (Math.atan2(-Math.cos(a), -Math.sin(a)) * 180) / Math.PI });
  assert.ok(near(sim.state.player.y, 3), `ramp top y=${sim.state.player.y}`);
  sim = mk({ player: { pos: [0, 3, 13] } }, 3);
  run(sim, 120);
  assert.ok(near(sim.state.player.y, 6) && Math.hypot(sim.state.player.x, sim.state.player.z) <= 8);
});

test('wind (night 3): every 1800 ticks, 300 ticks, pushes 2 m/s; disabled by wind_enabled false', () => {
  const sim = createSim(T, { seed: 4, night: 3, scenario: { ...EMPTY, wind_enabled: true } });
  run(sim, 1799);
  assert.equal(sim.snapshot().wind.active, false);
  run(sim, 1);
  const w = sim.snapshot().wind;
  assert.equal(w.active, true);
  const p0 = { ...sim.state.player };
  run(sim, 60);
  assert.ok(near(Math.hypot(sim.state.player.x - p0.x, sim.state.player.z - p0.z), 2, 0.05));
  run(sim, 240);
  assert.equal(sim.snapshot().wind.active, false);
  const off = mk({}, 3);
  run(off, 1800);
  assert.equal(off.snapshot().wind.active, false);
});

test('drifter: idle -> chase (>=5 motes, <=15 m), steals min(3, carried) once, flees 240 ticks then removed', () => {
  const sim = mk({ player: { carried: 5 }, drifters: [{ id: 'D1', pos: [10, 1.5, 0] }] }, 2);
  const ev = run(sim, 120);
  const st = ev.find((e) => e.name === 'drifter_steal');
  assert.deepEqual(st.data, { drifter_id: 'D1', amount: 3, carried: 2 });
  assert.equal(sim.snapshot().drifters[0].state, 'flee');
  assert.equal(sim.snapshot().drifters[0].stolen, 3);
  run(sim, 240);
  assert.equal(sim.snapshot().drifters[0].state, 'removed');
  assert.equal(sim.state.player.flames, 3); // no flame lost
});

test('drifter: stays idle under 5 motes; invulnerability does not prevent stealing', () => {
  let sim = mk({ player: { carried: 4 }, drifters: [{ id: 'D1', pos: [5, 1.5, 0] }] }, 2);
  run(sim, 60);
  assert.equal(sim.snapshot().drifters[0].state, 'idle');
  sim = mk({ player: { carried: 6, invuln_ticks: 600 }, drifters: [{ id: 'D1', pos: [1, 1.5, 0], state: 'chase' }] }, 2);
  assert.equal(run(sim, 1)[0].name, 'drifter_steal');
});

test('drifter + pulse: chase -> flee without stealing; flee with loot -> drops loot, removed 120 ticks later', () => {
  let sim = mk({ player: { carried: 8 }, drifters: [{ id: 'D1', pos: [4, 1.5, 0], state: 'chase' }] }, 2);
  run(sim, 1, { pulse: true });
  assert.equal(sim.snapshot().drifters[0].state, 'flee');
  assert.equal(run(sim, 300).filter((e) => e.name === 'drifter_steal').length, 0);
  sim = mk({ player: { carried: 3 }, drifters: [{ id: 'D1', pos: [3, 1.5, 0], state: 'flee', stolen: 3 }] }, 2);
  const ev = run(sim, 1, { pulse: true });
  assert.deepEqual(ev.find((e) => e.name === 'drifter_drop').data, { drifter_id: 'D1', amount: 3 });
  assert.equal(sim.snapshot().motes.filter((m) => m.kind === 'dropped').length, 3);
  run(sim, 119);
  assert.equal(sim.snapshot().drifters[0].state, 'flee');
  run(sim, 1);
  assert.equal(sim.snapshot().drifters[0].state, 'removed');
});

test('drifters spawn at tick 1200k on nights 2-3 only (max 2), ids D1, D2', () => {
  const sim = createSim(T, { seed: 1, night: 2, scenario: { random_shades: false, random_motes: false, motes: [] } });
  run(sim, 3600);
  assert.deepEqual(sim.snapshot().drifters.map((d) => d.id), ['D1', 'D2']);
  const n1 = createSim(T, { seed: 1, night: 1, scenario: { random_shades: false } });
  run(n1, 1200);
  assert.equal(n1.snapshot().drifters.length, 0);
});

test('pause: tick advances, sim_tick/time/cooldowns frozen, state paused, events paused/resumed', () => {
  const sim = mk({ player: { pulse_cd_ticks: 50 } });
  run(sim, 10);
  let ev = run(sim, 1, { pause: true });
  assert.deepEqual(ev.map((e) => e.name), ['paused']);
  run(sim, 30, { pause: true, move: [0, 1] });
  const s = sim.snapshot();
  assert.equal(s.state, 'paused');
  assert.equal(s.tick, 41);
  assert.equal(s.sim_tick, 10);
  assert.equal(s.player.pos[2], 0);
  assert.equal(sim.state.player.pulseCd, 40);
  ev = run(sim, 2, (k) => ({ pause: k === 1 }));
  assert.deepEqual(ev.map((e) => e.name), ['resumed']);
  assert.equal(sim.snapshot().sim_tick, 11);
});

test('snapshot v1.1 fields', () => {
  const s = createSim(T, { night: 2 }).snapshot();
  for (const k of ['night', 'wind', 'motes', 'drifters', 'charms']) assert.ok(k in s, k);
  for (const k of ['vel', 'grounded', 'invuln', 'dash_cd_s', 'pulse_cd_s', 'charm_s']) assert.ok(k in s.player, k);
  assert.deepEqual(Object.keys(s.motes[0]), ['id', 'pos', 'kind', 'ttl_s']);
  assert.deepEqual(s.charms[0], { id: 'C1', pos: [35, 0, 0], available: true, respawn_s: 0 });
});

test('input reader: fields persist, defaults before first frame', () => {
  const at = makeInputReader({ frames: [{ tick: 5, move: [0, 1], cam_yaw_deg: 30 }, { tick: 8, interact: true }] });
  assert.deepEqual(at(0).move, [0, 0]);
  assert.equal(at(9).interact, true);
  assert.equal(at(9).cam_yaw_deg, 30);
  assert.equal(at(9).pause, false);
});
