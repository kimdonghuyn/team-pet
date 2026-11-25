// Small HTTP pieces the server is built from: answering in JSON, reading a request's JSON body,
// telling this PC's own page apart from other sites, and handing out the page's files.
import fs from 'node:fs';
import path from 'node:path';

// Requests bigger than this are someone else's mistake (a chat picture is far below it).
export const BODY_LIMIT = 1_000_000;

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
]);
export const typeOf = (file) => TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream';

export function json(res, status, value) {
  const text = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

// An error thrown while handling a request, as the answer: its own status (404, 409 …) or 400.
export function fail(res, err) {
  json(res, err?.status || 400, { error: String(err?.message || err) });
}

// The raw body as text; a body over the limit is refused with 413 once it has all arrived
// (cutting the connection early would leave the sender without an answer).
export function readBody(req, limit = BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (chunk) => { size += chunk.length; if (size <= limit) parts.push(chunk); });
    req.on('end', () => {
      if (size > limit) reject(Object.assign(new Error('request body too large'), { status: 413 }));
      else resolve(Buffer.concat(parts).toString('utf8'));
    });
    req.on('error', reject);
  });
}

// The body parsed as JSON (a broken one is a 400, as any thrown error).
export async function readJsonBody(req, limit = BODY_LIMIT) {
  const text = await readBody(req, limit);
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('the body is not valid JSON'), { status: 400 }); }
}

// Other web pages open in this PC's browser can send requests to this server too. Two checks keep
// them out of what is only this PC's:
//  - the Host header must name this machine itself. A page that points its own domain at
//    127.0.0.1 (DNS rebinding) still sends its domain as the Host, so it is turned away;
//  - a change must come with this server's own Origin (or none, from a program) and a JSON body.
//    A form on another site cannot send JSON, and a script there would need a CORS preflight,
//    which this server never answers.
const SELF_NAMES = ['localhost', '127.0.0.1', '[::1]'];
export function hostIsSelf(req) {
  const host = String(req.headers.host || '').toLowerCase();
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d+$/, '');
  return SELF_NAMES.includes(name);
}
export function fromOwnPage(req) {
  const { origin } = req.headers;
  return origin === undefined || origin === `http://${req.headers.host}`;
}
export const sentJson = (req) => /^application\/json(\s*;|$)/i.test(String(req.headers['content-type'] || ''));

// The page's file at the URL path, from dir only: '/' is index.html; a path that is not valid
// percent-encoding is a 400; one that climbs out of dir ('..') is a 403; a missing file is a 404.
export function servePage(res, dir, pathname) {
  let rel;
  try { rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, ''); } catch {
    res.writeHead(400, { 'content-type': 'text/plain' });
    return res.end('bad path');
  }
  const file = path.resolve(dir, rel);
  if (!file.startsWith(path.resolve(dir) + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'content-type': typeOf(file), 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

// Live updates for a page (server-sent events): the first message at once, then send(value)
// for each later one; gone() tells when the page went away.
export function openStream(req, res, first) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const send = (value) => res.write(`data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`);
  send(first);
  return { send, gone: (fn) => req.on('close', fn) };
}
