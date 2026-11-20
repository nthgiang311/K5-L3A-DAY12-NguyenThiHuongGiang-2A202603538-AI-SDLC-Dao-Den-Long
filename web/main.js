// 3D client: menus, 3-night flow, HUD and rendering around the shared simulation (src/sim/sim.js).
// The sim runs at a fixed 60 ticks/s; this file only maps keyboard/mouse -> contract input and draws state.
import * as THREE from 'three';
import { createSim, TICK_RATE, STD } from '/src/sim/sim.js';
import { LEVELS, TOWER } from '/src/sim/levels.js';
import { sfx, setVolume, unlock, startMusic, stopMusic } from '/web/audio.js';

const tuning = (await (await fetch('/game.contract.json')).json()).tuning;

// ---------- standard palette (Ticket-02) ----------
const C = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  litLamp: 0xffb347, core: 0xffe9b0, offLamp: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shade: 0x120a1a, shadeRim: 0x7a3cff, shadeStun: 0x3a3450, shirt: 0xe8e2d0, scarf: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8,
};
const INTRO = {
  1: 'Ông Đăng: "Mây à, sương đen tràn qua Đảo Bến rồi. Thắp đèn và châm dầu cho chúng — giữ ít nhất ba ngọn sáng tới bình minh nhé."',
  2: 'Ông Đăng: "Đảo Cau có hai nửa, nối bằng cây cầu tre. Coi chừng Gió Lạc — chúng thích cướp đom đóm của con. Bục nhảy sẽ đưa con qua đảo bên kia."',
  3: 'Ông Đăng: "Đảo Chuông cao ba tầng, gió mạnh thổi từng cơn. Leo dốc lên tầng giữa, bục nhảy đưa con lên tháp chuông. Đây là đêm cuối rồi!"',
};

// ---------- settings (persisted) ----------
const settings = Object.assign({ vol: 0.6, sens: 0.3, cb: false }, JSON.parse(localStorage.getItem('ddl-settings') || '{}'));
const saveSettings = () => localStorage.setItem('ddl-settings', JSON.stringify(settings));
setVolume(settings.vol);
const $ = (id) => document.getElementById(id);
$('set-vol').value = settings.vol;
$('set-sens').value = settings.sens;
$('set-vol').oninput = (e) => { settings.vol = +e.target.value; setVolume(settings.vol); saveSettings(); };
$('set-sens').oninput = (e) => { settings.sens = +e.target.value; saveSettings(); };
// colour-blind palette: shade rim/eyes #7A3CFF -> #00B3FF, UI danger #FF5A5F -> #FFFFFF + ⚠ (CSS), unlit lanterns deflated + torn
$('set-cb').checked = settings.cb;
const applyCb = () => {
  document.body.classList.toggle('cb', settings.cb);
  rimMat.color.setHex(settings.cb ? 0x00b3ff : C.shadeRim);
  eyeMat.color.setHex(settings.cb ? 0x00b3ff : 0xffffff);
};
$('set-cb').onchange = (e) => { settings.cb = e.target.checked; saveSettings(); applyCb(); };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.FogExp2(C.fog, 0.03);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const ambient = new THREE.AmbientLight(0xfff0e0, 0.15);
const moon = new THREE.DirectionalLight(0x8090ff, 0.4);
moon.position.set(-30, 60, -20);
scene.add(ambient, moon);
const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ color: C.sea, roughness: 1 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -12;
scene.add(sea);

const mat = (color, emissive = 0, ei = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.85, ...extra });

