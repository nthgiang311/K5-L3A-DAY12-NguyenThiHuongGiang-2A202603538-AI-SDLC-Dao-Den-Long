// Validation of --inputs / --scenario files. Throws FormatError (headless exits with code 2).
export class FormatError extends Error {}
const SHADE_STATES = ['spawning', 'wander', 'chase', 'recoil', 'stunned'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(isNum);
const isNonNegInt = (v) => Number.isInteger(v) && v >= 0;
function need(cond, msg) {
  if (!cond) throw new FormatError(msg);
}

export function validateInputs(doc) {
  need(isObj(doc), 'inputs: root must be an object');
  need(Array.isArray(doc.frames), 'inputs: "frames" must be an array');
  let last = -1;
  doc.frames.forEach((f, i) => {
    need(isObj(f), `inputs: frames[${i}] must be an object`);
    need(isNonNegInt(f.tick), `inputs: frames[${i}].tick must be a non-negative integer`);
    need(f.tick > last, `inputs: frames[${i}].tick must be strictly increasing`);
    last = f.tick;
    if ('move' in f) {
      need(isVec(f.move, 2), `inputs: frames[${i}].move must be [x, z]`);
      need(f.move.every((c) => c >= -1 && c <= 1), `inputs: frames[${i}].move components must be in [-1, 1]`);
    }
    if ('cam_yaw_deg' in f) need(isNum(f.cam_yaw_deg), `inputs: frames[${i}].cam_yaw_deg must be a number`);
    for (const k of ['jump', 'interact', 'pulse', 'dash', 'pause']) {
      if (k in f) need(typeof f[k] === 'boolean', `inputs: frames[${i}].${k} must be boolean`);
    }
  });
  return doc;
}

export function validateScenario(doc) {
  need(isObj(doc), 'scenario: root must be an object');
  if ('player' in doc) {
    const p = doc.player;
    need(isObj(p), 'scenario: player must be an object');
    if ('pos' in p) need(isVec(p.pos, 3), 'scenario: player.pos must be [x, y, z]');
    if ('carried' in p) need(isNonNegInt(p.carried), 'scenario: player.carried must be a non-negative integer');
    if ('flames' in p) need(isNonNegInt(p.flames), 'scenario: player.flames must be a non-negative integer');
    for (const k of ['invuln_ticks', 'dash_cd_ticks', 'pulse_cd_ticks', 'charm_ticks']) {
      if (k in p) need(isNonNegInt(p[k]), `scenario: player.${k} must be a non-negative integer`);
    }
  }
  for (const k of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) {
    if (k in doc) need(typeof doc[k] === 'boolean', `scenario: ${k} must be boolean`);
  }
  if ('motes' in doc) {
    need(Array.isArray(doc.motes), 'scenario: motes must be an array');
    doc.motes.forEach((m, i) =>
      need(isVec(m, 3) || (isObj(m) && isVec(m.pos, 3)), `scenario: motes[${i}] must be [x, y, z]`)
    );
  }
  if ('shades' in doc) {
    need(Array.isArray(doc.shades), 'scenario: shades must be an array');
    const ids = new Set();
    doc.shades.forEach((s, i) => {
      need(isObj(s) && isVec(s.pos, 3), `scenario: shades[${i}].pos must be [x, y, z]`);
      if ('id' in s) {
        need(typeof s.id === 'string' && s.id.length > 0, `scenario: shades[${i}].id must be a string`);
        need(!ids.has(s.id), `scenario: duplicate shade id ${s.id}`);
        ids.add(s.id);
      }
      if ('state' in s) need(SHADE_STATES.includes(s.state), `scenario: shades[${i}].state must be one of ${SHADE_STATES}`);
      if ('state_ticks_left' in s) need(isNonNegInt(s.state_ticks_left), `scenario: shades[${i}].state_ticks_left must be a non-negative integer`);
    });
  }
  if ('drifters' in doc) {
    need(Array.isArray(doc.drifters), 'scenario: drifters must be an array');
    doc.drifters.forEach((d, i) => {
      need(isObj(d) && isVec(d.pos, 3), `scenario: drifters[${i}].pos must be [x, y, z]`);
      if ('id' in d) need(typeof d.id === 'string', `scenario: drifters[${i}].id must be a string`);
      if ('state' in d) need(['idle', 'chase', 'flee', 'removed'].includes(d.state), `scenario: drifters[${i}].state invalid`);
      if ('stolen' in d) need(isNonNegInt(d.stolen), `scenario: drifters[${i}].stolen must be a non-negative integer`);
    });
  }
  if ('charms' in doc) {
    need(Array.isArray(doc.charms), 'scenario: charms must be an array');
    doc.charms.forEach((c, i) => {
      need(isObj(c), `scenario: charms[${i}] must be an object`);
      if ('id' in c) need(typeof c.id === 'string', `scenario: charms[${i}].id must be a string`);
      if ('pos' in c) need(isVec(c.pos, 3), `scenario: charms[${i}].pos must be [x, y, z]`);
      if ('available' in c) need(typeof c.available === 'boolean', `scenario: charms[${i}].available must be boolean`);
      if ('respawn_ticks' in c) need(isNonNegInt(c.respawn_ticks), `scenario: charms[${i}].respawn_ticks must be a non-negative integer`);
    });
  }
  if ('lanterns' in doc) {
    need(Array.isArray(doc.lanterns), 'scenario: lanterns must be an array');
    doc.lanterns.forEach((l, i) => {
      need(isObj(l) && typeof l.id === 'string', `scenario: lanterns[${i}].id must be a string`);
      if ('pos' in l) need(isVec(l.pos, 3), `scenario: lanterns[${i}].pos must be [x, y, z]`);
      if ('deposited' in l) need(isNonNegInt(l.deposited), `scenario: lanterns[${i}].deposited must be a non-negative integer`);
      if ('lit' in l) need(typeof l.lit === 'boolean', `scenario: lanterns[${i}].lit must be boolean`);
    });
  }
  if ('time_left_s' in doc) need(isNum(doc.time_left_s) && doc.time_left_s >= 0, 'scenario: time_left_s must be a number >= 0');
  return doc;
}

// Expand sparse input frames into a per-tick lookup (fields persist until changed).
export function makeInputReader(doc) {
  const frames = doc ? doc.frames : [];
  const cur = { move: [0, 0], cam_yaw_deg: 0, jump: false, interact: false, pulse: false, dash: false, pause: false };
  let idx = 0;
  return function inputAt(tick) {
    while (idx < frames.length && frames[idx].tick <= tick) {
      const f = frames[idx++];
      for (const k of Object.keys(cur)) if (k in f) cur[k] = f[k];
    }
    return { ...cur, move: [...cur.move] };
  };
}
