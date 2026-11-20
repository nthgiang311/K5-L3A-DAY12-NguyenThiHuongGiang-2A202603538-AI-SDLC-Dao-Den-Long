// Runs the headless proof scenarios through the real CLI and writes outputs + an auto-generated
// summary to docs/proof/<phase>/. Nothing in that folder is edited by hand.
// Usage: node scripts/proof.js [phase-4]
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const phase = process.argv[2] || 'phase-4';
const OUT = path.join('docs', 'proof', phase);
fs.mkdirSync(OUT, { recursive: true });
const S = 'tests/scenarios/';
const sc = (n) => ['--scenario', S + n + '.scenario.json'];
const inp = (n) => ['--inputs', S + n + '.inputs.json'];
const ev = (L, name) => L.filter((l) => l.type === 'event' && l.name === name);
const snapAt = (L, t) => L.find((l) => l.type === 'snapshot' && l.tick === t);
const ok = (cond, msg) => (cond ? null : msg);

// [name, requirement, night, args, check(lines) -> null when OK]
const cases = [
  // ----- regression of Phase 1 requirements with standard numbers -----
  ['win_run', 'P1→P3: thắp 5 đèn rồi giữ sáng tới bình minh (Đêm rút còn 40 s)', 1, ['--seed', '42', '--ticks', '18000', ...sc('win_run'), ...inp('win_run')],
    (L) => ok(L.at(-1).state === 'won' && ev(L, 'game_over')[0].data.reason === 'dawn_survived' && L.at(-1).ticks === 2400 && ev(L, 'lantern_lit').length === 5, 'không thắng ở bình minh')],
  ['lose_no_flames', 'P1: hết 3 Ngọn Lửa -> thua no_flames', 1, ['--seed', '1', '--ticks', '3000', ...sc('lose')],
    (L) => ok(L.at(-1).state === 'lost' && ev(L, 'player_hit').length === 3 && ev(L, 'game_over')[0].data.reason === 'no_flames', 'không thua đúng')],
  ['dawn', 'P1/P3: hết giờ, 0 đèn sáng -> thua dawn ở tick 300 (5 s)', 1, ['--seed', '1', '--ticks', '2000', ...sc('dawn')],
    (L) => ok(ev(L, 'game_over')[0]?.tick === 300 && ev(L, 'game_over')[0].data.reason === 'dawn', 'không dawn ở tick 300')],
  ['pulse_stun', 'P1/P2: Tỏa Sáng tốn 3, choáng + đẩy lùi 4 m', 1, ['--seed', '1', '--ticks', '120', '--snapshot-every', '1', ...sc('pulse'), ...inp('pulse')],
    (L) => { const p = ev(L, 'pulse')[0]; const a = snapAt(L, 51), b = snapAt(L, 65);
      return ok(p?.data.stunned_ids[0] === 'S1' && a.player.carried === 2 && b.shades[0].state === 'stunned' && Math.abs(b.shades[0].pos[0] - a.shades[0].pos[0] - 4 * 14 / 15) < 0.01, 'pulse sai'); }],
  ['safe_zone', 'P1/P2: Bóng Mực bị chặn ở mép 6 m quanh đèn đã sáng', 1, ['--seed', '1', '--ticks', '1200', ...sc('safe_zone')],
    (L) => ok(ev(L, 'player_hit').length === 0, 'bị chạm trong vùng an toàn')],
  // ----- Ticket-03 (v1.2) -----
  ['fuel_out', 'P3: đèn hao 1/s, hết dầu -> lantern_out (fuel 3 -> tick 180)', 1, ['--seed', '1', '--ticks', '200', '--snapshot-every', '60', ...sc('fuel_out')],
    (L) => { const o = ev(L, 'lantern_out')[0]; const a = snapAt(L, 60).lanterns[0], b = snapAt(L, 180).lanterns[0];
      return ok(o?.tick === 180 && a.fuel === 2 && !b.lit && b.fuel === 0 && b.deposited === 0 && b.ever_lit, 'hao dầu sai'); }],
  ['refuel', 'P3: châm dầu used = ceil((100 − fuel)/10), +5 điểm mỗi con', 1, ['--seed', '1', '--ticks', '5', '--snapshot-every', '1', ...sc('refuel'), ...inp('interact_now')],
    (L) => { const r = ev(L, 'refuel')[0]; return ok(r?.data.amount === 5 && r.data.fuel === 100 && snapAt(L, 1).score === 25 && snapAt(L, 1).player.carried === 5, 'châm dầu sai'); }],
  ['relight', 'P3: thắp lại cần 5, +40, relight true, sức chứa 12', 1, ['--seed', '1', '--ticks', '5', '--snapshot-every', '1', ...sc('relight'), ...inp('interact_now')],
    (L) => { const l = ev(L, 'lantern_lit')[0]; const s1 = snapAt(L, 1);
      return ok(l?.data.relight === true && s1.score === 25 + 40 && s1.lanterns[0].relit_count === 1 && s1.player.capacity === 12, 'thắp lại sai'); }],
  ['drain', 'P3: Bóng Mực wander tới đèn yếu, drain 5/s, fuel_drain mỗi 60 tick', 1, ['--seed', '1', '--ticks', '400', '--snapshot-every', '100', ...sc('drain')],
    (L) => ok(snapAt(L, 100).shades[0].state === 'drain' && ev(L, 'fuel_drain').length >= 3 && ev(L, 'lantern_out').length === 1, 'drain sai')],
  ['dawn_win', 'P3: bình minh với 3/5 đèn sáng -> won dawn_survived, điểm bình minh', 1, ['--seed', '1', '--ticks', '300', ...sc('dawn_win')],
    (L) => ok(ev(L, 'game_over')[0]?.data.reason === 'dawn_survived' && L.at(-1).score === 148 + 88 + 58 + 150, 'thắng bình minh sai')],
  ['dawn_lose', 'P3: 1 đèn tắt trước bình minh -> 2/5 < 3 -> lost dawn', 1, ['--seed', '1', '--ticks', '300', ...sc('dawn_lose')],
    (L) => ok(ev(L, 'lantern_out')[0]?.tick === 60 && ev(L, 'game_over')[0]?.data.reason === 'dawn' && L.at(-1).ticks === 120, 'thua bình minh sai')],
  // ----- Ticket-02 standard numbers / new rules (regression) -----
  ['spawn_schedule_n1', 'P2: 20 đom đóm lúc đầu, Bóng Mực 2 con ở tick 300 rồi mỗi 480 tick', 1, ['--seed', '42', '--ticks', '1300', '--snapshot-every', '100', ...sc('spawn')],
    (L) => ok(ev(L, 'shade_spawned').map((e) => e.tick).join() === '300,300,780,1260', 'lịch sinh sai')],
  ['default_n1_motes', 'P2: màn mặc định 20 đom đóm, +1 mỗi 240 tick', 1, ['--seed', '7', '--ticks', '240', '--snapshot-every', '240'],
    (L) => ok(L[0].motes_active === 20 && snapAt(L, 240).motes_active === 21, 'số đom đóm sai')],
  ['dash', 'P2: Lướt 14 m/s × 12 tick, hồi chiêu 90 tick từ lúc bắt đầu', 1, ['--seed', '1', '--ticks', '100', '--snapshot-every', '1', ...sc('dash'), ...inp('dash')],
    (L) => ok(ev(L, 'dash').map((e) => e.tick).join() === '1,91' && Math.abs(snapAt(L, 12).player.pos[2] - 2.8) < 1e-3, 'dash sai')],
  ['fall', 'P2: rơi khỏi đảo -> −1 lửa, mất hết đom đóm, chờ 60 tick, hồi sinh', 1, ['--seed', '1', '--ticks', '300', '--snapshot-every', '1', ...sc('fall'), ...inp('fall')],
    (L) => { const h = ev(L, 'player_hit')[0]; const r = snapAt(L, h.tick + 60);
      return ok(h.data.by === 'fall' && h.data.lost === 4 && r.player.pos.join() === '0,0,0' && r.player.invuln === true, 'rơi sai'); }],
  ['hit_drop', 'P2: bị chạm -> rơi floor(n/2) đom đóm, Bóng Mực recoil', 1, ['--seed', '1', '--ticks', '5', '--snapshot-every', '1', ...sc('hit')],
    (L) => ok(ev(L, 'player_hit')[0].data.dropped === 2 && snapAt(L, 1).motes.filter((m) => m.kind === 'dropped').length === 2 && snapAt(L, 1).shades[0].state === 'recoil', 'hit sai')],
  ['evict', 'P2: đèn vừa thắp đẩy Bóng Mực ra mép trong ≤ 30 tick, không gây sát thương', 1, ['--seed', '1', '--ticks', '40', '--snapshot-every', '1', ...sc('evict'), ...inp('interact_now')],
    (L) => { const p = snapAt(L, 31).shades[0].pos; return ok(ev(L, 'lantern_lit').length === 1 && ev(L, 'player_hit').length === 0 && Math.hypot(p[0], p[2] - 25) >= 5.999, 'evict sai'); }],
  ['pause', 'P2: tạm dừng: tick tăng, sim_tick đứng yên, state paused', 1, ['--seed', '1', '--ticks', '60', '--snapshot-every', '1', ...sc('dash'), ...inp('pause')],
    (L) => { const a = snapAt(L, 30); return ok(ev(L, 'paused')[0]?.tick === 11 && ev(L, 'resumed')[0]?.tick === 41 && a.state === 'paused' && a.sim_tick === 10, 'pause sai'); }],
  ['pad_n2', 'P2: bục nhảy Đêm 2 đưa Mây sang đảo B', 2, ['--seed', '1', '--ticks', '120', '--snapshot-every', '120', ...sc('pad_n2')],
    (L) => { const p = snapAt(L, 120).player; return ok(Math.hypot(p.pos[0] - 70, p.pos[2]) <= 28 && p.grounded && p.flames === 3, 'không đáp đảo B'); }],
  ['pad_n3', 'P2: bục nhảy Đêm 3 đưa Mây lên tầng 2 (Y=6)', 3, ['--seed', '1', '--ticks', '120', '--snapshot-every', '120', ...sc('pad_n3')],
    (L) => { const p = snapAt(L, 120).player; return ok(p.pos[1] === 6 && p.grounded, 'không lên tầng 2'); }],
  ['drifter_steal', 'P2: Gió Lạc đuổi khi mang ≥ 5, cướp 3, bỏ chạy 240 tick rồi biến mất', 2, ['--seed', '1', '--ticks', '500', '--snapshot-every', '50', ...sc('drifter_steal')],
    (L) => { const st = ev(L, 'drifter_steal')[0]; return ok(st?.data.amount === 3 && st.data.carried === 3 && L.filter((l) => l.type === 'snapshot').at(-1).drifters[0].state === 'removed', 'cướp sai'); }],
  ['drifter_drop', 'P2: Tỏa Sáng trúng Gió Lạc đang mang đồ -> thả lại đom đóm', 2, ['--seed', '1', '--ticks', '5', '--snapshot-every', '1', ...sc('drifter_drop'), ...inp('pulse_now')],
    (L) => ok(ev(L, 'drifter_drop')[0]?.data.amount === 3 && snapAt(L, 1).motes.filter((m) => m.kind === 'dropped').length === 3, 'không thả')],
  ['charm', 'P2: nhặt Bùa Gió -> charm_picked, 600 tick, tốc độ 7.2', 2, ['--seed', '1', '--ticks', '100', '--snapshot-every', '10', ...sc('charm'), ...inp('charm')],
    (L) => ok(ev(L, 'charm_picked')[0]?.data.charm_ticks === 600 && snapAt(L, 30).charms[0].available === false, 'không nhặt bùa')],
  ['wind_n3', 'P2: gió Đêm 3 ở tick 1800, 300 tick, đẩy 2 m/s', 3, ['--seed', '3', '--ticks', '2160', '--snapshot-every', '60', ...sc('wind'), '--inputs', S + 'dash.inputs.json'],
    (L) => { const a = snapAt(L, 1800), b = snapAt(L, 1860), c = snapAt(L, 2160);
      return ok(a.wind.active && Math.abs(Math.hypot(b.player.pos[0] - a.player.pos[0], b.player.pos[2] - a.player.pos[2]) - 2) < 0.05 && !c.wind.active, 'gió sai'); }],
  ['default_n2', 'P2: Đêm 2 mặc định: 6 đèn, Gió Lạc ở tick 1200', 2, ['--seed', '5', '--ticks', '1300', '--snapshot-every', '1300'],
    (L) => ok(L[0].lanterns.length === 6 && L[0].charms.length === 1 && ev(L, 'shade_spawned').length >= 2, 'Đêm 2 sai')],
  ['default_n3', 'P2: Đêm 3 mặc định: 7 đèn, 2 bùa', 3, ['--seed', '5', '--ticks', '400', '--snapshot-every', '400'],
    (L) => ok(L[0].lanterns.length === 7 && L[0].charms.length === 2 && L[0].night === 3, 'Đêm 3 sai')],
];