// ---------- level geometry ----------
let levelGroup = null;
function buildLevel(L) {
  if (levelGroup) scene.remove(levelGroup);
  levelGroup = new THREE.Group();
  const grass = mat(C.grass), sand = mat(C.sand), wood = mat(C.wood);
  for (const isl of L.islands) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r, 0.4, 64), grass);
    top.position.set(isl.c[0], -0.2, isl.c[1]);
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(isl.r - 0.2, isl.r * 0.7, 5, 48), sand);
    cliff.position.set(isl.c[0], -2.9, isl.c[1]);
    levelGroup.add(top, cliff);
  }
  for (const b of L.bridges) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.3, b.z1 - b.z0), wood);
    br.position.set((b.x0 + b.x1) / 2, -0.15, (b.z0 + b.z1) / 2);
    levelGroup.add(br);
  }
  if (L.tiers) {
    // tier 1: half annulus 12-24 m on the z > 0 half, Y 0..3
    const sh = new THREE.Shape();
    sh.absarc(0, 0, 24, Math.PI, 2 * Math.PI, false);
    sh.absarc(0, 0, 12, 2 * Math.PI, Math.PI, true);
    const t1 = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false, curveSegments: 32 }), grass);
    t1.rotation.x = -Math.PI / 2;
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 48), grass);
    t2.position.y = 3;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(TOWER.r, TOWER.r, 8, 24), wood);
    tower.position.y = 10;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.5, 8), mat(0x6a2a1a));
    roof.position.y = 15.2;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(C.gold, C.gold, 0.3));
    bell.position.y = 13.4;
    levelGroup.add(t1, t2, tower, roof, bell);
    for (const deg of [30, 150]) {
      const g = new THREE.Group();
      g.rotation.y = -(deg * Math.PI) / 180;
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.3, 3), sand);
      ramp.position.set(27, 1.5, 0);
      ramp.rotation.z = -Math.atan2(3, 6);
      g.add(ramp);
      levelGroup.add(g);
    }
  }
  for (const pad of L.pads) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.15, 24), mat(C.scarf, C.gold, 0.6));
    p.position.set(pad.pos[0], pad.pos[1] + 0.08, pad.pos[2]);
    levelGroup.add(p);
  }
  scene.add(levelGroup);
}

// ---------- entity meshes ----------
function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 12), mat(C.shirt));
  body.position.y = 0.65;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 16), mat(C.scarf));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(0xffe0c0));
  head.position.y = 1.38;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.38, 24), mat(C.sand));
  hat.position.y = 1.7;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat(C.litLamp, C.litLamp, 2));
  lamp.position.set(0.55, 1.15, 0);
  const light = new THREE.PointLight(C.litLamp, 2, 10, 1.5);
  light.position.copy(lamp.position);
  g.add(body, scarf, head, hat, lamp, light);
  g.userData = { light };
  return g;
}
const player = makePlayer();
scene.add(player);

function makeLantern() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3), mat(C.wood));
  pole.position.y = 1.5;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.9, 8), mat(C.offLamp));
  lamp.position.y = 3.4;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), mat(C.core, C.core, 0));
  core.position.y = 3.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 8), mat(0x6a2a1a));
  roof.position.y = 4.05;
  const light = new THREE.PointLight(C.litLamp, 0, 22, 1.2);
  light.position.y = 3.4;
  const ring = new THREE.Mesh(new THREE.RingGeometry(tuning.safe_radius - 0.15, tuning.safe_radius, 48), new THREE.MeshBasicMaterial({ color: C.litLamp, transparent: true, opacity: 0 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  const fill = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24), mat(C.moteHalo, C.moteHalo, 1.5));
  fill.position.y = 2.6;
  // fuel bar above the lantern (scaled by fuel / 100)
  const fuelBg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0x222233 }));
  fuelBg.position.y = 4.6;
  const fuel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.07), new THREE.MeshBasicMaterial({ color: C.litLamp }));
  fuel.position.y = 4.6;
  // torn paper mark (colour-blind mode, unlit lanterns)
  const tear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  tear.position.set(0.5, 3.4, 0.1);
  tear.rotation.z = 0.4;
  g.add(pole, lamp, core, roof, light, ring, fill, fuelBg, fuel, tear);
  g.userData = { lamp, core, light, ring, fill, fuelBg, fuel, tear };
  return g;
}
const shadeGeo = new THREE.SphereGeometry(0.75, 16, 12);
const rimMat = new THREE.MeshBasicMaterial({ color: C.shadeRim, side: THREE.BackSide });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function makeShade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(shadeGeo, mat(C.shade, C.shade, 0));
  const rim = new THREE.Mesh(shadeGeo, rimMat);
  rim.scale.setScalar(1.12);
  for (const dx of [-0.25, 0.25]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeMat);
    eye.position.set(dx, 0.15, 0.65);
    g.add(eye);
  }
  g.add(body, rim);
  g.userData = { body, rim };
  return g;
}
function makeDrifter() {
  const g = new THREE.Group();
  const m = mat(C.drifter, C.drifter, 0.4, { transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), m);
    seg.position.z = -i * 0.45;
    g.add(seg);
  }
  return g;
}
function makeCharm() {
  const g = new THREE.Group();
  const border = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.05), mat(C.gold, C.gold, 0.5));
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.07), mat(C.scarf, C.scarf, 0.4));
  g.add(border, card);
  return g;
}
const moteGeo = new THREE.SphereGeometry(0.13, 8, 6), haloGeo = new THREE.SphereGeometry(0.3, 8, 6);
const moteMat = mat(C.moteCore, C.moteCore, 2.5);
const haloMat = new THREE.MeshBasicMaterial({ color: C.moteHalo, transparent: true, opacity: 0.3 });
function makeMote() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(moteGeo, moteMat), new THREE.Mesh(haloGeo, haloMat));
  return g;
}

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  unlock();
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
    if (mode === 'play') setMode('paused');
    else if (mode === 'paused') setMode('play');
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let camYaw = 0, dragging = false;
renderer.domElement.addEventListener('mousedown', () => (dragging = true));
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => { if (dragging && mode === 'play') camYaw -= e.movementX * settings.sens; });
function readInput() {
  if (keys.has('ArrowLeft')) camYaw += 1.5;
  if (keys.has('ArrowRight')) camYaw -= 1.5;
  // screen-right is world (-cos, +sin) of the yaw => contract x = -1
  const x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: keys.has('Space'), interact: keys.has('KeyE'), pulse: keys.has('KeyF'),
    dash: keys.has('ShiftLeft') || keys.has('ShiftRight') };
}

