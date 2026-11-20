// Core game logic for Đảo Đèn Lồng (Test Contract v1.2). Pure JS: no DOM, no Node APIs, no Math.random.
// Used by the headless runner (src/headless.js) and the 3D client (web/main.js).
// Fixed 60 ticks/s. Tick order follows Ticket-02 exactly (see comments "1." ... "12.").
import { mulberry32 } from './rng.js';
import { LEVELS, groundAt, TOWER } from './levels.js';

export const TICK_RATE = 60;
const DT = 1 / TICK_RATE;

// Ticket-02 standard constants that are not contract tuning keys.
export const STD = {
  jump_speed: 7,
  gravity: 20,
  pickup_dy: 1.5,
  hit_dy: 1.5,
  motes_initial: 20,
  motes_cap: 30,
  mote_spawn_every: 240,
  drop_ttl: 480,
  drop_r_min: 1.5,
  drop_r_max: 2.5,
  pulse_center_dy: 0.8,
  pulse_push_ticks: 15,
  detect_r: 12,
  giveup_r: 18,
  recoil_m: 2,
  recoil_ticks: 60,
  evict_ticks: 30,
  shade_first_spawn: 300,
  shade_spawn_min_dist: 15,
  shade_spawning_ticks: 60, // assumption: rises from the fog for 1 s
  shade_hover: 1,
  shade_wander_speed: 1.5, // assumption
  shade_speed_night3: 4.5,
  fall_y: -10,
  fall_wait: 60,
  respawn_invuln: 90,
  drifter_speed: 7,
  drifter_idle_speed: 2,
  drifter_max: 2,
  drifter_every: 1200,
  drifter_hit_r: 1.2,
  drifter_steal: 3,
  drifter_chase_carry: 5,
  drifter_chase_r: 15,
  drifter_flee_ticks: 240,
  drifter_drop_flee_ticks: 120,
  drifter_hover: 1.5,
  charm_ticks: 600,
  charm_respawn: 2700,
  charm_speed: 7.2,
  wind_every: 1800,
  wind_ticks: 300,
  wind_speed: 2,
  drain_r: 2,
  step_up: 0.35, // max height change walked over (ramps); walls are 3 m
};