const rows = [];
let fail = 0;
for (const [name, req, night, args, check] of cases) {
  const out = path.join(OUT, name + '.jsonl');
  const r = spawnSync(process.execPath, ['src/headless.js', '--night', String(night), ...args, '--out', out], { encoding: 'utf8' });
  let verdict, endInfo = '-', evs = '-';
  if (r.status !== 0) verdict = `LỖI exit ${r.status}: ${r.stderr.trim()}`;
  else {
    const L = fs.readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    let err;
    try { err = check(L); } catch (e) { err = 'kiểm tra lỗi: ' + e.message; }
    const end = L.at(-1);
    const names = L.filter((l) => l.type === 'event' && l.name !== 'night_start').map((l) => `${l.tick}:${l.name}`);
    endInfo = `${end.state}, ticks=${end.ticks}, score=${end.score}`;
    evs = names.slice(0, 5).join(', ') + (names.length > 5 ? ` … (+${names.length - 5})` : '');
    verdict = err ? `CHƯA ĐẠT (${err})` : 'ĐẠT';
  }
  if (verdict !== 'ĐẠT') fail++;
  rows.push(`| ${name} | ${night} | ${req} | ${endInfo} | ${evs} | ${verdict} |`);
}

// performance: a full night (21,600 ticks, default level, idle) must finish in <= 30 s
const perf = [];
for (const n of [1, 2, 3]) {
  const out = path.join('.tmp', `perf_n${n}.jsonl`);
  fs.mkdirSync('.tmp', { recursive: true });
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, ['src/headless.js', '--seed', '1', '--night', String(n), '--ticks', '21600', '--out', out, '--inputs', S + 'win_run.inputs.json']);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const okp = r.status === 0 && ms <= 30000;
  if (!okp) fail++;
  perf.push(`| Đêm ${n} | ${(ms / 1000).toFixed(2)} s | ${okp ? 'ĐẠT' : 'CHƯA ĐẠT'} |`);
}