// ---------- game flow ----------
let mode = 'menu', prevMode = 'menu';
let night = 1, sim = null, nightScores = {};
const meshes = { lanterns: new Map(), shades: new Map(), motes: new Map(), drifters: new Map(), charms: new Map() };
const SCREENS = ['menu', 'intro', 'result', 'dawn', 'pause', 'settings'];
function setMode(m) {
  if (m === 'settings') prevMode = mode;
  mode = m;
  const screen = { paused: 'pause' }[m] || m;
  for (const s of SCREENS) $(s).classList.toggle('show', s === screen);
  if (m === 'play') { last = performance.now(); acc = 0; }
}
document.body.addEventListener('click', (e) => {
  const act = e.target.dataset && e.target.dataset.act;
  if (!act) return;
  unlock();
  startMusic();
  ({
    start: () => { nightScores = {}; showIntro(1); },
    play: () => setMode('play'),
    next: () => showIntro(night + 1),
    retry: () => showIntro(night),
    menu: () => { sim = null; setMode('menu'); },
    resume: () => setMode('play'),
    settings: () => setMode('settings'),
    back: () => setMode(prevMode),
  })[act]?.();
});
function showIntro(n) {
  night = n;
  startNight(n);
  $('intro-night').textContent = `Đêm ${n}`;
  $('intro-name').textContent = LEVELS[n].name;
  $('intro-text').textContent = INTRO[n];
  setMode('intro');
}
function startNight(n) {
  for (const map of Object.values(meshes)) { for (const m of map.values()) scene.remove(m); map.clear(); }
  sim = createSim(tuning, { seed: (Math.random() * 2 ** 31) | 0, night: n });
  buildLevel(sim.level);
  for (const l of sim.state.lanterns) {
    const g = makeLantern();
    g.position.set(l.x, l.y, l.z);
    scene.add(g);
    meshes.lanterns.set(l.id, g);
  }
  camYaw = 0;
  lastSecond = null;
}
function finishNight(result, reason) {
  const won = result === 'won';
  (won ? sfx.win : sfx.lose)();
  if (won) nightScores[night] = sim.state.score;
  const total = Object.values(nightScores).reduce((a, b) => a + b, 0);
  setTimeout(() => {
    if (won && night === 3) {
      $('dawn-text').textContent = `Ba hòn đảo đã sáng trở lại. Tổng điểm: ${total}`;
      setMode('dawn');
      return;
    }
    $('res-title').textContent = won ? `${LEVELS[night].name} đã giữ được ánh sáng!` : 'Đêm chưa thành...';
    const why = { dawn_survived: 'Đảo vẫn sáng khi bình minh tới.', dawn: 'Bình minh tới nhưng không đủ đèn còn sáng.', no_flames: 'Mây đã mất hết Ngọn Lửa.' }[reason];
    $('res-text').textContent = `${why} Điểm Đêm: ${sim.state.score} · Tổng điểm: ${total}`;
    $('res-next').style.display = won ? '' : 'none';
    setMode('result');
  }, 900);
}

