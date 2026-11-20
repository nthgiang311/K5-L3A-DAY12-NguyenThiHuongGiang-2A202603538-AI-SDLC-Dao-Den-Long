// 3D client: renders the shared simulation (src/sim/sim.js) with three.js.
// The sim runs at a fixed 60 ticks/s; this file only maps keyboard -> contract input and draws state.
import * as THREE from 'three';
import { createSim, TICK_RATE, WORLD } from '/src/sim/sim.js';

const tuning = (await (await fetch('/game.contract.json')).json()).tuning;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const NIGHT = new THREE.Color(0x1a0d2e);
const WARM = new THREE.Color(0x4a3050);
scene.background = NIGHT.clone();
scene.fog = new THREE.FogExp2(0x1a0d2e, 0.035);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const ambient = new THREE.HemisphereLight(0x6a5aa0, 0x150a20, 0.6);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0x9a8cff, 0.35);
moon.position.set(-20, 40, -10);
scene.add(moon);

// island + sea of clouds
const island = new THREE.Mesh(
  new THREE.CylinderGeometry(WORLD.island_radius, WORLD.island_radius - 4, 3, 64),
  new THREE.MeshStandardMaterial({ color: 0x2d4a3e, roughness: 1 })
);
island.position.y = -1.5;
scene.add(island);
const sea = new THREE.Mesh(new THREE.CircleGeometry(250, 48), new THREE.MeshStandardMaterial({ color: 0x3a2a5a, roughness: 1 }));
sea.rotation.x = -Math.PI / 2;
sea.position.y = -8;
scene.add(sea);

const mat = (color, emissive = 0x000000, ei = 0) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.8 });

// player: Mây with a nón lá and a small hanging lantern
function makePlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.6, 4, 12), mat(0x9ec5ff));
  body.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), mat(0xffe0c0));
  head.position.y = 1.35;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.38, 24), mat(0xe8d39a));
  hat.position.y = 1.68;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35), mat(0x222222));
  string.position.set(0.55, 1.35, 0);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), mat(0xffa040, 0xff8a1e, 2));
  lamp.position.set(0.55, 1.12, 0);
  const light = new THREE.PointLight(0xffa040, 1.5, 9, 1.5);
  light.position.copy(lamp.position);
  g.add(body, head, hat, string, lamp, light);
  g.userData = { light, lamp };
  return g;
}
const player = makePlayer();
scene.add(player);

function makeLantern() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3), mat(0x4a3424));
  pole.position.y = 1.5;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.9, 8), mat(0x333344));
  lamp.position.y = 3.4;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 8), mat(0x6a2a1a));
  roof.position.y = 4.05;
  const light = new THREE.PointLight(0xffa040, 0, 22, 1.2);
  light.position.y = 3.4;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(tuning.safe_radius - 0.15, tuning.safe_radius, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const fill = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 24, 0), mat(0xffcc66, 0xffaa33, 1.5));
  fill.position.y = 2.6;
  g.add(pole, lamp, roof, light, ring, fill);
  g.userData = { lamp, light, ring, fill };
  return g;
}
const shadeGeo = new THREE.SphereGeometry(0.75, 16, 12);
function makeShade() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: 0x1a0828, emissive: 0x5a1a8a, emissiveIntensity: 0.5, transparent: true, opacity: 0.92 }));
  body.position.y = 0.9;
  const eyeM = mat(0xffffff, 0xd0b0ff, 1);
  for (const dx of [-0.25, 0.25]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeM);
    eye.position.set(dx, 1.05, 0.65);
    g.add(eye);
  }
  g.add(body);
  g.userData = { body };
  return g;
}
const moteGeo = new THREE.SphereGeometry(0.16, 8, 6);
const moteMat = mat(0xfff0a0, 0xffd040, 2.5);

// ---------- input ----------
const keys = new Set();
const pressed = new Set();
addEventListener('keydown', (e) => {
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
let camYaw = 0; // degrees, same convention as contract cam_yaw_deg
let dragging = false;
renderer.domElement.addEventListener('mousedown', () => (dragging = true));
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => { if (dragging) camYaw -= e.movementX * 0.3; });

function readInput() {
  if (keys.has('ArrowLeft')) camYaw += 1.5;
  if (keys.has('ArrowRight')) camYaw -= 1.5;
  // camera looks along +forward; screen-right is world (-cos, +sin) => contract x = -1
  const x = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
  const z = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  return { move: [x, z], cam_yaw_deg: camYaw, jump: keys.has('Space'), interact: keys.has('KeyE'), pulse: keys.has('KeyF') };
}

// ---------- game session ----------
let sim, lanternMeshes, shadeMeshes, moteMeshes, pulseFx = [];
const hud = document.getElementById('hud');
const overlay = document.getElementById('overlay');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.style.opacity = 1; toastTimer = 2; }

function newGame() {
  for (const m of [...(lanternMeshes?.values() || []), ...(shadeMeshes?.values() || []), ...(moteMeshes?.values() || [])]) scene.remove(m);
  sim = createSim(tuning, { seed: (Math.random() * 2 ** 31) | 0 });
  lanternMeshes = new Map();
  shadeMeshes = new Map();
  moteMeshes = new Map();
  for (const l of sim.state.lanterns) {
    const g = makeLantern();
    g.position.set(l.x, 0, l.z);
    scene.add(g);
    lanternMeshes.set(l.id, g);
  }
  overlay.style.display = 'none';
  camYaw = 0;
  toast('Đêm 1 – Đảo Bến: gom đom đóm, thắp 5 Đèn Lồng Lớn!');
}

