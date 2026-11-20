#!/usr/bin/env node
// Benchmark (Ticket-04 §1): node scripts/bench.js --seed 42 --duration 30 --out bench.json
// Starts the game server, opens a real Chromium-based browser window (1280x720, vsync off via
// --disable-gpu-vsync --disable-frame-rate-limit) on the bench scene, receives the frame timings and writes bench.json.
// Browser: $CHROME_PATH, else Google Chrome / Chromium / Microsoft Edge in the usual locations.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGameServer } from '../server.js';

const procStart = Date.now() - process.uptime() * 1000; // epoch ms when this process started
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const seed = parseInt(args.seed ?? '42', 10);
const duration = parseFloat(args.duration ?? '30');
const out = args.out;
if (!out || !Number.isInteger(seed) || !(duration > 0)) {
  process.stderr.write('usage: bench.js --seed <int> --duration <s> --out <bench.json>\n');
  process.exit(1);
}

function findBrowser() {
  const c = [process.env.CHROME_PATH];
  if (process.platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else if (process.platform === 'win32') {
    const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA];
    for (const b of pf.filter(Boolean)) c.push(path.join(b, 'Google/Chrome/Application/chrome.exe'), path.join(b, 'Microsoft/Edge/Application/msedge.exe'));
  } else {
    for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      try { c.push(execFileSync('which', [n], { encoding: 'utf8' }).trim()); } catch {}
    }
  }
  return c.find((p) => p && fs.existsSync(p));
}

// RSS of the browser process tree (MB), asynchronous so it never blocks the server or steals a frame.
// ps on macOS/Linux; wmic (lighter than PowerShell) on Windows.
import { execFile } from 'node:child_process';
function treeRssMb(rootPid, cb) {
  const parse = (rows) => {
    const kids = new Map();
    for (const [pid, ppid] of rows) (kids.get(ppid) || kids.set(ppid, []).get(ppid)).push(pid);
    const rss = new Map(rows.map(([pid, , kb]) => [pid, kb]));
    let total = 0;
    const stack = [rootPid], seen = new Set();
    while (stack.length) {
      const p = stack.pop();
      if (seen.has(p)) continue;
      seen.add(p);
      total += rss.get(p) || 0;
      stack.push(...(kids.get(p) || []));
    }
    return total / 1024;
  };
  if (process.platform === 'win32') {
    execFile('wmic', ['process', 'get', 'ProcessId,ParentProcessId,WorkingSetSize', '/format:csv'], (err, out) => {
      if (err) return cb(null);
      // Node,ParentProcessId,ProcessId,WorkingSetSize
      const rows = out.trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((c) => c.length >= 4).map((c) => [+c[2], +c[1], +c[3] / 1024]);
      cb(parse(rows));
    });
  } else {
    execFile('ps', ['-A', '-o', 'pid=,ppid=,rss='], (err, out) => {
      if (err) return cb(null);
      cb(parse(out.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number))));
    });
  }
}

const browserPath = findBrowser();
if (!browserPath) {
  process.stderr.write('error: no Chrome/Chromium/Edge found - set CHROME_PATH\n');
  process.exit(1);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-bench-'));
let browser = null, peakMb = null, memTimer = null, measuring = false, done = false;
const finish = (code, msg) => {
  if (done) return;
  done = true;
  clearInterval(memTimer);
  if (msg) process.stderr.write(msg + '\n');
  try { browser && browser.kill(); } catch {}
  setTimeout(() => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    process.exit(code);
  }, 500);
};

const server = createGameServer((req, res, url) => {
  if (url === '/bench/measure-start') {
    measuring = true;
    if (process.env.BENCH_DEBUG) process.stderr.write(`measure-start at ${Date.now() - procStart} ms
`);
    res.writeHead(204).end();
    return true;
  }
  if (url === '/bench/result' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      res.writeHead(204).end();
      const r = JSON.parse(body);
      measuring = false;
      // a memory sample can take long while the browser saturates the CPU (wmic on Windows):
      // take one more sample now and wait for it (max 30 s) before writing the report
      let written = false;
      const write = () => {
        if (written) return;
        written = true;
        writeReport(r);
      };
      treeRssMb(browser.pid, (mb) => {
        if (mb !== null) peakMb = Math.max(peakMb ?? 0, mb);
        write();
      });
      setTimeout(write, 30000);
    });
    return true;
  }
  return false;
});

function writeReport(r) {
      const report = {
        contract_version: '1.3',
        avg_fps: r.avg_fps,
        p1_low_fps: r.p1_low_fps,
        frame_ms_p95: r.frame_ms_p95,
        frames: r.frames,
        load_ms: Math.round(r.first_frame_epoch_ms - procStart),
        peak_mem_mb: peakMb === null ? null : Math.round(peakMb),
        vsync_off: true,
        renderer: `three.js r${r.three} WebGL2 – ${r.gl_renderer} – ${path.basename(browserPath)} (${r.ua})`,
        os: `${os.type()} ${os.release()} ${os.arch()} – ${os.cpus()[0]?.model} – ${Math.round(os.totalmem() / 1073741824)} GB`,
        viewport: r.viewport,
        notes: `vsync disabled with --disable-gpu-vsync --disable-frame-rate-limit; peak_mem_mb = max RSS of the whole browser process tree (${process.platform === 'win32' ? 'sampled once right after measuring, wmic' : 'sampled every 3 s during measuring, ps'})`,
      };
      fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
      console.log(JSON.stringify(report, null, 2));
      finish(0);
}

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/?bench=1&seed=${seed}&duration=${duration}`;
  browser = spawn(browserPath, [
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--window-position=0,0', '--window-size=1280,720', `--app=${url}`,
  ], { stdio: 'ignore' });
  browser.on('exit', (c) => finish(1, `error: browser exited early (code ${c})`));
  let busy = false;
  memTimer = setInterval(() => {
    if (process.env.BENCH_DEBUG) process.stderr.write(`tick measuring=${measuring} busy=${busy}
`);
    // Windows: wmic is CPU-heavy and would steal frames -> sample only once, right after measuring
    if (!measuring || busy || process.platform === 'win32') return;
    busy = true;
    treeRssMb(browser.pid, (mb) => {
      if (process.env.BENCH_DEBUG) process.stderr.write(`mem sample pid=${browser.pid} mb=${mb}
`);
      busy = false;
      if (mb !== null) peakMb = Math.max(peakMb ?? 0, mb);
    });
  }, 3000);
  setTimeout(() => finish(1, 'error: bench timed out'), (duration + 90) * 1000);
});
