// Generates tests/scenarios/win_run.{scenario,inputs}.json:
// 5 motes on the line from the origin to each lantern; the player walks to each lantern
// (camera yaw pointed at it, move [0,1]), presses interact, walks back. No shades.
import fs from 'node:fs';

const contract = JSON.parse(fs.readFileSync('game.contract.json', 'utf8'));
const { player_speed, lantern_cost, interact_radius } = contract.tuning;
const RING = 25;
const motes = [];
const frames = [];
let t = 0;
const walkTicks = Math.round(((RING - interact_radius + 0.5) / player_speed) * 60);

for (let i = 0; i < 5; i++) {
  const deg = 72 * i;
  const a = (deg * Math.PI) / 180;
  for (let j = 0; j < lantern_cost; j++) {
    const r = 5 + j * 3;
    motes.push([+(r * Math.sin(a)).toFixed(3), 0, +(r * Math.cos(a)).toFixed(3)]);
  }
  frames.push({ tick: t, move: [0, 1], cam_yaw_deg: deg });
  frames.push({ tick: t + walkTicks, move: [0, 0], interact: true });
  frames.push({ tick: t + walkTicks + 1, interact: false, move: [0, -1] });
  t += 2 * walkTicks + 1;
}
frames.push({ tick: t, move: [0, 0] });

fs.writeFileSync('tests/scenarios/win_run.scenario.json',
  JSON.stringify({ random_motes: false, random_shades: false, motes, shades: [] }, null, 2) + '\n');
fs.writeFileSync('tests/scenarios/win_run.inputs.json', JSON.stringify({ frames }, null, 2) + '\n');
console.log(`win_run: ${frames.length} frames, last tick ${t}`);