export function r1(v) {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}
export function r3(v) {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r; // avoid -0
}
const hd = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const idNum = (id) => parseInt(String(id).replace(/^\D+/, ''), 10) || 0;
const byId = (a, b) => idNum(a.id) - idNum(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createSim(tuning, { seed = 0, scenario = null, night = 1 } = {}) {
  const T = tuning;
  const L = LEVELS[night];
  if (!L) throw new Error(`unknown night ${night}`);
  const sc = scenario || {};
  const rng = mulberry32(seed);
  const ticks = (sec) => Math.round(sec * TICK_RATE);
  const ground = (x, z) => groundAt(L, x, z);
  const duration = T[`night${night}_duration_s`];
  // fuel is stored in integer units of 1/60 (one tick of decay) to avoid float drift
  const F = TICK_RATE;
  const FUEL_MAX = Math.round(T.fuel_max * F);
  const FUEL_LOW = Math.round(T.low_fuel_threshold * F);
  const DECAY = Math.round(T.fuel_decay_per_s); // units per tick
  const DRAIN = Math.round(T.drain_per_s);
  const capacity = () => Math.min(T.capacity_max, T.carry_capacity + 2 * s.player.lights);
  const shadeSpeed = night === 3 ? STD.shade_speed_night3 : T.shade_speed;

  const s = {
    night,
    tick: 0,
    simTick: 0,
    state: 'playing',
    paused: false,
    reason: null,
    score: 0,
    timeStart: duration,
    timeLeft: duration,
    player: {
      x: L.start[0], y: L.start[1], z: L.start[2],
      vx: 0, vy: 0, vz: 0,
      grounded: true,
      face: [0, 1], // facing +Z
      flames: T.flames,
      carried: 0,
      invuln: 0, dashCd: 0, pulseCd: 0, charm: 0,
      dash: 0, dashDir: [0, 1],
      launch: null, // [vx, vz] locked until landing
      fallWait: 0,
      lights: 0, // successful lights this night (capacity = 10 + 2 x lights, max 20)
    },
    lanterns: L.lanterns.map((p, i) => ({ id: 'L' + (i + 1), x: p[0], y: p[1], z: p[2], lit: false, deposited: 0, fuel: 0, everLit: false, relit: 0 })),
    motes: [],
    shades: [],
    drifters: [],
    charms: L.charms.map((p, i) => ({ id: 'C' + (i + 1), x: p[0], y: p[1], z: p[2], available: true, respawn: 0 })),
    wind: { active: 0, dir: null },
    nextMote: 1, nextShade: 1, nextDrifter: 1,
    randomMotes: sc.random_motes !== undefined ? sc.random_motes : true,
    randomShades: sc.random_shades !== undefined ? sc.random_shades : true,
    randomDrifters: sc.random_drifters !== undefined ? sc.random_drifters : true,
    windEnabled: sc.wind_enabled !== undefined ? sc.wind_enabled : true,
    prev: { jump: false, interact: false, pulse: false, dash: false, pause: false },
  };
  const P = s.player;

  // ---------- helpers ----------
  const groundOr = (x, z, fallback) => {
    const g = ground(x, z);
    return g === null ? fallback : g;
  };
  const addMote = (x, y, z, kind = 'random', ttl = null, spawnIdx = null) => {
    const m = { id: 'M' + s.nextMote++, x, y, z, kind, ttl, spawnIdx, born: s.simTick };
    s.motes.push(m);
    return m;
  };
  const occupied = () => new Set(s.motes.filter((m) => m.spawnIdx !== null).map((m) => m.spawnIdx));
  const spawnRandomMote = () => {
    const used = occupied();
    const free = L.moteSpawns.map((_, i) => i).filter((i) => !used.has(i));
    if (!free.length) return false;
    const i = free[Math.floor(rng() * free.length)];
    const p = L.moteSpawns[i];
    addMote(p[0], p[1], p[2], 'random', null, i);
    return true;
  };
  const shadeIds = new Set();
  const newShadeId = () => {
    while (shadeIds.has('S' + s.nextShade)) s.nextShade++;
    const id = 'S' + s.nextShade++;
    shadeIds.add(id);
    return id;
  };
  const makeShade = (id, x, y, z, state, left) => {
    const g = ground(x, z);
    const sh = {
      id, x, y, z, state, left: left || 0,
      hover: g === null ? STD.shade_hover : y - g,
      push: 0, pushDir: [1, 0], evict: 0, targetL: null, drainT: 0, evictFrom: null, target: null, wanderT: 0, recoilDir: [1, 0],
    };
    s.shades.push(sh);
    return sh;
  };
  const awakeState = (sh) => (hd(sh.x, sh.z, P.x, P.z) <= STD.detect_r ? 'chase' : 'wander');
  const dropMotes = (n, cx, cy, cz) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * 2 * Math.PI;
      const r = STD.drop_r_min + rng() * (STD.drop_r_max - STD.drop_r_min);
      const x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
      addMote(x, groundOr(x, z, cy), z, 'dropped', STD.drop_ttl);
    }
  };
  const litZones = () => s.lanterns.filter((l) => l.lit && l.fuel >= FUEL_LOW); // fuel < 30 loses its safe zone
  // keep a shade on/outside every lit lantern's safe circle; returns true if it was blocked
  const blockSafe = (sh) => {
    let blocked = false;
    if (!(T.safe_radius > 0)) return false;
    for (const l of litZones()) {
      const d = hd(sh.x, sh.z, l.x, l.z);
      if (d < T.safe_radius - 1e-9) {
        const ux = d > 1e-9 ? (sh.x - l.x) / d : 1, uz = d > 1e-9 ? (sh.z - l.z) / d : 0;
        sh.x = l.x + ux * T.safe_radius;
        sh.z = l.z + uz * T.safe_radius;
        blocked = true;
      }
    }
    if (L.tiers) {
      const d = Math.hypot(sh.x, sh.z);
      if (d < TOWER.r) {
        const ux = d > 1e-9 ? sh.x / d : 1, uz = d > 1e-9 ? sh.z / d : 0;
        sh.x = ux * TOWER.r;
        sh.z = uz * TOWER.r;
        blocked = true;
      }
    }
    return blocked;
  };
  const moveToward = (o, tx, tz, dist) => {
    const d = hd(o.x, o.z, tx, tz);
    if (d < 1e-9) return;
    const k = Math.min(dist, d) / d;
    o.x += (tx - o.x) * k;
    o.z += (tz - o.z) * k;
  };
  const moveAway = (o, fx, fz, dist) => {
    const d = hd(o.x, o.z, fx, fz);
    const ux = d > 1e-9 ? (o.x - fx) / d : 1, uz = d > 1e-9 ? (o.z - fz) / d : 0;
    o.x += ux * dist;
    o.z += uz * dist;
  };
  const followGround = (o, hover) => {
    const g = ground(o.x, o.z);
    if (g !== null && g < TOWER.top) o.y = g + hover;
  };

  // ---------- level setup ----------
  if (sc.player) {
    const p = sc.player;
    if (p.pos) [P.x, P.y, P.z] = p.pos;
    if (p.carried !== undefined) P.carried = p.carried;
    if (p.flames !== undefined) P.flames = p.flames;
    if (p.invuln_ticks !== undefined) P.invuln = p.invuln_ticks;
    if (p.dash_cd_ticks !== undefined) P.dashCd = p.dash_cd_ticks;
    if (p.pulse_cd_ticks !== undefined) P.pulseCd = p.pulse_cd_ticks;
    if (p.charm_ticks !== undefined) P.charm = p.charm_ticks;
    if (p.successful_lights !== undefined) P.lights = p.successful_lights;
    const g = ground(P.x, P.z);
    P.grounded = g !== null && Math.abs(P.y - g) < 1e-6;
  }
  if (sc.time_left_s !== undefined) s.timeStart = s.timeLeft = sc.time_left_s;
  for (const l of sc.lanterns || []) {
    const lan = s.lanterns.find((x) => x.id === l.id);
    if (!lan) continue;
    if (l.pos) [lan.x, lan.y, lan.z] = l.pos;
    if (l.deposited !== undefined) lan.deposited = l.deposited;
    if (l.lit !== undefined) lan.lit = l.lit;
    lan.fuel = lan.lit ? (l.fuel !== undefined ? Math.round(l.fuel * F) : FUEL_MAX) : 0;
    lan.everLit = l.ever_lit !== undefined ? l.ever_lit : lan.lit;
  }
  if (sc.motes) {
    for (const m of sc.motes) {
      const p = Array.isArray(m) ? m : m.pos;
      const dropped = !Array.isArray(m) && m.kind === 'dropped';
      const ttl = !Array.isArray(m) && m.ttl_s !== undefined ? ticks(m.ttl_s) : dropped ? STD.drop_ttl : null;
      const mo = addMote(p[0], p[1], p[2], dropped ? 'dropped' : 'random', dropped ? ttl : null);
      mo.born = -1;
      if (!dropped) {
        const i = L.moteSpawns.findIndex((q) => Math.abs(q[0] - p[0]) < 1e-3 && Math.abs(q[2] - p[2]) < 1e-3);
        if (i >= 0) mo.spawnIdx = i;
      }
    }
  } else if (s.randomMotes) {
    for (let i = 0; i < STD.motes_initial; i++) spawnRandomMote();
  }
  if (sc.shades) {
    for (const sh of sc.shades) if (sh.id) shadeIds.add(sh.id);
    for (const sh of sc.shades) {
      const id = sh.id || newShadeId();
      const o = makeShade(id, sh.pos[0], sh.pos[1], sh.pos[2], 'wander', sh.state_ticks_left);
      o.state = sh.state || awakeState(o);
      if (o.state === 'stunned' && !sh.state_ticks_left) o.left = ticks(T.pulse_stun_s);
      if (o.state === 'recoil') {
        if (!sh.state_ticks_left) o.left = STD.recoil_ticks;
        const d = hd(o.x, o.z, P.x, P.z);
        o.recoilDir = d > 1e-9 ? [(o.x - P.x) / d, (o.z - P.z) / d] : [1, 0];
      }
      if (o.state === 'spawning' && !sh.state_ticks_left) o.left = STD.shade_spawning_ticks;
      if (sh.target_lantern_id) o.targetL = sh.target_lantern_id;
    }
  }
  if (sc.drifters) {
    for (const d of sc.drifters) {
      const id = d.id || 'D' + s.nextDrifter;
      s.nextDrifter = Math.max(s.nextDrifter, idNum(id) + 1);
      s.drifters.push({ id, x: d.pos[0], y: d.pos[1], z: d.pos[2], state: d.state || 'idle', stolen: d.stolen || 0, left: d.state_ticks_left || (d.state === 'flee' ? STD.drifter_flee_ticks : 0), target: null, stole: (d.stolen || 0) > 0 });
    }
  }
  if (sc.charms) {
    s.charms = sc.charms.map((c, i) => {
      const def = L.charms[idNum(c.id) - 1] || [0, 0, 0];
      const p = c.pos || def;
      const respawn = c.respawn_ticks !== undefined ? c.respawn_ticks : 0;
      return { id: c.id || 'C' + (i + 1), x: p[0], y: p[1], z: p[2], available: c.available !== undefined ? c.available : respawn === 0, respawn };
    });
  }
  s.shades.sort(byId);
  s.drifters.sort(byId);

  // ---------- one tick ----------
  function step(input = {}) {
    const events = [];
    if (s.state === 'won' || s.state === 'lost') return events;
    s.tick++;
    const inp = {
      move: input.move || [0, 0],
      cam: input.cam_yaw_deg || 0,
      jump: !!input.jump, interact: !!input.interact, pulse: !!input.pulse, dash: !!input.dash, pause: !!input.pause,
    };
    const edge = {};
    for (const k of Object.keys(s.prev)) edge[k] = inp[k] && !s.prev[k];
    s.prev = { jump: inp.jump, interact: inp.interact, pulse: inp.pulse, dash: inp.dash, pause: inp.pause };

    // 1. input: pause first
    if (edge.pause) {
      s.paused = !s.paused;
      events.push({ name: s.paused ? 'paused' : 'resumed', data: {} });
      if (s.paused) {
        s.state = 'paused';
        return events;
      }
      s.state = 'playing';
    }
    if (s.paused) return events;

    // 2. counters
    s.simTick++;
    s.timeLeft = s.timeStart - s.simTick / TICK_RATE;
    if (P.dashCd > 0) P.dashCd--;
    if (P.pulseCd > 0) P.pulseCd--;
    if (P.invuln > 0) P.invuln--;
    if (P.charm > 0) P.charm--;
    for (const sh of s.shades) {
      if (sh.left > 0 && --sh.left === 0) sh.state = sh.state === 'stunned' ? 'wander' : awakeState(sh);
    }
    for (let i = s.motes.length - 1; i >= 0; i--) {
      const m = s.motes[i];
      if (m.ttl !== null && --m.ttl <= 0) s.motes.splice(i, 1);
    }
    for (const dr of s.drifters) if (dr.state === 'flee' && --dr.left <= 0) dr.state = 'removed';
    for (const c of s.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
    if (s.wind.active > 0 && --s.wind.active === 0) s.wind.dir = null;
    // fuel: decay 1/s + 5/s per draining shade (integer 1/60 units)
    for (const l of s.lanterns) {
      if (!l.lit) continue;
      const drainers = s.shades.filter((sh) => sh.state === 'drain' && sh.targetL === l.id).length;
      l.fuel -= DECAY + DRAIN * drainers;
    }
    for (const sh of s.shades) {
      if (sh.state !== 'drain') continue;
      const l = s.lanterns.find((x) => x.id === sh.targetL);
      if (++sh.drainT % TICK_RATE === 0) events.push({ name: 'fuel_drain', data: { lantern_id: l.id, shade_id: sh.id, fuel: r1(Math.max(0, l.fuel) / F) } });
    }
    // right after step 2: lanterns with fuel <= 0 go out
    for (const l of s.lanterns) {
      if (l.lit && l.fuel <= 0) {
        l.lit = false;
        l.fuel = 0;
        l.deposited = 0;
        events.push({ name: 'lantern_out', data: { lantern_id: l.id } });
        for (const sh of s.shades) if (sh.state === 'drain' && sh.targetL === l.id) sh.state = 'wander';
      }
    }

    // 3. move Mây (jump, dash, pads, wind), then fall check
    movePlayer(inp, edge, events);

    // 4. pick up motes and charms
    if (P.fallWait === 0) {
      for (let i = 0; i < s.motes.length && P.carried < capacity(); ) {
        const m = s.motes[i];
        if (m.born < s.simTick && hd(P.x, P.z, m.x, m.z) <= T.pickup_radius && Math.abs(P.y - m.y) <= STD.pickup_dy) {
          s.motes.splice(i, 1);
          P.carried++;
          events.push({ name: 'mote_picked', data: { carried: P.carried } });
        } else i++;
      }
      for (const c of s.charms) {
        if (c.available && hd(P.x, P.z, c.x, c.z) <= T.pickup_radius && Math.abs(P.y - c.y) <= STD.pickup_dy) {
          c.available = false;
          c.respawn = STD.charm_respawn;
          P.charm = STD.charm_ticks;
          events.push({ name: 'charm_picked', data: { charm_id: c.id, charm_ticks: P.charm } });
        }
      }
    }

    // 5. interact: nearest lantern that can take light (unlit, or lit and not full), tie -> smaller id
    if (edge.interact && P.carried > 0 && P.fallWait === 0) {
      const used = (l) => Math.min(P.carried, Math.ceil((FUEL_MAX - l.fuel) / (T.fuel_per_mote * F)));
      let best = null, bestD = Infinity;
      for (const l of s.lanterns) {
        if (l.lit && used(l) <= 0) continue; // full lantern is not selectable
        const d = hd(P.x, P.z, l.x, l.z);
        if (d <= T.interact_radius && (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && idNum(l.id) < idNum(best.id)))) {
          best = l;
          bestD = d;
        }
      }
      if (best && best.lit) {
        const n = used(best);
        best.fuel = Math.min(FUEL_MAX, best.fuel + n * T.fuel_per_mote * F);
        P.carried -= n;
        s.score += T.score.per_mote * n;
        events.push({ name: 'refuel', data: { lantern_id: best.id, amount: n, fuel: r1(best.fuel / F) } });
      } else if (best) {
        const cost = best.everLit ? T.relight_cost : T.lantern_cost;
        const amount = Math.min(P.carried, Math.max(0, cost - best.deposited));
        if (amount > 0) {
          P.carried -= amount;
          best.deposited += amount;
          s.score += T.score.per_mote * amount;
          events.push({ name: 'deposit', data: { lantern_id: best.id, amount, deposited: best.deposited } });
        }
        if (best.deposited >= cost) {
          const relight = best.everLit;
          best.lit = true;
          best.everLit = true;
          best.fuel = FUEL_MAX;
          if (relight) best.relit++;
          P.lights++;
          s.score += relight ? T.score.per_relight : T.score.per_lantern;
          events.push({ name: 'lantern_lit', data: { lantern_id: best.id, relight } });
        }
      }
    }

    // 6. safe zones: shades caught inside a lit zone are pushed to its edge within 30 ticks, harmless meanwhile
    for (const l of litZones()) {
      for (const sh of s.shades) {
        if (sh.evict > 0) continue;
        if (hd(sh.x, sh.z, l.x, l.z) < T.safe_radius - 1e-9) {
          sh.evict = STD.evict_ticks;
          sh.evictFrom = l;
          if (sh.state === 'drain') sh.state = 'wander'; // refuelled to >= 30
        }
      }
    }

    // 7. pulse (Tỏa Sáng)
    if (edge.pulse && P.pulseCd === 0 && P.carried >= T.pulse_cost && P.fallWait === 0) {
      P.carried -= T.pulse_cost;
      P.pulseCd = ticks(T.pulse_cooldown_s);
      const cy = P.y + STD.pulse_center_dy;
      const stunned = [];
      for (const sh of s.shades) {
        if (Math.hypot(sh.x - P.x, sh.y - cy, sh.z - P.z) <= T.pulse_radius) {
          const d = hd(sh.x, sh.z, P.x, P.z);
          sh.pushDir = d > 1e-9 ? [(sh.x - P.x) / d, (sh.z - P.z) / d] : [1, 0];
          s.score += sh.state === 'drain' ? T.score.per_stun_drain : T.score.per_stun;
          sh.state = 'stunned';
          sh.left = ticks(T.pulse_stun_s);
          sh.push = STD.pulse_push_ticks;
          stunned.push(sh.id);
        }
      }
      for (const dr of s.drifters) {
        if (dr.state === 'removed') continue;
        if (Math.hypot(dr.x - P.x, dr.y - cy, dr.z - P.z) > T.pulse_radius) continue;
        if (dr.state === 'chase' || dr.state === 'idle') {
          if (dr.state === 'chase') {
            dr.state = 'flee';
            dr.left = STD.drifter_flee_ticks;
          }
        } else if (dr.state === 'flee' && dr.stolen > 0) {
          const n = dr.stolen;
          dropMotes(n, dr.x, groundOr(dr.x, dr.z, P.y), dr.z);
          dr.stolen = 0;
          dr.left = STD.drifter_drop_flee_ticks;
          events.push({ name: 'drifter_drop', data: { drifter_id: dr.id, amount: n } });
        }
      }
      events.push({ name: 'pulse', data: { stunned_ids: stunned } });
    }

    // 8. move shades and drifters
    for (const sh of s.shades) moveShade(sh);
    for (const dr of s.drifters) moveDrifter(dr);

    // 9. contacts: drifters steal first, then shades hit (ascending id)
    if (P.fallWait === 0) {
      for (const dr of s.drifters) {
        if (dr.state !== 'chase' || dr.stole || P.carried <= 0) continue;
        if (hd(dr.x, dr.z, P.x, P.z) <= STD.drifter_hit_r) {
          const amount = Math.min(STD.drifter_steal, P.carried);
          P.carried -= amount;
          dr.stolen = amount;
          dr.stole = true;
          dr.state = 'flee';
          dr.left = STD.drifter_flee_ticks;
          events.push({ name: 'drifter_steal', data: { drifter_id: dr.id, amount, carried: P.carried } });
        }
      }
      for (const sh of s.shades) {
        if ((sh.state !== 'chase' && sh.state !== 'wander') || sh.evict > 0) continue;
        if (hd(sh.x, sh.z, P.x, P.z) > T.shade_hit_radius || Math.abs(sh.y - P.y) > STD.hit_dy) continue;
        if (P.invuln > 0) continue; // touching while invulnerable does nothing
        const dropped = Math.floor(P.carried * T.hit_drop_ratio);
        P.carried -= dropped;
        dropMotes(dropped, P.x, groundOr(P.x, P.z, P.y), P.z);
        P.flames = Math.max(0, P.flames - 1);
        P.invuln = ticks(T.invuln_s);
        const d = hd(sh.x, sh.z, P.x, P.z);
        sh.recoilDir = d > 1e-9 ? [(sh.x - P.x) / d, (sh.z - P.z) / d] : [1, 0];
        sh.state = 'recoil';
        sh.left = STD.recoil_ticks + 1; // hit happens after movement: recoil moves on the next 60 ticks
        events.push({ name: 'player_hit', data: { by: 'shade', flames: P.flames, dropped } });
        break; // at most one flame per tick
      }
    }

    // 10. scheduled spawns (new entities interact from the next tick)
    if (s.randomMotes && s.simTick % STD.mote_spawn_every === 0 && s.motes.length < STD.motes_cap) spawnRandomMote();
    if (s.randomShades) {
      let n = 0;
      if (s.simTick === STD.shade_first_spawn) n = 2;
      else if (s.simTick > STD.shade_first_spawn && (s.simTick - STD.shade_first_spawn) % L.shadeEvery === 0) n = 1;
      for (let k = 0; k < n && s.shades.length < L.shadeMax; k++) {
        const busy = new Set(s.shades.map((x) => x.spawnIdx));
        const ok = L.shadeSpawns.map((p, i) => i).filter((i) => !busy.has(i) && hd(L.shadeSpawns[i][0], L.shadeSpawns[i][2], P.x, P.z) >= STD.shade_spawn_min_dist);
        if (!ok.length) break;
        const i = ok[Math.floor(rng() * ok.length)];
        const p = L.shadeSpawns[i];
        const g = groundOr(p[0], p[2], 0);
        const sh = makeShade(newShadeId(), p[0], g + STD.shade_hover, p[2], 'spawning', STD.shade_spawning_ticks);
        sh.spawnIdx = i;
        events.push({ name: 'shade_spawned', data: { id: sh.id } });
      }
    }
    if (L.drifters && s.randomDrifters && s.simTick % STD.drifter_every === 0) {
      const alive = s.drifters.filter((d) => d.state !== 'removed').length;
      if (alive < STD.drifter_max) {
        const p = L.shadeSpawns[Math.floor(rng() * L.shadeSpawns.length)];
        const id = 'D' + s.nextDrifter++;
        s.drifters.push({ id, x: p[0], y: groundOr(p[0], p[2], 0) + STD.drifter_hover, z: p[2], state: 'idle', stolen: 0, left: 0, target: null, stole: false });
      }
    }
    if (L.wind && s.windEnabled && s.simTick % STD.wind_every === 0) {
      s.wind.active = STD.wind_ticks;
      s.wind.dir = Math.floor(rng() * 360);
    }

    // 11. win / lose
    // no early win any more: at dawn, alive and lit >= ceil(win_ratio x total)
    if (P.flames <= 0) finish(events, 'lost', 'no_flames');
    else if (s.timeLeft <= 1e-9) {
      const lit = s.lanterns.filter((l) => l.lit).length;
      if (lit >= Math.ceil(T.win_ratio * s.lanterns.length - 1e-9)) finish(events, 'won', 'dawn_survived');
      else finish(events, 'lost', 'dawn');
    }
    return events;
  }

  function finish(events, result, reason) {
    s.state = result;
    s.reason = reason;
    if (result === 'won') {
      for (const l of s.lanterns) if (l.lit) s.score += T.score.per_lantern_at_dawn + Math.floor(l.fuel / F);
      s.score += T.score.per_flame_left * P.flames;
    }
    events.push({ name: 'game_over', data: { result, reason } });
  }

  function movePlayer(inp, edge, events) {
    if (P.fallWait > 0) {
      if (--P.fallWait === 0 && P.flames > 0) {
        [P.x, P.y, P.z] = L.start;
        P.vx = P.vy = P.vz = 0;
        P.grounded = true;
        P.launch = null;
        P.dash = 0;
        P.invuln = STD.respawn_invuln;
      }
      return;
    }
    // desired horizontal velocity (instant accel/stop: <= 0.1 s)
    let [mx, mz] = inp.move;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const th = (inp.cam * Math.PI) / 180;
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    const moving = Math.hypot(wx, wz) > 1e-9;
    if (moving) {
      const l = Math.hypot(wx, wz);
      P.face = [wx / l, wz / l];
    }
    // dash: edge-triggered, cooldown counted from start; with charm no cooldown but presses during a dash are ignored
    if (edge.dash && P.dash === 0 && (P.dashCd === 0 || P.charm > 0)) {
      P.dash = ticks(T.dash_duration_s);
      P.dashCd = ticks(T.dash_cooldown_s);
      P.dashDir = moving ? [...P.face] : [...P.face];
      events.push({ name: 'dash', data: {} });
    }
    const speed = P.charm > 0 ? STD.charm_speed : T.player_speed;
    let hx, hz;
    if (P.dash > 0) {
      hx = P.dashDir[0] * T.dash_speed;
      hz = P.dashDir[1] * T.dash_speed;
    } else if (P.launch) {
      [hx, hz] = P.launch;
    } else {
      hx = wx * speed;
      hz = wz * speed;
    }
    if (s.wind.active > 0) {
      const a = (s.wind.dir * Math.PI) / 180;
      hx += Math.cos(a) * STD.wind_speed;
      hz += Math.sin(a) * STD.wind_speed;
    }
    if (edge.jump && P.grounded && P.dash === 0) {
      P.vy = STD.jump_speed;
      P.grounded = false;
    }
    // horizontal move with wall blocking (axis-separated sliding)
    const ox = P.x, oz = P.z;
    const canStand = (x, z) => {
      const g = ground(x, z);
      return g === null || g <= P.y + STD.step_up;
    };
    let nx = P.x + hx * DT, nz = P.z + hz * DT;
    if (!canStand(nx, nz)) {
      if (canStand(nx, P.z)) nz = P.z;
      else if (canStand(P.x, nz)) nx = P.x;
      else { nx = P.x; nz = P.z; }
    }
    P.x = nx;
    P.z = nz;
    // vertical
    const g = ground(P.x, P.z);
    if (P.dash > 0) {
      P.dash--;
      P.vy = 0; // dash keeps height
      if (g !== null && P.y - g <= STD.step_up && P.y >= g - STD.step_up) { P.y = g; P.grounded = true; }
      else P.grounded = false;
    } else if (P.grounded && P.vy <= 0 && g !== null && P.y - g <= STD.step_up && P.y - g >= -STD.step_up) {
      P.y = g; // walk over ramps / small steps
      P.vy = 0;
    } else {
      P.grounded = false;
      P.vy -= STD.gravity * DT;
      P.y += P.vy * DT;
      if (g !== null && P.y <= g && P.vy <= 0 && P.y > g - 1) {
        P.y = g;
        P.vy = 0;
        P.grounded = true;
        P.launch = null;
      }
    }
    P.vx = (P.x - ox) / DT;
    P.vz = (P.z - oz) / DT;
    // jump pads
    if (P.grounded) {
      for (const pad of L.pads) {
        if (hd(P.x, P.z, pad.pos[0], pad.pos[2]) <= 1 && Math.abs(P.y - pad.pos[1]) < 0.05) {
          let dx, dz;
          if (pad.target) {
            const d = hd(pad.target[0], pad.target[1], P.x, P.z);
            dx = (pad.target[0] - P.x) / d;
            dz = (pad.target[1] - P.z) / d;
          } else [dx, dz] = pad.dir;
          P.launch = [dx * pad.speed, dz * pad.speed];
          P.vy = pad.vy;
          P.grounded = false;
          break;
        }
      }
    }
    // fall off the island
    if (P.y < STD.fall_y) {
      const lost = P.carried;
      P.carried = 0;
      P.flames = Math.max(0, P.flames - 1);
      P.fallWait = STD.fall_wait;
      P.vx = P.vy = P.vz = 0;
      P.launch = null;
      P.dash = 0;
      P.y = STD.fall_y;
      events.push({ name: 'player_hit', data: { by: 'fall', flames: P.flames, dropped: 0, lost } });
    }
  }

  function moveShade(sh) {
    if (sh.evict > 0) {
      const l = sh.evictFrom;
      const d = hd(sh.x, sh.z, l.x, l.z);
      const need = T.safe_radius - d;
      moveAway(sh, l.x, l.z, Math.max(need / sh.evict, 0));
      if (--sh.evict === 0 || hd(sh.x, sh.z, l.x, l.z) >= T.safe_radius - 1e-9) sh.evict = 0;
      followGround(sh, sh.hover);
      return;
    }
    const dist = hd(sh.x, sh.z, P.x, P.z);
    if (sh.state === 'stunned') {
      if (sh.push > 0) {
        sh.push--;
        sh.x += (sh.pushDir[0] * T.pulse_push_m) / STD.pulse_push_ticks;
        sh.z += (sh.pushDir[1] * T.pulse_push_m) / STD.pulse_push_ticks;
        if (blockSafe(sh)) sh.push = 0; // stops at obstacles
      }
    } else if (sh.state === 'recoil') {
      sh.x += (sh.recoilDir[0] * STD.recoil_m) / STD.recoil_ticks;
      sh.z += (sh.recoilDir[1] * STD.recoil_m) / STD.recoil_ticks;
      blockSafe(sh);
    } else if (sh.state === 'drain') {
      const l = s.lanterns.find((x) => x.id === sh.targetL);
      if (dist <= T.safe_radius) sh.state = 'chase';
      else if (!l || !l.lit || l.fuel >= FUEL_LOW || hd(sh.x, sh.z, l.x, l.z) > STD.drain_r) sh.state = 'wander';
      // draining shades stand still
    } else if (sh.state === 'chase' || sh.state === 'wander') {
      if (sh.state === 'chase' && dist > STD.giveup_r) sh.state = 'wander';
      else if (sh.state === 'wander' && dist <= STD.detect_r) sh.state = 'chase';
      const goal = sh.state === 'wander' ? wanderLantern(sh) : null;
      if (sh.state === 'chase') moveToward(sh, P.x, P.z, shadeSpeed * DT);
      else if (goal) {
        sh.targetL = goal.id;
        if (goal.lit && hd(sh.x, sh.z, goal.x, goal.z) <= STD.drain_r) {
          sh.state = 'drain';
          sh.drainT = 0;
        } else if (hd(sh.x, sh.z, goal.x, goal.z) > STD.drain_r) moveToward(sh, goal.x, goal.z, shadeSpeed * DT);
      } else {
        if (!sh.target || sh.wanderT <= 0 || hd(sh.x, sh.z, sh.target[0], sh.target[1]) < 0.2) {
          const a = rng() * 2 * Math.PI, r = 2 + rng() * 6;
          sh.target = [sh.x + r * Math.cos(a), sh.z + r * Math.sin(a)];
          sh.wanderT = 180;
        }
        sh.wanderT--;
        moveToward(sh, sh.target[0], sh.target[1], STD.shade_wander_speed * DT);
      }
      blockSafe(sh);
    }
    followGround(sh, sh.hover);
  }

  // wander goal: nearest lit lantern with fuel < 30, else nearest unlit lantern (tie -> smaller id)
  function wanderLantern(sh) {
    const pick = (list) => {
      let best = null, bd = Infinity;
      for (const l of list) {
        const d = hd(sh.x, sh.z, l.x, l.z);
        if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && idNum(l.id) < idNum(best.id))) { best = l; bd = d; }
      }
      return best;
    };
    return pick(s.lanterns.filter((l) => l.lit && l.fuel < FUEL_LOW)) || pick(s.lanterns.filter((l) => !l.lit));
  }

  function moveDrifter(dr) {
    if (dr.state === 'removed') return;
    const dist = hd(dr.x, dr.z, P.x, P.z);
    const wants = P.carried >= STD.drifter_chase_carry && dist <= STD.drifter_chase_r && P.fallWait === 0;
    if (dr.state === 'idle' && wants && !dr.stole) dr.state = 'chase';
    else if (dr.state === 'chase' && !wants) dr.state = 'idle';
    if (dr.state === 'chase') moveToward(dr, P.x, P.z, STD.drifter_speed * DT);
    else if (dr.state === 'flee') {
      moveAway(dr, P.x, P.z, STD.drifter_speed * DT);
    } else {
      if (!dr.target || hd(dr.x, dr.z, dr.target[0], dr.target[1]) < 0.2) {
        const a = rng() * 2 * Math.PI, r = 3 + rng() * 8;
        dr.target = [dr.x + r * Math.cos(a), dr.z + r * Math.sin(a)];
      }
      moveToward(dr, dr.target[0], dr.target[1], STD.drifter_idle_speed * DT);
    }
    followGround(dr, STD.drifter_hover);
  }

  function snapshot() {
    const v = (a) => a.map(r3);
    return {
      type: 'snapshot',
      tick: s.tick,
      sim_tick: s.simTick,
      night: s.night,
      state: s.state,
      time_left_s: r3(Math.max(0, s.timeLeft)),
      score: s.score,
      wind: { active: s.wind.active > 0, dir_deg: s.wind.active > 0 ? s.wind.dir : null },
      player: {
        pos: v([P.x, P.y, P.z]),
        vel: v([P.vx, P.vy, P.vz]),
        grounded: P.grounded,
        invuln: P.invuln > 0,
        flames: P.flames,
        carried: P.carried,
        capacity: capacity(),
        dash_cd_s: r3(P.dashCd / TICK_RATE),
        pulse_cd_s: r3(P.pulseCd / TICK_RATE),
        charm_s: r3(P.charm / TICK_RATE),
      },
      lanterns: s.lanterns.map((l) => ({ id: l.id, pos: v([l.x, l.y, l.z]), lit: l.lit, deposited: l.deposited, fuel: l.lit ? r1(l.fuel / F) : 0, ever_lit: l.everLit, relit_count: l.relit })),
      shades: s.shades.map((sh) => ({ id: sh.id, pos: v([sh.x, sh.y, sh.z]), state: sh.state })),
      motes_active: s.motes.length,
      motes: s.motes.map((m) => ({ id: m.id, pos: v([m.x, m.y, m.z]), kind: m.kind, ttl_s: m.ttl === null ? null : r3(m.ttl / TICK_RATE) })),
      drifters: s.drifters.map((d) => ({ id: d.id, pos: v([d.x, d.y, d.z]), state: d.state, stolen: d.stolen })),
      charms: s.charms.map((c) => ({ id: c.id, pos: v([c.x, c.y, c.z]), available: c.available, respawn_s: r3(c.respawn / TICK_RATE) })),
    };
  }

  return { step, snapshot, state: s, tuning: T, level: L };
}
