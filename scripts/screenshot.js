#!/usr/bin/env node
// Captures the README screenshot: node scripts/screenshot.js [docs/demo/screenshot.png]
// Opens the game in a real Chrome/Chromium/Edge window (?shot=1 staged scene) and saves the WebGL canvas as PNG.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createGameServer } from '../server.js';

const out = process.argv[2] || 'docs/demo/screenshot.png';
const cands = [process.env.CHROME_PATH];
if (process.platform === 'darwin') cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium');
else if (process.platform === 'win32') for (const b of [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) cands.push(path.join(b, 'Google/Chrome/Application/chrome.exe'), path.join(b, 'Microsoft/Edge/Application/msedge.exe'));
else for (const n of ['google-chrome', 'chromium', 'chromium-browser']) { try { cands.push(execFileSync('which', [n], { encoding: 'utf8' }).trim()); } catch {} }
const browserPath = cands.find((p) => p && fs.existsSync(p));
if (!browserPath) { process.stderr.write('error: no Chrome/Chromium/Edge found - set CHROME_PATH\n'); process.exit(1); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ddl-shot-'));
let browser;
const server = createGameServer((req, res, url) => {
  if (url !== '/shot' || req.method !== 'POST') return false;
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    res.writeHead(204).end();
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'));
    console.log(`saved ${out}`);
    browser.kill();
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(0); }, 500);
  });
  return true;
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/?shot=1`;
  browser = spawn(browserPath, [`--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,720', `--app=${url}`], { stdio: 'ignore' });
  setTimeout(() => { process.stderr.write('error: screenshot timed out\n'); browser.kill(); process.exit(1); }, 90000);
});
