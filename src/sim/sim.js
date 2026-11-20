// Core game logic for Đảo Đèn Lồng. Pure JS, no DOM, no Node APIs:
// used by both the headless runner (src/headless.js) and the 3D client (web/main.js).
// Fixed 60 ticks/second. All distances are horizontal (XZ plane), "within r" means <= r.
import { mulberry32 } from './rng.js';

export const TICK_RATE = 60;
const DT = 1 / TICK_RATE;

// Constants that are not part of the contract tuning (documented in docs/notes/phase-1.md).
export const WORLD = {
  island_radius: 40, // player is clamped inside (fall_enabled = false)
  shade_bound: 45, // shades are clamped inside this radius
  lantern_ring: 25, // default lanterns sit on this circle, L1 at (0,0,25)
  jump_speed: 6,
  gravity: 20,
  initial_motes: 25,
  max_motes: 25,
  mote_respawn_ticks: 180, // one new mote every 3 s while below max
  mote_spawn_min_r: 3,
  mote_spawn_max_r: 38,
  initial_shades: 2,
  max_shades: 6,
  shade_spawn_ticks: 1800, // one new shade every 30 s while below max
  shade_spawn_r: 38,
  shade_spawn_min_dist: 15,
};

export function r3(v) {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r; // avoid -0
}

