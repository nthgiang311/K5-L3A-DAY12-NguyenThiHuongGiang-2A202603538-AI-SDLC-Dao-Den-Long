// Static server for the 3D client + local leaderboard API.
//   node server.js                                  -> play at http://localhost:8080
//   node server.js --export-leaderboard out.json    -> writes {"entries": [...]} and exits
// The leaderboard is stored on disk in data/leaderboard.json (survives restarts).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntry, sortEntries, validEntry, MAX_ENTRIES } from './src/leaderboard.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const ALLOWED = ['/web/', '/src/sim/', '/src/leaderboard.js', '/node_modules/three/build/', '/game.contract.json'];
export const LB_FILE = process.env.DDL_LEADERBOARD || path.join(ROOT, 'data', 'leaderboard.json');

export function loadLeaderboard(file = LB_FILE) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    return sortEntries((doc.entries || []).filter(validEntry)).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}
function saveLeaderboard(entries, file = LB_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ entries }, null, 2) + '\n');
}

// extra routes (used by scripts/bench.js); return true when handled
export function createGameServer(extra = () => false) {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (extra(req, res, url)) return;
    if (url === '/api/leaderboard' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] }).end(JSON.stringify({ entries: loadLeaderboard() }));
      return;
    }
    if (url === '/api/leaderboard' && req.method === 'POST') {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        try {
          const entries = addEntry(loadLeaderboard(), JSON.parse(body));
          saveLeaderboard(entries);
          res.writeHead(200, { 'Content-Type': MIME['.json'] }).end(JSON.stringify({ entries }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': MIME['.json'] }).end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    const file = path.normalize(path.join(ROOT, url === '/' ? '/web/index.html' : url));
    const rel = url === '/' ? '/web/index.html' : url;
    if (!file.startsWith(ROOT) || !ALLOWED.some((p) => rel.startsWith(p))) {
      res.writeHead(404).end('not found');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
}

function main() {
  const i = process.argv.indexOf('--export-leaderboard');
  if (i >= 0) {
    const out = process.argv[i + 1];
    if (!out) {
      process.stderr.write('usage: node server.js --export-leaderboard out.json\n');
      process.exit(1);
    }
    fs.writeFileSync(out, JSON.stringify({ entries: loadLeaderboard() }, null, 2) + '\n');
    process.exit(0);
  }
  const PORT = Number(process.env.PORT) || 8080;
  createGameServer().listen(PORT, () => console.log(`Đảo Đèn Lồng: mở http://localhost:${PORT} trong trình duyệt (Ctrl+C để dừng)`));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
