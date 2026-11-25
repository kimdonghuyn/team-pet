// What the server tests share: a free port, a throwaway folder, a real server process, and a
// plain HTTP call to it (with whatever Host and headers another PC or another site would send).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server', 'index.js');

// A port the OS just gave out: picking one at random can hit a range Windows keeps for
// Hyper-V or WSL, where nothing may listen.
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

export const tempDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `team-pet-${tag}-`));

// One HTTP call. host: the Host header (this PC by default); json: a body sent as JSON from this
// PC's own page (content type and Origin set), or body: raw text with the given headers.
export function call(port, method, urlPath, { host = `localhost:${port}`, headers = {}, json, body } = {}) {
  const text = json !== undefined ? JSON.stringify(json) : body;
  const sent = {
    host,
    ...(json !== undefined ? { 'content-type': 'application/json', origin: `http://localhost:${port}` } : {}),
    // Node leaves the length out of a DELETE with a body unless told; browsers always send it.
    ...(text !== undefined ? { 'content-length': Buffer.byteLength(text) } : {}),
    ...headers,
  };
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path: urlPath, headers: sent }, (res) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(parts).toString('utf8');
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: raw, data });
      });
    });
    req.on('error', reject);
    if (text !== undefined) req.write(text);
    req.end();
  });
}

// The server as its own process, with these arguments and a settings file of the test's own (the
// person's real ~/.team-pet is never touched). ready resolves once it says it is open; log() is
// everything it printed so far.
export function runServer(args, { config, env = {} } = {}) {
  const child = spawn(process.execPath, [SERVER, ...args, ...(config ? ['--config', config] : [])], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TEAM_PET_CONFIG: '', ...env },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const ready = new Promise((resolve, reject) => {
    const check = () => { if (out.includes('is open at')) resolve(); };
    child.stdout.on('data', check);
    child.once('exit', (code) => reject(new Error(`the server ended before it opened (${code}):\n${out}`)));
  });
  return { child, ready, log: () => out, stop: () => { if (child.exitCode === null) child.kill(); } };
}