function onEvent(e) {
  if (e.name === 'lantern_lit') toast(`Đèn ${e.data.lantern_id} đã sáng!`);
  if (e.name === 'player_hit') toast(`Bóng Mực chạm vào Mây! Còn ${e.data.flames} ngọn lửa`);
  if (e.name === 'shade_spawned') toast('Một Bóng Mực mới trồi lên từ sương...');
  if (e.name === 'pulse') {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(sim.state.player.x, 0.2, sim.state.player.z);
    scene.add(ring);
    pulseFx.push({ ring, t: 0 });
  }
  if (e.name === 'game_over') {
    const won = e.data.result === 'won';
    document.getElementById('ov-title').textContent = won ? 'Đảo đã sáng trở lại!' : 'Mây đã kiệt sức...';
    const why = { all_lit: 'Mọi Đèn Lồng Lớn đã được thắp.', dawn: 'Bình minh tới mà đảo vẫn còn tối.', no_flames: 'Mây đã mất hết ngọn lửa.' }[e.data.reason];
    document.getElementById('ov-text').textContent = `${why} Điểm: ${sim.state.score}`;
    overlay.style.display = 'flex';
  }
}

function sync(sim, t) {
  const s = sim.state, p = s.player;
  player.position.set(p.x, p.y, p.z);
  const mv = readInputCache.move;
  if (mv[0] || mv[1]) {
    const th = (readInputCache.cam_yaw_deg * Math.PI) / 180;
    const wx = mv[0] * Math.cos(th) + mv[1] * Math.sin(th), wz = -mv[0] * Math.sin(th) + mv[1] * Math.cos(th);
    player.rotation.y = Math.atan2(wx, wz);
  }
  // creative: the hat lantern glows brighter the more fireflies Mây carries; blinks while invulnerable
  player.userData.light.intensity = 0.8 + 2.2 * (p.carried / tuning.carry_capacity);
  player.visible = p.invuln === 0 || Math.floor(t * 12) % 2 === 0;

  let litCount = 0;
  for (const l of s.lanterns) {
    const g = lanternMeshes.get(l.id);
    if (l.lit) litCount++;
    g.userData.light.intensity = l.lit ? 40 : 0;
    g.userData.lamp.material.emissive.setHex(l.lit ? 0xff9a2e : 0x000000);
    g.userData.lamp.material.emissiveIntensity = l.lit ? 1.6 : 0;
    g.userData.ring.material.opacity = l.lit ? 0.35 : 0;
    const frac = Math.min(1, l.deposited / tuning.lantern_cost);
    g.userData.fill.geometry.dispose();
    g.userData.fill.geometry = new THREE.TorusGeometry(0.5, 0.06, 6, 24, Math.max(0.001, frac * Math.PI * 2));
    g.userData.fill.visible = !l.lit && frac > 0;
  }
  // the island warms up and the black fog thins as lanterns are lit
  const k = litCount / s.lanterns.length;
  scene.background.copy(NIGHT).lerp(WARM, k);
  scene.fog.color.copy(scene.background);
  scene.fog.density = 0.035 - 0.022 * k;
  ambient.intensity = 0.6 + 0.6 * k;

  syncMap(shadeMeshes, s.shades, makeShade, (g, sh) => {
    g.position.set(sh.x, sh.y + Math.sin(t * 3 + sh.x) * 0.15, sh.z);
    g.lookAt(p.x, g.position.y, p.z);
    const stunned = sh.state === 'stunned';
    g.userData.body.material.opacity = stunned ? 0.45 : 0.92;
    g.userData.body.material.emissive.setHex(stunned ? 0xc0a0ff : 0x5a1a8a);
  });
  syncMap(moteMeshes, s.motes, () => new THREE.Mesh(moteGeo, moteMat), (m, mo) => {
    m.position.set(mo.x, 0.9 + Math.sin(t * 4 + mo.x * 3) * 0.25, mo.z);
  });

  const tl = Math.max(0, s.timeLeft);
  hud.innerHTML =
    `Lửa: <b>${'🔥'.repeat(p.flames) || '—'}</b><br>` +
    `Đom đóm: <b>${p.carried}/${tuning.carry_capacity}</b><br>` +
    `Đèn đã thắp: <b>${litCount}/${s.lanterns.length}</b><br>` +
    `Còn: <b>${Math.floor(tl / 60)}:${String(Math.floor(tl % 60)).padStart(2, '0')}</b> tới bình minh<br>` +
    `Điểm: <b>${s.score}</b>`;
}
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

// ---------- main loop (fixed 60 Hz sim, render every frame) ----------
let readInputCache = { move: [0, 0], cam_yaw_deg: 0 };
let acc = 0, last = performance.now(), elapsed = 0;
newGame();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  elapsed += dt;
  if (pressed.has('KeyR')) newGame();
  pressed.clear();
  acc += dt;
  while (acc >= 1 / TICK_RATE) {
    acc -= 1 / TICK_RATE;
    readInputCache = readInput();
    for (const e of sim.step(readInputCache)) onEvent(e);
  }
  for (const fx of pulseFx) {
    fx.t += dt;
    const r = 1 + (tuning.pulse_radius - 1) * Math.min(1, fx.t / 0.35);
    fx.ring.scale.set(r, r, r);
    fx.ring.material.opacity = Math.max(0, 0.9 - fx.t * 1.8);
  }
  pulseFx = pulseFx.filter((fx) => (fx.t < 0.6 ? true : (scene.remove(fx.ring), false)));
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) toastEl.style.opacity = 0;

  sync(sim, elapsed);
  // third-person camera behind Mây, looking along the yaw direction
  const th = (camYaw * Math.PI) / 180;
  const p = sim.state.player;
  camera.position.set(p.x - Math.sin(th) * 9, p.y + 5.5, p.z - Math.cos(th) * 9);
  camera.lookAt(p.x, p.y + 1.2, p.z);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