// ---------- events -> sound / effects ----------
let pulseFx = [], toastTimer = 0;
function toast(msg) { $('toast').textContent = msg; $('toast').style.opacity = 1; toastTimer = 2.5; }
function onEvent(e) {
  const P = sim.state.player;
  switch (e.name) {
    case 'mote_picked': sfx.pick(); break;
    case 'lantern_lit': sfx.lit(); toast(`Đèn ${e.data.lantern_id} ${e.data.relight ? 'được thắp lại' : 'đã sáng'}!`); break;
    case 'refuel': sfx.pick(); toast(`Châm dầu đèn ${e.data.lantern_id}: ${e.data.fuel}`); break;
    case 'lantern_out': sfx.shade(); toast(`Đèn ${e.data.lantern_id} đã tắt!`); break;
    case 'dash': sfx.dash(); break;
    case 'charm_picked': sfx.charm(); toast('Bùa Gió! Chạy nhanh hơn, lướt không cần chờ'); break;
    case 'drifter_steal': sfx.steal(); toast(`Gió Lạc cướp mất ${e.data.amount} đom đóm!`); break;
    case 'drifter_drop': toast('Gió Lạc đánh rơi đom đóm!'); break;
    case 'shade_spawned': sfx.shade(); break;
    case 'player_hit':
      sfx.hit();
      toast(e.data.by === 'fall' ? `Mây rơi khỏi đảo! Còn ${e.data.flames} Ngọn Lửa` : `Bóng Mực chạm vào Mây! Còn ${e.data.flames} Ngọn Lửa`);
      break;
    case 'pulse': {
      sfx.pulse();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: C.litLamp, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(P.x, P.y + 0.3, P.z);
      scene.add(ring);
      pulseFx.push({ ring, t: 0 });
      break;
    }
    case 'game_over': finishNight(e.data.result, e.data.reason); break;
  }
}

