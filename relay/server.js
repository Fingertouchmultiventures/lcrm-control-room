'use strict';
/*
 * LCRM Facebook relay
 * -------------------
 * Receives the control room's program video (WebM chunks) over a WebSocket,
 * feeds it to FFmpeg, and FFmpeg pushes it to Facebook Live (RTMPS).
 * It also serves the ../app folder at http://localhost:8787/ so the control room
 * can be used straight from this laptop.
 *
 * No npm packages needed - only Node.js and FFmpeg.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';          // only this computer can connect
const TOKEN = process.env.TOKEN || '';                  // optional shared password
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const APP_DIR = process.env.APP_DIR || path.join(__dirname, '..', 'app');
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const LAN = process.env.LAN === '1', LAN_PORT = Number(process.env.LAN_PORT) || 8788;
function lanUrls() { const out = []; const ni = require('os').networkInterfaces(); Object.values(ni).forEach(a => (a || []).forEach(i => { if (i.family === 'IPv4' && !i.internal) out.push(i.address); })); return out; }
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 32 * 1024 * 1024;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const ff = spawnSync(FFMPEG, ['-version'], { encoding: 'utf8' });
const FFMPEG_OK = !ff.error && ff.status === 0;
const FFMPEG_VERSION = FFMPEG_OK ? (ff.stdout.split('\n')[0] || 'ffmpeg') : null;

// ---------- static files ----------
function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/lan-info') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ lan: LAN, urls: LAN ? lanUrls().map(ip => `https://${ip}:${LAN_PORT}/`) : [] }));
  }
  if (url.pathname === '/relay-status') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ ok: true, ffmpeg: FFMPEG_VERSION }));
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' ) rel = '/index.html';
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(path.normalize(APP_DIR))) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('LCRM relay is running. (App files not found in ' + APP_DIR + ')'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}
const server = http.createServer(handler);

// ---------- minimal WebSocket (RFC 6455) ----------
class Conn {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frags = []; this.fragOp = 0; this.closed = false;
    this.onText = () => {}; this.onBinary = () => {}; this.onClose = () => {};
    socket.setNoDelay(true); socket.setKeepAlive(true, 15000);
    socket.on('data', d => { this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d; try { this.parse(); } catch (e) { this.close(); } });
    socket.on('close', () => this.finish()); socket.on('error', () => this.finish());
  }
  finish() { if (!this.closed) { this.closed = true; this.onClose(); } }
  parse() {
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > MAX_FRAME) throw new Error('frame too large');
      const need = off + (masked ? 4 : 0) + len; if (b.length < need) return;
      let payload = b.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const m = b.subarray(off, off + 4); const out = Buffer.allocUnsafe(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3]; payload = out; }
      else payload = Buffer.from(payload);
      this.buf = b.subarray(need);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.frame(10, payload); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2) { this.fragOp = op; this.frags = []; }
      this.frags.push(payload);
      if (fin) {
        const full = this.frags.length === 1 ? this.frags[0] : Buffer.concat(this.frags); this.frags = [];
        if (this.fragOp === 1) this.onText(full.toString('utf8')); else this.onBinary(full);
      }
    }
  }
  frame(op, payload) {
    if (this.closed) return;
    const len = payload.length; let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(obj) { this.frame(1, Buffer.from(JSON.stringify(obj))); }
  close() { try { this.frame(8, Buffer.alloc(0)); this.socket.end(); } catch (e) {} this.finish(); }
}

function onUpgrade(req, socket, fromLan) {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin || '', isSig = url.pathname === '/sig';
  let originOk = !origin;
  if (origin) {
    try {
      const h = new URL(origin).hostname, hostHdr = (req.headers.host || '').replace(/:\d+$/, '');
      originOk = h === 'localhost' || h === '127.0.0.1' || ALLOW_ORIGINS.includes(origin) || ALLOW_ORIGINS.includes('*') || (isSig && h === hostHdr);
    } catch (e) {}
  }
  const key = req.headers['sec-websocket-key'];
  // the church-network (LAN) server only ever offers the phone/TV introduction service, never the Facebook streaming one
  if (!key || !originOk || (fromLan && !isSig) || (!isSig && TOKEN && url.searchParams.get('token') !== TOKEN)) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    if (!originOk) console.log('Blocked connection from origin', origin, '- add it to ALLOW_ORIGINS in start.bat');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const c = new Conn(socket); if (isSig) signalSession(c); else if (url.searchParams.get('mode') === 'record') recordSession(c); else session(c);
}
server.on('upgrade', (req, socket) => onUpgrade(req, socket, false));

// ---------- tiny realtime tree for phones / TV to find the control room with NO internet (same job as Firebase) ----------
const tree = {}, sigSessions = new Set(); let pushSeq = 0;
const parts = p => String(p).split('/').filter(Boolean);
const getAt = (t, p) => parts(p).reduce((o, k) => (o == null || typeof o !== 'object' ? undefined : o[k]), t);
function setAt(p, v) {
  const ks = parts(p); if (!ks.length) return; let o = tree;
  ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
  if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v;
}
function notifyAll() {
  sigSessions.forEach(s => s.subs.forEach((sub, id) => {
    const v = getAt(tree, sub.path);
    if (sub.kind === 'value') { const str = JSON.stringify(v === undefined ? null : v); if (str !== sub.last) { sub.last = str; s.conn.send({ id, t: 'value', v: v === undefined ? null : v }); } }
    else {
      const keys = v && typeof v === 'object' ? Object.keys(v).sort() : [];
      sub.seen.forEach(k => { if (!keys.includes(k)) sub.seen.delete(k); });
      keys.forEach(k => { if (!sub.seen.has(k)) { sub.seen.add(k); s.conn.send({ id, t: 'child', k, v: v[k] }); } });
    }
  }));
}
function signalSession(conn) {
  const s = { conn, subs: new Map(), dc: new Set() }; sigSessions.add(s);
  conn.onText = txt => {
    let m; try { m = JSON.parse(txt); } catch (e) { return; }
    if (m.op === 'set') { setAt(m.path, m.value); notifyAll(); }
    else if (m.op === 'remove') { setAt(m.path, null); notifyAll(); }
    else if (m.op === 'push') { setAt(m.path + '/' + Date.now().toString(36) + String(pushSeq++).padStart(4, '0'), m.value); notifyAll(); }
    else if (m.op === 'dc') s.dc.add(m.path);
    else if (m.op === 'sub') { s.subs.set(m.id, { path: m.path, kind: m.kind, last: '__none__', seen: new Set() }); notifyAll(); }
    else if (m.op === 'unsub') s.subs.delete(m.id);
  };
  conn.onClose = () => { sigSessions.delete(s); s.dc.forEach(p => setAt(p, null)); notifyAll(); };
}


// ---------- recording of the service on this laptop (separate from Facebook) ----------
// The browser sends the picture+sound; we write it to disk at once (safe even if something crashes),
// then turn it into a clean, smooth MP4 (fixed 30 fps, sound kept in sync) that plays everywhere and can be uploaded to Facebook.
const REC_DIR = process.env.REC_DIR || path.join(__dirname, 'recordings');
function recordSession(conn) {
  let out = null, raw = '', base = '', bytes = 0, finished = false;
  conn.send({ type: 'hello', ffmpeg: FFMPEG_VERSION, dir: REC_DIR });
  conn.onText = txt => {
    let m; try { m = JSON.parse(txt); } catch (e) { return; }
    if (m.cmd === 'record' && !out) {
      try { fs.mkdirSync(REC_DIR, { recursive: true }); } catch (e) {}
      const d = new Date(), p = n => String(n).padStart(2, '0');
      base = 'LCRM-service-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
      raw = path.join(REC_DIR, base + '.webm');
      try { out = fs.createWriteStream(raw); out.on('error', e => conn.send({ type: 'error', message: 'Cannot write to ' + REC_DIR + ': ' + e.message })); }
      catch (e) { return conn.send({ type: 'error', message: 'Cannot write to ' + REC_DIR + ': ' + e.message }); }
      console.log(new Date().toLocaleTimeString(), 'Recording ->', raw); conn.send({ type: 'recording', file: raw });
    } else if (m.cmd === 'stop') finish();
  };
  conn.onBinary = buf => { if (out) { bytes += buf.length; out.write(buf); } };
  conn.onClose = () => finish();
  function finish() {
    if (finished || !out) return; finished = true;
    const o = out; out = null;
    o.end(() => {
      if (!FFMPEG_OK || bytes < 2000) return conn.send({ type: 'recdone', raw, mp4: null, note: FFMPEG_OK ? 'Nothing was recorded.' : 'FFmpeg was not found, so the raw recording was kept as it is.' });
      const mp4 = path.join(REC_DIR, base + '.mp4');
      conn.send({ type: 'converting', raw });
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-fflags', '+genpts', '-i', raw,
        '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-g', '60',
        '-af', 'aresample=async=1:first_pts=0', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', mp4];
      const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
      p.stderr.on('data', d => { err += d; });
      p.on('error', e => conn.send({ type: 'recdone', raw, mp4: null, note: 'Could not start FFmpeg: ' + e.message }));
      p.on('close', code => {
        let ok = false; try { ok = code === 0 && fs.statSync(mp4).size > 1000; } catch (e) {}
        console.log(new Date().toLocaleTimeString(), 'Recording ready:', ok ? mp4 : raw, ok ? '' : '(conversion failed: ' + err.slice(-200) + ')');
        conn.send({ type: 'recdone', raw, mp4: ok ? mp4 : null, note: ok ? '' : 'Conversion failed, the raw recording was kept.' });
        setTimeout(() => { try { conn.socket.end(); } catch (e) {} }, 500);
      });
    });
  }
}

// ---------- one streaming session per browser connection ----------
const SERVER_RE = /^rtmps?:\/\/[A-Za-z0-9.\-:]+(\/[A-Za-z0-9._\-\/]*)?$/;
const KEY_RE = /^[A-Za-z0-9._\-?=&%~+]{3,300}$/;

function session(conn) {
  let proc = null, tail = [], stopReason = '', stats = {}, startedAt = 0, bytes = 0;
  conn.send({ type: 'hello', ffmpeg: FFMPEG_VERSION });

  conn.onText = txt => {
    let m; try { m = JSON.parse(txt); } catch (e) { return; }
    if (m.cmd === 'start') start(m);
    else if (m.cmd === 'stop') stop('Stopped from the control room.');
  };
  conn.onBinary = buf => { if (proc && proc.stdin.writable) { bytes += buf.length; proc.stdin.write(buf); } };
  conn.onClose = () => stop('Control room disconnected.');

  function start(m) {
    if (proc) return conn.send({ type: 'error', message: 'Already streaming.' });
    if (!FFMPEG_OK) return conn.send({ type: 'error', message: 'FFmpeg was not found on this computer. See SETUP.md (step 2).' });
    const server = String(m.server || '');
    const key = String(m.key || '');
    if (!SERVER_RE.test(server)) return conn.send({ type: 'error', message: 'Server address must start with rtmps:// or rtmp://' });
    if (!KEY_RE.test(key)) return conn.send({ type: 'error', message: 'The stream key looks wrong. Paste it again from Facebook.' });
    const kbps = Math.max(500, Math.min(8000, Number(m.bitrate) || 2500));
    const fps = Math.max(10, Math.min(60, Number(m.fps) || 30));
    const out = server.replace(/\/?$/, '/') + key;
    const args = [
      '-hide_banner', '-loglevel', 'warning', '-nostats',
      '-fflags', '+genpts', '-analyzeduration', '1000000', '-probesize', '1000000', '-f', 'webm', '-i', 'pipe:0',
      '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-r', String(fps), '-g', String(fps * 2), '-keyint_min', String(fps * 2), '-sc_threshold', '0',
      '-b:v', kbps + 'k', '-maxrate', kbps + 'k', '-bufsize', (kbps * 2) + 'k',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-progress', 'pipe:1', '-f', 'flv', out
    ];
    tail = []; stopReason = ''; stats = {}; bytes = 0; startedAt = Date.now();
    proc = spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const mine = proc;
    console.log(new Date().toLocaleTimeString(), 'Streaming started ->', server.replace(/^(rtmps?:\/\/[^/]+).*/, '$1'));
    proc.stdin.on('error', () => {});
    proc.on('error', e => { conn.send({ type: 'error', message: 'Could not start FFmpeg: ' + e.message }); if (proc === mine) proc = null; });
    proc.stdout.on('data', d => {
      d.toString().split(/\r?\n/).forEach(line => {
        const i = line.indexOf('='); if (i < 1) return;
        const k = line.slice(0, i), v = line.slice(i + 1).trim(); stats[k] = v;
        if (k === 'progress') conn.send({ type: 'stats', bitrate: stats.bitrate, fps: stats.fps, speed: stats.speed, frames: stats.frame, seconds: Math.round((Date.now() - startedAt) / 1000), mb: +(bytes / 1048576).toFixed(1) });
      });
    });
    proc.stderr.on('data', d => {
      d.toString().split(/\r?\n/).filter(Boolean).forEach(line => { tail.push(line); if (tail.length > 12) tail.shift(); conn.send({ type: 'log', line }); });
    });
    proc.on('close', code => {
      if (proc === mine) proc = null;
      console.log(new Date().toLocaleTimeString(), 'Streaming ended (code ' + code + ')');
      conn.send({ type: 'ended', code, reason: stopReason || (code === 0 ? 'Finished.' : 'Facebook or FFmpeg closed the stream.'), tail: tail.slice(-4) });
    });
    conn.send({ type: 'ready' });
  }

  function stop(reason) {
    if (!proc) return;
    stopReason = reason; const p = proc;
    try { p.stdin.end(); } catch (e) {}
    setTimeout(() => { try { p.kill('SIGTERM'); } catch (e) {} }, 1200);
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} }, 5000);
  }
}