// determinism: same seed + inputs -> identical bytes, per night
const det = [];
for (const n of [1, 2, 3]) {
  const h = [];
  for (let i = 0; i < 2; i++) {
    const out = path.join('.tmp', `det_n${n}_${i}.jsonl`);
    spawnSync(process.execPath, ['src/headless.js', '--seed', '7', '--night', String(n), '--ticks', '6000', '--inputs', S + 'win_run.inputs.json', '--out', out]);
    h.push(crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'));
  }
  if (h[0] !== h[1]) fail++;
  det.push(`| Đêm ${n} | \`${h[0].slice(0, 16)}…\` | \`${h[1].slice(0, 16)}…\` | ${h[0] === h[1] ? 'ĐẠT' : 'CHƯA ĐẠT'} |`);
}

const md = `# Bằng chứng headless – ${phase}

> Sinh tự động bởi \`node scripts/proof.js ${phase}\` từ CLI thật (\`src/headless.js\`). Không sửa tay.
> Commit gốc: \`${spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim()}\` · Node ${process.version}

## Scenario
| Scenario | Đêm | Yêu cầu | Kết thúc | Sự kiện đầu (tick:name) | Kết quả |
|---|---|---|---|---|---|
${rows.join('\n')}

## Hiệu năng headless (một Đêm đầy đủ 21.600 tick, yêu cầu ≤ 30 s)
| Đêm | Thời gian | Kết quả |
|---|---|---|
${perf.join('\n')}

## Tính tất định (seed 7, cùng inputs, chạy 2 lần, 6000 tick)
| Đêm | sha256 lần 1 | sha256 lần 2 | Kết quả |
|---|---|---|---|
${det.join('\n')}

Tái lập: \`npm run proof\` rồi \`git diff docs/proof/${phase}\` (chỉ SUMMARY.md đổi số đo thời gian).
`;
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), md);
console.log(md);
process.exit(fail ? 1 : 0);