// ---------- per-frame sync ----------
const tmpV = new THREE.Vector3();
let lastSecond = null;
function syncMap(map, list, make, update) {
  const seen = new Set();
  for (const o of list) {
    let m = map.get(o.id);
    if (!m) { m = make(); scene.add(m); map.set(o.id, m); }
    update(m, o);
    seen.add(o.id);
  }
  for (const [id, m] of map) if (!seen.has(id)) { scene.remove(m); map.delete(id); }
}
function sync(t) {
  const s = sim.state, P = s.player;
  player.position.set(P.x, P.y, P.z);
  player.rotation.y = Math.atan2(P.face[0], P.face[1]);
  player.userData.light.intensity = 1 + 3 * (P.carried / tuning.carry_capacity);
  player.visible = P.fallWait === 0 && (P.invuln === 0 || Math.floor(t * 12) % 2 === 0);

  let lit = 0;
  const blinkOff = Math.floor(t) % 2 === 1; // 1 Hz slow blink
  for (const l of s.lanterns) {
    const g = meshes.lanterns.get(l.id), u = g.userData;
    if (l.lit) lit++;
    const fuel = l.lit ? l.fuel / 60 : 0;
    const low = l.lit && fuel < tuning.low_fuel_threshold;
    u.fuelBg.visible = u.fuel.visible = l.lit && !(low && blinkOff);
    u.fuel.scale.x = Math.max(0.01, fuel / tuning.fuel_max);
    u.fuel.position.x = -0.7 * (1 - u.fuel.scale.x);
    u.fuel.material.color.setHex(low ? (settings.cb ? 0xffffff : 0xff5a5f) : C.litLamp);
    u.lamp.scale.set(1, !l.lit && settings.cb ? 0.8 : 1, 1); // deflated 20% when unlit (colour-blind mode)
    u.tear.visible = !l.lit && settings.cb;
    u.light.intensity = l.lit ? (low && blinkOff ? 10 : 40) : 0;
    u.lamp.material.color.setHex(l.lit ? C.litLamp : C.offLamp);
    u.lamp.material.emissive.setHex(l.lit ? C.litLamp : 0);
    u.lamp.material.emissiveIntensity = l.lit ? 1.2 : 0;
    u.core.material.emissiveIntensity = l.lit ? 3 : 0;
    u.ring.material.opacity = l.lit ? 0.35 : 0;
    const frac = Math.min(1, l.deposited / tuning.lantern_cost);
    u.fill.visible = !l.lit && frac > 0;
    u.fill.scale.setScalar(0.3 + 0.7 * frac);
  }
  // ambient light follows progress: 0.15 + 0.55 x lit / total
  const k = lit / s.lanterns.length;
  ambient.intensity = 0.15 + 0.55 * k;
  scene.fog.density = 0.03 - 0.018 * k;

  syncMap(meshes.shades, s.shades, makeShade, (g, sh) => {
    g.position.set(sh.x, sh.y + Math.sin(t * 3 + sh.x) * 0.12, sh.z);
    g.lookAt(P.x, g.position.y, P.z);
    const stunned = sh.state === 'stunned';
    g.userData.body.material.color.setHex(stunned ? C.shadeStun : C.shade);
    g.scale.setScalar(sh.state === 'spawning' ? 1 - sh.left / STD.shade_spawning_ticks : 1);
  });
  syncMap(meshes.motes, s.motes, makeMote, (m, mo) => {
    m.position.set(mo.x, mo.y + 0.9 + Math.sin(t * 4 + mo.x * 3) * 0.2, mo.z);
    m.visible = mo.ttl === null || mo.ttl > 90 || Math.floor(t * 8) % 2 === 0; // blink before TTL ends
  });
  syncMap(meshes.drifters, s.drifters.filter((d) => d.state !== 'removed'), makeDrifter, (g, d) => {
    g.position.set(d.x, d.y, d.z);
    g.lookAt(P.x, d.y, P.z);
    if (d.state === 'flee') g.rotateY(Math.PI);
    g.children.forEach((c, i) => (c.position.y = Math.sin(t * 8 + i) * 0.15));
  });
  syncMap(meshes.charms, s.charms, makeCharm, (g, c) => {
    g.visible = c.available;
    g.position.set(c.x, c.y + 1 + Math.sin(t * 2) * 0.15, c.z);
    g.rotation.y = t * 1.5;
  });

  // ----- HUD -----
  $('flames').textContent = '🔥'.repeat(P.flames) + '·'.repeat(Math.max(0, tuning.flames - P.flames));
  const tl = Math.max(0, s.timeLeft);
  const clock = $('clock');
  clock.textContent = `${String(Math.floor(tl / 60)).padStart(2, '0')}:${String(Math.floor(tl % 60)).padStart(2, '0')}`;
  clock.classList.toggle('danger', tl <= 30);
  const sec = Math.ceil(tl);
  if (sec !== lastSecond) { if (sec <= 10 && sec > 0 && lastSecond !== null) sfx.tick(); lastSecond = sec; }
  const need = Math.ceil(tuning.win_ratio * s.lanterns.length - 1e-9);
  $('topright').innerHTML = `Đèn <b>${lit}/${s.lanterns.length}</b> (cần ${need} lúc bình minh)<br>Đom đóm <b>${P.carried}/${Math.min(tuning.capacity_max, tuning.carry_capacity + 2 * P.lights)}</b><br>Điểm <b>${s.score}</b>`;
  const bar = $('bar');
  const cap = Math.min(tuning.capacity_max, tuning.carry_capacity + 2 * P.lights);
  if (bar.children.length !== cap) bar.innerHTML = '<i></i>'.repeat(cap);
  [...bar.children].forEach((c, i) => c.classList.toggle('on', i < P.carried));
  const dashFrac = P.charm > 0 ? 0 : P.dashCd / (tuning.dash_cooldown_s * TICK_RATE);
  $('cd-dash').style.height = `${Math.min(1, dashFrac) * 100}%`;
  $('cd-pulse').style.height = `${Math.min(1, P.pulseCd / (tuning.pulse_cooldown_s * TICK_RATE)) * 100}%`;
  // prompt near a lantern + arrow to nearest unlit lantern
  let nearest = null, nd = Infinity;
  for (const l of s.lanterns) {
    if (l.lit && l.fuel >= tuning.low_fuel_threshold * 60) continue; // unlit or weak lanterns need Mây
    const d = Math.hypot(l.x - P.x, l.z - P.z);
    if (d < nd) { nd = d; nearest = l; }
  }
  const prompt = $('prompt');
  if (nearest && nd <= tuning.interact_radius) {
    prompt.style.display = 'block';
    prompt.textContent = nearest.lit
      ? `E — Châm dầu (${(nearest.fuel / 60).toFixed(0)}/${tuning.fuel_max})`
      : `E — Nạp ánh sáng (${nearest.deposited}/${nearest.everLit ? tuning.relight_cost : tuning.lantern_cost})`;
  } else prompt.style.display = 'none';
  const arrow = $('arrow');
  arrow.style.display = 'none';
  if (nearest) {
    tmpV.set(nearest.x, nearest.y + 3, nearest.z).project(camera);
    const behind = tmpV.z > 1;
    let ax = tmpV.x, ay = tmpV.y;
    if (behind) { ax = -ax; ay = -ay; }
    if (behind || Math.abs(ax) > 1 || Math.abs(ay) > 1) {
      const m = Math.max(Math.abs(ax), Math.abs(ay)) || 1;
      ax = (ax / m) * 0.88; ay = (ay / m) * 0.85;
      arrow.style.display = 'block';
      arrow.style.left = `${((ax + 1) / 2) * innerWidth - 14}px`;
      arrow.style.top = `${((1 - ay) / 2) * innerHeight - 15}px`;
      arrow.style.transform = `rotate(${Math.atan2(ax, ay)}rad)`;
    }
  }
  // wind warning 2 s before each gust (night 3)
  const wind = $('wind');
  const toGust = STD.wind_every - (s.simTick % STD.wind_every);
  if (sim.level.wind && s.windEnabled && s.wind.active === 0 && toGust <= 120) {
    if (wind.textContent === '') sfx.wind();
    wind.textContent = '🍃 🍃 Gió sắp nổi... 🍃';
  } else wind.textContent = s.wind.active > 0 ? '🍃 Gió mạnh!' : '';
}

