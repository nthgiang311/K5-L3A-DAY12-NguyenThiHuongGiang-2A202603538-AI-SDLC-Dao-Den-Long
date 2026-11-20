// Runs the headless proof scenarios through the real CLI and writes outputs + an auto-generated
// summary to docs/proof/<phase>/. Nothing in that folder is edited by hand.
// Usage: node scripts/proof.js [phase-1]
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const phase = process.argv[2] || 'phase-1';
const OUT = path.join('docs', 'proof', phase);
fs.mkdirSync(OUT, { recursive: true });
const S = 'tests/scenarios/';

// [name, requirement, args, expectation(lines) -> string|null (null = ok)]
const cases = [
  ['win_run', 'Chơi hết Đêm 1 tới thắng (thắp 5 đèn)', ['--seed', '42', '--ticks', '18000', '--scenario', S + 'win_run.scenario.json', '--inputs', S + 'win_run.inputs.json'],
    (L) => L.at(-1).state === 'won' && L.filter((l) => l.name === 'lantern_lit').length === 5 ? null : 'không thắng'],
  ['lose_no_flames', 'Bị Bóng Mực chạm hết lửa -> thua', ['--seed', '1', '--ticks', '2000', '--scenario', S + 'lose.scenario.json'],
    (L) => L.at(-1).state === 'lost' && L.filter((l) => l.name === 'player_hit').length === 3 ? null : 'không thua đúng'],
  ['dawn', 'Hết thời gian Đêm -> thua (dawn)', ['--seed', '1', '--ticks', '2000', '--scenario', S + 'dawn.scenario.json'],
    (L) => L.some((l) => l.name === 'game_over' && l.data.reason === 'dawn' && l.tick === 300) ? null : 'không dawn ở tick 300'],
  ['pulse_stun', 'Tỏa sáng xua Bóng Mực (stun + đẩy lùi, tốn ánh sáng)', ['--seed', '1', '--ticks', '240', '--scenario', S + 'pulse.scenario.json', '--inputs', S + 'pulse.inputs.json'],
    (L) => { const p = L.find((l) => l.name === 'pulse'); return p && p.data.stunned_ids.includes('S1') && !L.some((l) => l.name === 'player_hit') ? null : 'pulse không stun S1'; }],
  ['safe_zone', 'Bóng Mực không vào được bán kính đèn đã thắp', ['--seed', '1', '--ticks', '1200', '--scenario', S + 'safe_zone.scenario.json'],
    (L) => !L.some((l) => l.name === 'player_hit') ? null : 'bị chạm trong vùng an toàn'],
  ['default_idle_seed42', 'Màn mặc định: 25 đom đóm rải rác, 2 Bóng Mực đuổi người đứng yên', ['--seed', '42', '--ticks', '3600', '--snapshot-every', '120'],
    (L) => {
      const S = L.filter((l) => l.type === 'snapshot');
      const d = (s) => Math.min(...s.shades.map((x) => Math.hypot(x.pos[0], x.pos[2])));
      return S[0].motes_active === 25 && S[0].shades.length === 2 && d(S[2]) < d(S[0]) ? null : 'màn mặc định sai';
    }],
  ['shade_spawn', 'Bóng Mực mới sinh mỗi 30 s (shade_spawned, id duy nhất)', ['--seed', '5', '--ticks', '3700', '--scenario', S + 'spawn.scenario.json'],
    (L) => L.filter((l) => l.name === 'shade_spawned').map((l) => l.tick).join() === '1800,3600' ? null : 'không sinh ở tick 1800, 3600'],
];

const rows = [];
let fail = 0;
for (const [name, req, args, check] of cases) {
  const out = path.join(OUT, name + '.jsonl');
  const r = spawnSync(process.execPath, ['src/headless.js', '--night', '1', ...args, '--out', out], { encoding: 'utf8' });
  let verdict;
  if (r.status !== 0) verdict = `LỖI exit ${r.status}: ${r.stderr.trim()}`;
  else {
    const L = fs.readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const err = check(L);
    const end = L.at(-1);
    const events = L.filter((l) => l.type === 'event').map((l) => `${l.tick}:${l.name}`);
    verdict = err ? `CHƯA ĐẠT (${err})` : 'ĐẠT';
    rows.push(`| ${name} | ${req} | ${end.state}, ticks=${end.ticks}, score=${end.score} | ${events.slice(0, 6).join(', ')}${events.length > 6 ? ` … (+${events.length - 6})` : ''} | ${verdict} |`);
  }
  if (verdict !== 'ĐẠT') fail++;
  if (r.status !== 0) rows.push(`| ${name} | ${req} | - | - | ${verdict} |`);
}

// determinism: run the default level twice with the same seed + inputs and compare hashes
const det = [];
for (let i = 0; i < 2; i++) {
  const out = path.join(OUT, `determinism_run${i + 1}.jsonl`);
  spawnSync(process.execPath, ['src/headless.js', '--seed', '7', '--night', '1', '--ticks', '5000', '--inputs', S + 'win_run.inputs.json', '--out', out]);
  det.push(crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'));
}
const detOk = det[0] === det[1];
if (!detOk) fail++;

const md = `# Bằng chứng headless – ${phase}

> File này do \`node scripts/proof.js ${phase}\` sinh tự động từ CLI thật (\`src/headless.js\`). Không sửa tay.
> Commit: \`${spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim()}\` (commit trước khi sinh) · Node ${process.version}

| Scenario | Yêu cầu | Kết thúc | Sự kiện đầu (tick:name) | Kết quả |
|---|---|---|---|---|
${rows.join('\n')}

**Tính tất định:** seed 7 + \`win_run.inputs.json\` trên màn mặc định, chạy 2 lần, 5000 tick:
- run1 sha256 \`${det[0]}\`
- run2 sha256 \`${det[1]}\`
- ${detOk ? 'ĐẠT: giống hệt nhau' : 'CHƯA ĐẠT: khác nhau'}

Tái lập: \`npm run proof\` rồi \`git diff docs/proof/\` (phải không đổi).
`;
fs.writeFileSync(path.join(OUT, 'SUMMARY.md'), md);
console.log(md);
process.exit(fail ? 1 : 0);
