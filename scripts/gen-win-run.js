// Generates tests/scenarios/win_run.{scenario,inputs}.json for night 1:
// (Ticket-03: no early win -> the night is shortened to 40 s so dawn comes while the lanterns still burn)
// lantern_cost motes on the straight line from the start to each lantern; the player walks to each
// lantern (camera yaw pointed at it, move [0,1]), presses interact, walks back. No shades.
import fs from 'node:fs';
import { LEVELS } from '../src/sim/levels.js';

const { player_speed, lantern_cost, interact_radius } = JSON.parse(fs.readFileSync('game.contract.json', 'utf8')).tuning;
const motes = [];
const frames = [];
let t = 0;
for (const [x, , z] of LEVELS[1].lanterns) {
  const dist = Math.hypot(x, z);
  const ux = x / dist, uz = z / dist;
  const yaw = (Math.atan2(x, z) * 180) / Math.PI; // move [0,1] -> (sin yaw, cos yaw)
  const walk = dist - interact_radius + 0.5; // stop 1.5 m before the lantern
  for (let j = 0; j < lantern_cost; j++) {
    const r = 3 + j * ((walk - 4) / (lantern_cost - 1));
    motes.push([+(r * ux).toFixed(3), 0, +(r * uz).toFixed(3)]);
  }
  const walkTicks = Math.round((walk / player_speed) * 60);
  frames.push({ tick: t, move: [0, 1], cam_yaw_deg: +yaw.toFixed(4) });
  frames.push({ tick: t + walkTicks, move: [0, 0], interact: true });
  frames.push({ tick: t + walkTicks + 1, interact: false, move: [0, -1] });
  t += 2 * walkTicks + 1;
}
frames.push({ tick: t, move: [0, 0] });

fs.writeFileSync('tests/scenarios/win_run.scenario.json',
  JSON.stringify({ random_motes: false, random_shades: false, motes, shades: [], time_left_s: 40 }, null, 2) + '\n');
fs.writeFileSync('tests/scenarios/win_run.inputs.json', JSON.stringify({ frames }, null, 2) + '\n');
console.log(`win_run: ${frames.length} frames, last tick ${t}`);