// ---------- main loop ----------
let acc = 0, last = performance.now(), elapsed = 0, fpsFrames = 0, fpsT = 0;
window.__fps = { samples: [] }; // average FPS per second, readable from the console for proof
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  elapsed += dt;
  fpsFrames++;
  fpsT += dt;
  if (fpsT >= 1) {
    const fps = fpsFrames / fpsT;
    $('fps').textContent = `FPS ${fps.toFixed(0)}`;
    if (mode === 'play') window.__fps.samples.push(+fps.toFixed(1));
    fpsFrames = 0;
    fpsT = 0;
  }
  if (sim) {
    if (mode === 'play') {
      acc += dt;
      while (acc >= 1 / TICK_RATE && mode === 'play') {
        acc -= 1 / TICK_RATE;
        const wasGrounded = sim.state.player.grounded;
        for (const e of sim.step(readInput())) onEvent(e);
        const Pn = sim.state.player;
        if (wasGrounded && !Pn.grounded && !Pn.launch && Pn.vy > STD.jump_speed - 1) sfx.jump();
        if (sim.state.state !== 'playing') break;
      }
    }
    for (const fx of pulseFx) {
      fx.t += dt;
      const r = 1 + (tuning.pulse_radius - 1) * Math.min(1, fx.t / 0.35);
      fx.ring.scale.set(r, r, r);
      fx.ring.material.opacity = Math.max(0, 0.9 - fx.t * 1.8);
    }
    pulseFx = pulseFx.filter((fx) => (fx.t < 0.6 ? true : (scene.remove(fx.ring), false)));
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').style.opacity = 0;
    sync(elapsed);
    const th = (camYaw * Math.PI) / 180, P = sim.state.player;
    const cy = Math.max(P.y, -2);
    camera.position.set(P.x - Math.sin(th) * 9, cy + 5.5, P.z - Math.cos(th) * 9);
    camera.lookAt(P.x, cy + 1.2, P.z);
  } else {
    camera.position.set(Math.sin(elapsed * 0.1) * 60, 30, Math.cos(elapsed * 0.1) * 60);
    camera.lookAt(0, 0, 0);
    if (!levelGroup) buildLevel(LEVELS[1]);
  }
  for (const id of ['flames', 'clock', 'topright', 'bar', 'cds']) $(id).style.visibility = sim && mode !== 'menu' ? 'visible' : 'hidden';
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
applyCb();
requestAnimationFrame(frame);