server.listen(PORT, HOST, () => {
  console.log('==============================================');
  console.log(' LCRM Facebook relay is running');
  console.log(' Control room (this laptop): http://localhost:' + PORT + '/control.html');
  console.log(' Relay address for the app : ws://localhost:' + PORT);
  console.log(' FFmpeg                    : ' + (FFMPEG_VERSION || 'NOT FOUND - install it (see SETUP.md)'));
  if (ALLOW_ORIGINS.length) console.log(' Allowed web pages         : ' + ALLOW_ORIGINS.join(', '));
  console.log(' Keep this window open while streaming.');
  console.log('==============================================');
});

if (LAN) {
  const https = require('https');
  function tlsFiles() {
    const mine = path.join(__dirname, 'lan-cert'), def = path.join(__dirname, 'lan-default');
    const ok = d => fs.existsSync(path.join(d, 'cert.pem')) && fs.existsSync(path.join(d, 'key.pem'));
    if (!ok(mine)) {   // make our own certificate if openssl exists on this computer
      try { fs.mkdirSync(mine, { recursive: true }); const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(mine, 'key.pem'), '-out', path.join(mine, 'cert.pem'), '-days', '3650', '-subj', '/CN=LCRM Church LAN', '-addext', 'subjectAltName=DNS:localhost,DNS:lcrm.local'], { encoding: 'utf8' }); if (r.status !== 0) fs.rmSync(mine, { recursive: true, force: true }); } catch (e) {}
    }
    const d = ok(mine) ? mine : def;
    return { key: fs.readFileSync(path.join(d, 'key.pem')), cert: fs.readFileSync(path.join(d, 'cert.pem')), own: d === mine };
  }
  try {
    const t = tlsFiles(), lanServer = https.createServer({ key: t.key, cert: t.cert }, handler);
    lanServer.on('upgrade', (req, socket) => onUpgrade(req, socket, true));
    lanServer.listen(LAN_PORT, '0.0.0.0', () => {
      console.log('==============================================');
      console.log(' CHURCH-NETWORK MODE (no internet needed for cameras)');
      console.log(' On each phone / TV open one of these (tap Advanced > Proceed, once):');
      lanUrls().forEach(ip => { console.log('   Camera : https://' + ip + ':' + LAN_PORT + '/cam.html'); console.log('   TV     : https://' + ip + ':' + LAN_PORT + '/tv.html'); });
      console.log(' On this laptop open: http://localhost:' + PORT + '/control.html?lan=1');
      console.log(' (certificate: ' + (t.own ? 'made on this computer' : 'built-in, fine for a private church network') + ')');
      console.log(' If Windows asks, Allow access on PRIVATE networks.');
      console.log('==============================================');
    });
    lanServer.on('error', e => console.log('Church-network mode could not start: ' + e.message));
  } catch (e) { console.log('Church-network mode could not start: ' + e.message); }
}
