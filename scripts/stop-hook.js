// Claude Code Stop hook: block the agent from finishing while tests are red.
// Exit 2 + stderr => Claude Code keeps the agent working and shows it the failure.
import { spawnSync } from 'node:child_process';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    if (JSON.parse(input || '{}').stop_hook_active) process.exit(0); // avoid infinite loop
  } catch {}
  const r = spawnSync('npm', ['test', '--silent'], { encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    const tail = (r.stdout + r.stderr).split('\n').filter((l) => /not ok|✖|fail|Error/.test(l)).slice(0, 20).join('\n');
    process.stderr.write(`npm test đang đỏ – sửa trước khi kết thúc:\n${tail}\n`);
    process.exit(2);
  }
  process.exit(0);
});
