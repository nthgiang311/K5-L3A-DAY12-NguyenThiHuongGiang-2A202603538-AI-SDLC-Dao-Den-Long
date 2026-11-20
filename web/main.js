// 3D client: menus, 3-night flow, HUD and rendering around the shared simulation (src/sim/sim.js).
// The sim runs at a fixed 60 ticks/s; this file only maps keyboard/mouse -> contract input and draws state.
import * as THREE from 'three';
import { createSim, TICK_RATE, STD } from '/src/sim/sim.js';
import { LEVELS, TOWER } from '/src/sim/levels.js';
import { sfx, setVolume, unlock, startMusic, stopMusic } from '/web/audio.js';

const tuning = (await (await fetch('/game.contract.json')).json()).tuning;
import { mulberry32 } from '/src/sim/rng.js';
const Q = new URLSearchParams(location.search);
// ?shot=1 : README screenshot (scripts/screenshot.js) - a staged night-1 scene, canvas captured after 4 s
const SHOT = Q.has('shot');
const BENCH = Q.has('bench') ? { seed: parseInt(Q.get('seed') || '42', 10), duration: parseFloat(Q.get('duration') || '30') } : null;

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
const DEFAULT_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyF', pause: 'Escape' };
const KEY_LABEL = { up: 'Đi lên', down: 'Đi xuống', left: 'Sang trái', right: 'Sang phải', jump: 'Nhảy', dash: 'Lướt', interact: 'Tương tác', pulse: 'Tỏa sáng', pause: 'Tạm dừng' };
const settings = Object.assign({ vol: 0.6, sens: 0.3, cb: false, rm: false, big: false }, JSON.parse(localStorage.getItem('ddl-settings') || '{}'));
settings.keys = Object.assign({}, DEFAULT_KEYS, settings.keys || {});
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
$('set-rm').checked = settings.rm;
$('set-rm').onchange = (e) => { settings.rm = e.target.checked; saveSettings(); };
$('set-big').checked = settings.big;
document.body.classList.toggle('big', settings.big);
$('set-big').onchange = (e) => { settings.big = e.target.checked; document.body.classList.toggle('big', settings.big); saveSettings(); };
// ----- key rebinding: click an action, press a key; duplicates are reported -----
let rebinding = null;
const keyName = (code) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'Shift trái').replace('ShiftRight', 'Shift phải').replace('Space', 'Space');
function renderBinds() {
  const box = $('binds');
  box.innerHTML = '';
  for (const act of Object.keys(DEFAULT_KEYS)) {
    const lab = document.createElement('span');
    lab.textContent = KEY_LABEL[act];
    const b = document.createElement('button');
    b.textContent = rebinding === act ? 'Nhấn phím…' : keyName(settings.keys[act]);
    b.onclick = () => { rebinding = act; renderBinds(); };
    box.append(lab, b);
  }
  const used = {};
  for (const [a, k] of Object.entries(settings.keys)) (used[k] = used[k] || []).push(KEY_LABEL[a]);
  const dup = Object.entries(used).filter(([, v]) => v.length > 1);
  $('bind-warn').textContent = dup.length ? '⚠ Trùng phím: ' + dup.map(([k, v]) => `${keyName(k)} (${v.join(', ')})`).join('; ') : '';
}
renderBinds();

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(BENCH ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(BENCH ? 1280 : innerWidth, BENCH ? 720 : innerHeight);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.FogExp2(C.fog, 0.03);
const camera = new THREE.PerspectiveCamera(60, BENCH ? 1280 / 720 : innerWidth / innerHeight, 0.1, 400);
addEventListener('resize', () => {
  if (BENCH) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const ambient = new THREE.AmbientLight(0xfff0e0, 0.15);
const moon = new THREE.DirectionalLight(0x8090ff, 0.4);
moon.position.set(-30, 60, -20);
scene.add(ambient, moon);
const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshLambertMaterial({ color: C.sea }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -12;
scene.add(sea);

// Lambert shading: cheaper than PBR for many lights, fits the simple stylised look
const mat = (color, emissive = 0, ei = 0, extra = {}) => new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, ...extra });

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
// Shades and motes are drawn with InstancedMesh (a handful of draw calls even with 200 shades in the bench)
const MAX_SHADES = 256, MAX_MOTES = 160;
const shadeBodyI = new THREE.InstancedMesh(shadeGeo, mat(0xffffff), MAX_SHADES);
const shadeRimI = new THREE.InstancedMesh(shadeGeo, rimMat, MAX_SHADES);
const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6);
const eyeI = new THREE.InstancedMesh(eyeGeo, eyeMat, MAX_SHADES * 2);
const moteGeo = new THREE.SphereGeometry(0.13, 8, 6), haloGeo = new THREE.SphereGeometry(0.3, 8, 6);
const moteMat = mat(C.moteCore, C.moteCore, 2.5);
const haloMat = new THREE.MeshBasicMaterial({ color: C.moteHalo, transparent: true, opacity: 0.3 });
const moteI = new THREE.InstancedMesh(moteGeo, moteMat, MAX_MOTES);
const haloI = new THREE.InstancedMesh(haloGeo, haloMat, MAX_MOTES);
for (const m of [shadeBodyI, shadeRimI, eyeI, moteI, haloI]) { m.count = 0; m.frustumCulled = false; scene.add(m); }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _off = new THREE.Vector3();

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', (e) => {
  unlock();
  if (rebinding) {
    e.preventDefault();
    settings.keys[rebinding] = e.code;
    rebinding = null;
    saveSettings();
    renderBinds();
    return;
  }
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if ((e.code === settings.keys.pause || e.code === 'KeyP') && !e.repeat) {
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
  const K = settings.keys, on = (a) => keys.has(K[a]);
  const x = (on('left') ? 1 : 0) - (on('right') ? 1 : 0);
  const z = (on('up') ? 1 : 0) - (on('down') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: on('jump'), interact: on('interact'), pulse: on('pulse'), dash: on('dash') };
}

// ---------- game flow ----------
let mode = 'menu', prevMode = 'menu';
let night = 1, sim = null, nightScores = {};
const meshes = { lanterns: new Map(), shades: new Map(), motes: new Map(), drifters: new Map(), charms: new Map() };
const SCREENS = ['menu', 'intro', 'result', 'dawn', 'pause', 'settings', 'save', 'board'];
let runSeed = 0;
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
    start: () => { nightScores = {}; runSeed = (Math.random() * 2 ** 31) | 0; showIntro(1); },
    'keys-reset': () => { settings.keys = { ...DEFAULT_KEYS }; saveSettings(); renderBinds(); },
    board: () => showBoard(),
    save: () => {
      const total = Object.values(nightScores).reduce((a, b) => a + b, 0);
      $('save-text').textContent = `Tổng điểm: ${total} · Số Đêm thắng: ${Object.keys(nightScores).length}`;
      $('save-err').textContent = '';
      setMode('save');
      $('save-name').focus();
    },
    'save-ok': () => saveScore(),
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
  const shotScene = SHOT ? { player: { pos: [-4, 0, 14], carried: 7 }, lanterns: [{ id: 'L1', lit: true, fuel: 80 }, { id: 'L5', lit: true, fuel: 25 }],
    shades: [{ id: 'S1', pos: [6, 1, 22], state: 'wander' }, { id: 'S2', pos: [-20, 1, 14], state: 'wander' }, { id: 'S3', pos: [3, 1, 9], state: 'stunned', state_ticks_left: 600 }],
    random_shades: false } : null;
  sim = createSim(tuning, { seed: runSeed + n - 1, night: n, scenario: shotScene });
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
    $('res-save').style.display = won ? 'none' : ''; // after a loss the run can be saved
    setMode('result');
  }, 900);
}

