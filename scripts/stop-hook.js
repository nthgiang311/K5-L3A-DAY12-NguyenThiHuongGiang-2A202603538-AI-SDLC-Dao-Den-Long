// Claude Code Stop hook: block the agent from finishing while tests are red.
// Exit 2 + stderr => Claude Code keeps the agent working and shows it the failure.
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    if (JSON.parse(input || '{}').stop_hook_active) process.exit(0); // avoid infinite loop
  } catch {}
  // run node directly: npm itself can fail for unrelated reasons (e.g. no disk space for its logs)
  const r = spawnSync(process.execPath, ['--test', 'tests/sim.test.js', 'tests/headless.test.js', 'tests/leaderboard.test.js'], { encoding: 'utf8' });
  if (r.status !== 0) {
    const out = (r.stdout || '') + (r.stderr || '') + (r.error ? r.error.message : '');
    const lines = out.split('\n');
    const fails = lines.filter((l) => /not ok|✖|ENOSPC|Error/.test(l)).slice(0, 20);
    const detail = (fails.length ? fails : lines.slice(-15)).join('\n');
    process.stderr.write(`Test đang đỏ – sửa trước khi kết thúc:\n${detail}\n`);
    process.exit(2);
  }
  process.exit(0);
});