function hdist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function createSim(tuning, { seed = 0, scenario = null } = {}) {
  const T = tuning;
  const sc = scenario || {};
  const rng = mulberry32(seed);
  const secToTicks = (s) => Math.round(s * TICK_RATE);

  const s = {
    steps: 0,
    state: 'playing',
    result: null,
    score: 0,
    timeStart: T.night1_duration_s,
    timeLeft: T.night1_duration_s,
    player: { x: 0, y: 0, z: 0, vy: 0, flames: T.flames, carried: 0, invuln: 0, pulseCd: 0 },
    lanterns: [],
    motes: [],
    shades: [],
    nextMote: 1,
    nextShade: 1,
    usedShadeIds: new Set(),
    randomMotes: sc.random_motes !== undefined ? sc.random_motes : true,
    randomShades: sc.random_shades !== undefined ? sc.random_shades : true,
    moteTimer: 0,
    shadeTimer: 0,
    prev: { jump: false, interact: false, pulse: false },
  };

  // ---- level setup (Night 1 - Đảo Bến) ----
  for (let i = 0; i < T.lantern_count_night1; i++) {
    const a = (2 * Math.PI * i) / T.lantern_count_night1;
    s.lanterns.push({
      id: 'L' + (i + 1),
      x: WORLD.lantern_ring * Math.sin(a),
      y: 0,
      z: WORLD.lantern_ring * Math.cos(a),
      lit: false,
      deposited: 0,
    });
  }

  const newShadeId = () => {
    while (s.usedShadeIds.has('S' + s.nextShade)) s.nextShade++;
    const id = 'S' + s.nextShade++;
    s.usedShadeIds.add(id);
    return id;
  };
  const addMote = (x, z) => s.motes.push({ id: 'M' + s.nextMote++, x, z });
  const addShade = (x, y, z, id) => {
    const sid = id || newShadeId();
    s.usedShadeIds.add(sid);
    s.shades.push({ id: sid, x, y, z, state: 'chase', stun: 0 });
    return sid;
  };
  const randomMotePos = () => {
    const a = rng() * 2 * Math.PI;
    const r = WORLD.mote_spawn_min_r + Math.sqrt(rng()) * (WORLD.mote_spawn_max_r - WORLD.mote_spawn_min_r);
    return [r * Math.sin(a), r * Math.cos(a)];
  };
  const randomShadePos = () => {
    let x = 0, z = 0;
    for (let i = 0; i < 10; i++) {
      const a = rng() * 2 * Math.PI;
      x = WORLD.shade_spawn_r * Math.sin(a);
      z = WORLD.shade_spawn_r * Math.cos(a);
      if (hdist(x, z, s.player.x, s.player.z) >= WORLD.shade_spawn_min_dist) break;
    }
    return [x, z];
  };

  // ---- apply scenario (no events, no score) ----
  if (sc.player) {
    if (sc.player.pos) [s.player.x, s.player.y, s.player.z] = sc.player.pos;
    if (sc.player.carried !== undefined) s.player.carried = sc.player.carried;
    if (sc.player.flames !== undefined) s.player.flames = sc.player.flames;
  }
  if (sc.time_left_s !== undefined) {
    s.timeStart = sc.time_left_s;
    s.timeLeft = sc.time_left_s;
  }
  if (sc.lanterns) {
    for (const l of sc.lanterns) {
      const lan = s.lanterns.find((x) => x.id === l.id);
      if (!lan) continue; // unknown id: ignored (headless warns on stderr)
      if (l.pos) [lan.x, lan.y, lan.z] = l.pos;
      if (l.deposited !== undefined) lan.deposited = l.deposited;
      if (l.lit !== undefined) lan.lit = l.lit;
    }
  }
  if (sc.motes) {
    for (const m of sc.motes) {
      const p = Array.isArray(m) ? m : m.pos;
      addMote(p[0], p[2]);
    }
  } else if (s.randomMotes) {
    for (let i = 0; i < WORLD.initial_motes; i++) addMote(...randomMotePos());
  }
  if (sc.shades) {
    for (const sh of sc.shades) if (sh.id) s.usedShadeIds.add(sh.id);
    for (const sh of sc.shades) addShade(sh.pos[0], sh.pos[1], sh.pos[2], sh.id);
  } else if (s.randomShades) {
    for (let i = 0; i < WORLD.initial_shades; i++) {
      const [x, z] = randomShadePos();
      addShade(x, 0, z);
    }
  }

  // ---- helpers ----
  const allLit = () => s.lanterns.every((l) => l.lit);
  const finish = (events, result, reason) => {
    s.state = result;
    s.result = reason;
    if (result === 'won') {
      s.score += T.score.per_second_left * Math.floor(Math.max(0, s.timeLeft) + 1e-9);
      s.score += T.score.per_flame_left * s.player.flames;
    }
    events.push({ name: 'game_over', data: { result, reason } });
  };
  const keepOutOfSafeZones = (sh) => {
    if (!(T.safe_radius > 0)) return;
    for (const l of s.lanterns) {
      if (!l.lit) continue;
      const d = hdist(sh.x, sh.z, l.x, l.z);
      if (d < T.safe_radius) {
        const ux = d > 1e-9 ? (sh.x - l.x) / d : 1;
        const uz = d > 1e-9 ? (sh.z - l.z) / d : 0;
        sh.x = l.x + ux * T.safe_radius;
        sh.z = l.z + uz * T.safe_radius;
      }
    }
  };
  const clampRadius = (o, r) => {
    const d = Math.hypot(o.x, o.z);
    if (d > r) {
      o.x *= r / d;
      o.z *= r / d;
    }
  };

  // ---- one simulation step: reads input of tick k, produces state k+1 ----
  function step(input = {}) {
    const events = [];
    if (s.state !== 'playing') return events;
    const p = s.player;
    const inp = {
      move: input.move || [0, 0],
      cam: input.cam_yaw_deg || 0,
      jump: !!input.jump,
      interact: !!input.interact,
      pulse: !!input.pulse,
    };
    const edge = (k) => inp[k] && !s.prev[k];
    const jumpPressed = edge('jump');
    const interactPressed = edge('interact');
    const pulsePressed = edge('pulse');
    s.prev = { jump: inp.jump, interact: inp.interact, pulse: inp.pulse };

    s.steps++;
    s.timeLeft = s.timeStart - s.steps / TICK_RATE;

    // 1. timers
    if (p.invuln > 0) p.invuln--;
    if (p.pulseCd > 0) p.pulseCd--;
    for (const sh of s.shades) {
      if (sh.stun > 0) {
        sh.stun--;
        if (sh.stun === 0) sh.state = 'chase';
      }
    }

    // 2. player movement (camera-relative), jump, island clamp
    let [mx, mz] = inp.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    const th = (inp.cam * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    p.x += wx * T.player_speed * DT;
    p.z += wz * T.player_speed * DT;
    if (!T.fall_enabled) clampRadius(p, WORLD.island_radius);
    const grounded = p.y <= 0 && p.vy <= 0;
    if (jumpPressed && grounded) p.vy = WORLD.jump_speed;
    if (!grounded || p.vy > 0) {
      p.vy -= WORLD.gravity * DT;
      p.y += p.vy * DT;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
      }
    }

    // 3. pick up motes
    for (let i = 0; i < s.motes.length && p.carried < T.carry_capacity; ) {
      const m = s.motes[i];
      if (hdist(p.x, p.z, m.x, m.z) <= T.pickup_radius) {
        s.motes.splice(i, 1);
        p.carried++;
        s.score += T.score.per_mote;
        events.push({ name: 'mote_picked', data: { carried: p.carried } });
      } else i++;
    }

    // 4. interact: deposit into nearest unlit lantern in range
    if (interactPressed && p.carried > 0) {
      let best = null, bestD = Infinity;
      for (const l of s.lanterns) {
        if (l.lit) continue;
        const d = hdist(p.x, p.z, l.x, l.z);
        if (d <= T.interact_radius && d < bestD) {
          best = l;
          bestD = d;
        }
      }
      if (best) {
        const amount = Math.min(p.carried, Math.max(0, T.lantern_cost - best.deposited));
        if (amount > 0) {
          p.carried -= amount;
          best.deposited += amount;
          events.push({ name: 'deposit', data: { lantern_id: best.id, amount, deposited: best.deposited } });
        }
        if (best.deposited >= T.lantern_cost) {
          best.lit = true;
          s.score += T.score.per_lantern;
          events.push({ name: 'lantern_lit', data: { lantern_id: best.id } });
          if (allLit()) {
            finish(events, 'won', 'all_lit');
            return events;
          }
        }
      }
    }

    // 5. pulse: costs carried motes, stuns + pushes shades in radius
    if (pulsePressed && p.pulseCd === 0 && p.carried >= T.pulse_cost) {
      p.carried -= T.pulse_cost;
      p.pulseCd = secToTicks(T.pulse_cooldown_s);
      const stunned = [];
      for (const sh of s.shades) {
        const d = hdist(p.x, p.z, sh.x, sh.z);
        if (d <= T.pulse_radius) {
          sh.state = 'stunned';
          sh.stun = secToTicks(T.pulse_stun_s);
          const ux = d > 1e-9 ? (sh.x - p.x) / d : 1;
          const uz = d > 1e-9 ? (sh.z - p.z) / d : 0;
          sh.x += ux * T.pulse_push_m;
          sh.z += uz * T.pulse_push_m;
          clampRadius(sh, WORLD.shade_bound);
          keepOutOfSafeZones(sh);
          stunned.push(sh.id);
          s.score += T.score.per_stun;
        }
      }
      events.push({ name: 'pulse', data: { stunned_ids: stunned } });
    }

    // 6. shades chase the player, cannot enter lit lanterns' safe radius
    for (const sh of s.shades) {
      if (sh.state === 'stunned') continue;
      const d = hdist(sh.x, sh.z, p.x, p.z);
      if (d > 1e-9) {
        const stepLen = Math.min(T.shade_speed * DT, d);
        sh.x += ((p.x - sh.x) / d) * stepLen;
        sh.z += ((p.z - sh.z) / d) * stepLen;
      }
      clampRadius(sh, WORLD.shade_bound);
      keepOutOfSafeZones(sh);
    }

    // 7. shade touches player -> lose a flame, drop part of carried motes
    if (p.invuln === 0) {
      for (const sh of s.shades) {
        if (sh.state === 'stunned') continue;
        if (hdist(sh.x, sh.z, p.x, p.z) <= T.shade_hit_radius) {
          const dropped = Math.floor(p.carried * T.hit_drop_ratio);
          p.carried -= dropped;
          p.flames = Math.max(0, p.flames - 1);
          p.invuln = secToTicks(T.invuln_s);
          events.push({ name: 'player_hit', data: { by: 'shade', flames: p.flames, dropped } });
          break;
        }
      }
      if (p.flames <= 0) {
        finish(events, 'lost', 'no_flames');
        return events;
      }
    }

    // 8. spawning
    if (s.randomMotes) {
      s.moteTimer++;
      if (s.moteTimer >= WORLD.mote_respawn_ticks) {
        s.moteTimer = 0;
        if (s.motes.length < WORLD.max_motes) addMote(...randomMotePos());
      }
    }
    if (s.randomShades) {
      s.shadeTimer++;
      if (s.shadeTimer >= WORLD.shade_spawn_ticks) {
        s.shadeTimer = 0;
        if (s.shades.length < WORLD.max_shades) {
          const [x, z] = randomShadePos();
          const id = addShade(x, 0, z);
          events.push({ name: 'shade_spawned', data: { id } });
        }
      }
    }

    // 9. end conditions
    if (allLit()) finish(events, 'won', 'all_lit');
    else if (p.flames <= 0) finish(events, 'lost', 'no_flames');
    else if (s.timeLeft <= 1e-9) finish(events, 'lost', 'dawn');
    return events;
  }

  function snapshot() {
    const p = s.player;
    return {
      type: 'snapshot',
      tick: s.steps,
      sim_tick: s.steps,
      state: s.state,
      time_left_s: r3(Math.max(0, s.timeLeft)),
      score: s.score,
      player: { pos: [r3(p.x), r3(p.y), r3(p.z)], flames: p.flames, carried: p.carried },
      lanterns: s.lanterns.map((l) => ({ id: l.id, pos: [r3(l.x), r3(l.y), r3(l.z)], lit: l.lit, deposited: l.deposited })),
      shades: s.shades.map((sh) => ({ id: sh.id, pos: [r3(sh.x), r3(sh.y), r3(sh.z)], state: sh.state })),
      motes_active: s.motes.length,
      motes: s.motes.map((m) => ({ id: m.id, pos: [r3(m.x), 0, r3(m.z)] })),
    };
  }

  return { step, snapshot, state: s, tuning: T };
}