// ---------- leaderboard (stored on disk by server.js) ----------
import { validName, isoWithOffset } from '/src/leaderboard.js';
async function saveScore() {
  const name = $('save-name').value.normalize('NFC').trim();
  if (!validName(name)) { $('save-err').textContent = '⚠ Tên cần 3–12 ký tự: chữ, số hoặc _'; return; }
  const entry = { name, score: Object.values(nightScores).reduce((a, b) => a + b, 0), nights_won: Object.keys(nightScores).length,
    achieved_at: isoWithOffset(new Date()), seed: runSeed };
  const r = await fetch('/api/leaderboard', { method: 'POST', body: JSON.stringify(entry) });
  if (!r.ok) { $('save-err').textContent = '⚠ Không lưu được: ' + (await r.json()).error; return; }
  showBoard();
}
async function showBoard() {
  const { entries } = await (await fetch('/api/leaderboard')).json();
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  $('board-table').innerHTML = '<tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Thời điểm</th></tr>' +
    (entries.length ? entries.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${e.score}</td><td>${e.nights_won}</td><td>${esc(e.achieved_at.slice(0, 16).replace('T', ' '))}</td></tr>`).join('')
      : '<tr><td colspan="5">Chưa có ai</td></tr>');
  setMode('board');
}

// ---------- accessibility cues (subtitles / visual indicators) ----------
let cueTimer = 0, shadeCue = null, lowWarned = new Set(), shake = 0;
function cue(msg, secs = 2.5) { $('cue').textContent = msg; cueTimer = secs; }
function hitFeedback() {
  if (settings.rm) return; // reduced motion: no camera shake, no screen flash
  shake = 0.35;
  $('flash').style.opacity = 0.35;
  setTimeout(() => ($('flash').style.opacity = 0), 120);
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
    case 'shade_spawned': sfx.shade(); cue('⚠ Bóng Mực xuất hiện!'); shadeCue = { id: e.data.id, t: 3 }; break;
    case 'fuel_drain': cue(`⚠ Bóng Mực đang hút dầu đèn ${e.data.lantern_id}`); break;
    case 'player_hit':
      sfx.hit();
      hitFeedback();
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

  const nS = Math.min(s.shades.length, MAX_SHADES);
  for (let i = 0; i < nS; i++) {
    const sh = s.shades[i];
    const k = sh.state === 'spawning' ? Math.max(0.05, 1 - sh.left / STD.shade_spawning_ticks) : 1;
    _p.set(sh.x, sh.y + Math.sin(t * 3 + sh.x) * 0.12, sh.z);
    const yaw = Math.atan2(P.x - sh.x, P.z - sh.z);
    _q.setFromEuler(_e.set(0, yaw, 0));
    shadeBodyI.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(k)));
    shadeBodyI.setColorAt(i, _c.setHex(sh.state === 'stunned' ? C.shadeStun : sh.state === 'drain' ? 0x2a0a3a : C.shade));
    shadeRimI.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(k * 1.12)));
    for (let j = 0; j < 2; j++) {
      _off.set(j ? 0.25 : -0.25, 0.15, 0.65).multiplyScalar(k).applyQuaternion(_q).add(_p);
      eyeI.setMatrixAt(i * 2 + j, _m.compose(_off, _q, _s.setScalar(k)));
    }
  }
  shadeBodyI.count = shadeRimI.count = nS;
  eyeI.count = nS * 2;
  for (const m of [shadeBodyI, shadeRimI, eyeI]) m.instanceMatrix.needsUpdate = true;
  if (shadeBodyI.instanceColor) shadeBodyI.instanceColor.needsUpdate = true;
  let nM = 0;
  for (const mo of s.motes) {
    if (nM >= MAX_MOTES) break;
    if (!(mo.ttl === null || mo.ttl > 90 || Math.floor(t * 8) % 2 === 0)) continue; // blink before TTL ends
    _p.set(mo.x, mo.y + 0.9 + Math.sin(t * 4 + mo.x * 3) * 0.2, mo.z);
    _m.compose(_p, _q.identity(), _s.setScalar(1));
    moteI.setMatrixAt(nM, _m);
    haloI.setMatrixAt(nM, _m);
    nM++;
  }
  moteI.count = haloI.count = nM;
  moteI.instanceMatrix.needsUpdate = haloI.instanceMatrix.needsUpdate = true;
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
  // low-fuel cue (once per drop below 30) + last 10 s cue + arrow to a newly spawned shade
  for (const l of s.lanterns) {
    const low = l.lit && l.fuel < tuning.low_fuel_threshold * 60;
    if (low && !lowWarned.has(l.id)) { lowWarned.add(l.id); cue(`⚠ Đèn ${l.id} sắp cạn dầu`); }
    if (!low) lowWarned.delete(l.id);
  }
  if (tl <= 10 && tl > 0) $('cue').textContent = `⏳ ${Math.ceil(tl)} giây cuối!`;
  const sa = $('sarrow');
  sa.style.display = 'none';
  const tgt = shadeCue && s.shades.find((x) => x.id === shadeCue.id);
  if (tgt) {
    tmpV.set(tgt.x, tgt.y, tgt.z).project(camera);
    let ax = tmpV.z > 1 ? -tmpV.x : tmpV.x, ay = tmpV.z > 1 ? -tmpV.y : tmpV.y;
    if (tmpV.z > 1 || Math.abs(ax) > 1 || Math.abs(ay) > 1) {
      const m = Math.max(Math.abs(ax), Math.abs(ay)) || 1;
      ax = (ax / m) * 0.9; ay = (ay / m) * 0.88;
      sa.style.display = 'block';
      sa.style.left = `${((ax + 1) / 2) * innerWidth - 12}px`;
      sa.style.top = `${((1 - ay) / 2) * innerHeight - 13}px`;
      sa.style.transform = `rotate(${Math.atan2(ax, ay)}rad)`;
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
  const rawDtMs = now - last;
  if (bench) benchFrame(now, rawDtMs);
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
        for (const e of sim.step(BENCH ? {} : readInput())) onEvent(e);
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
    if (cueTimer > 0 && (cueTimer -= dt) <= 0) $('cue').textContent = '';
    if (shadeCue && (shadeCue.t -= dt) <= 0) shadeCue = null;
    sync(elapsed);
    const th = (camYaw * Math.PI) / 180, P = sim.state.player;
    const cy = Math.max(P.y, -2);
    if (bench) {
      const a = bench.start === null ? 0 : (2 * Math.PI * ((now - bench.start) / 1000)) / 15; // CCW from above: (cos a, sin a)
      camera.position.set(30 * Math.cos(a), 15, 30 * Math.sin(a));
      camera.lookAt(0, 0, 0);
    } else {
      camera.position.set(P.x - Math.sin(th) * 9, cy + 5.5, P.z - Math.cos(th) * 9);
      camera.lookAt(P.x, cy + 1.2, P.z);
      if (shake > 0 && !settings.rm) { // camera shake on hit (off with reduced motion)
        shake -= dt;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }
    }
  } else {
    camera.position.set(Math.sin(elapsed * 0.1) * 60, 30, Math.cos(elapsed * 0.1) * 60);
    camera.lookAt(0, 0, 0);
    if (!levelGroup) buildLevel(LEVELS[1]);
  }
  for (const id of ['flames', 'clock', 'topright', 'bar', 'cds']) $(id).style.visibility = sim && mode !== 'menu' ? 'visible' : 'hidden';
  renderer.render(scene, camera);
  if (SHOT && sim && elapsed > 4 && !window.__shotDone) {
    window.__shotDone = true; // capture right after render (same task, drawing buffer still valid)
    fetch('/shot', { method: 'POST', body: renderer.domElement.toDataURL('image/png') });
  }
  if (bench && bench.done) return; // bench finished: stop rendering so the browser is idle while memory is sampled
  requestAnimationFrame(frame);
}
applyCb();
if (BENCH) startBench();
if (SHOT) { runSeed = 5; showIntro(1); setMode('play'); camYaw = 20; }
requestAnimationFrame(frame);

// ---------- benchmark scene (Ticket-04 §1) ----------
// Night 1, 200 wandering shades spread evenly over the island (seed), 100 motes, L1-L3 lit with fuel 100,
// Mây idle at (0,0,0); camera orbits r=30 at Y=15 around the origin, CCW from above, 15 s per lap.
var bench; // set by startBench() (called above, so no initializer here)
function startBench() {
  const rng = mulberry32(BENCH.seed);
  const disk = (rmax) => { const a = rng() * 2 * Math.PI, r = rmax * Math.sqrt(rng()); return [r * Math.cos(a), r * Math.sin(a)]; };
  const shades = Array.from({ length: 200 }, (_, i) => { const [x, z] = disk(38); return { id: 'S' + (i + 1), pos: [x, 1, z], state: 'wander' }; });
  const motes = Array.from({ length: 100 }, () => { const [x, z] = disk(38); return [x, 0, z]; });
  const scenario = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, shades, motes,
    lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true, fuel: 100 })), player: { pos: [0, 0, 0] } };
  for (const s of SCREENS) $(s).classList.remove('show');
  sim = createSim(tuning, { seed: BENCH.seed, night: 1, scenario, bench: true });
  buildLevel(sim.level);
  for (const l of sim.state.lanterns) { const g = makeLantern(); g.position.set(l.x, l.y, l.z); scene.add(g); meshes.lanterns.set(l.id, g); }
  mode = 'play';
  bench = { start: null, dts: [], measuring: false, firstFrameEpoch: null, done: false };
}
function benchFrame(now, dtMs) {
  const b = bench;
  if (b.start === null) { b.start = now; b.firstFrameEpoch = performance.timeOrigin + now; return; }
  const t = (now - b.start) / 1000;
  if (!b.measuring && t >= 3) { b.measuring = true; b.mStart = now; fetch('/bench/measure-start'); return; }
  if (b.measuring && !b.done) {
    b.dts.push(dtMs);
    if ((now - b.mStart) / 1000 >= BENCH.duration) {
      b.done = true;
      const N = b.dts.length, sum = b.dts.reduce((a, c) => a + c, 0);
      const sorted = [...b.dts].sort((a, c) => a - c);
      const k = Math.max(1, Math.ceil(0.01 * N));
      const worst = sorted.slice(-k);
      const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const r2 = (v) => Math.round(v * 100) / 100;
      fetch('/bench/result', { method: 'POST', body: JSON.stringify({
        frames: N, avg_fps: r2((1000 * N) / sum), p1_low_fps: r2(1000 / (worst.reduce((a, c) => a + c, 0) / k)),
        frame_ms_p95: r2(sorted[Math.min(N - 1, Math.ceil(0.95 * N) - 1)]), first_frame_epoch_ms: b.firstFrameEpoch,
        three: THREE.REVISION, gl_renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        ua: navigator.userAgent, viewport: `${renderer.domElement.width}x${renderer.domElement.height}`,
      }) });
    }
  }
}
