// Tiny static server for the 3D client: serves web/, src/sim/, game.contract.json and three.js.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const ALLOWED = ['/web/', '/src/sim/', '/node_modules/three/build/', '/game.contract.json'];

http
  .createServer((req, res) => {
    let url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url === '/') url = '/web/index.html';
    const file = path.normalize(path.join(ROOT, url));
    if (!file.startsWith(ROOT) || !ALLOWED.some((p) => url.startsWith(p))) {
      res.writeHead(404).end('not found');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end('not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  })
  .listen(PORT, () => console.log(`Đảo Đèn Lồng: mở http://localhost:${PORT} trong trình duyệt (Ctrl+C để dừng)`));
