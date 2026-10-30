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
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_FRAME = 32 * 1024 * 1024;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const ff = spawnSync(FFMPEG, ['-version'], { encoding: 'utf8' });
const FFMPEG_OK = !ff.error && ff.status === 0;
const FFMPEG_VERSION = FFMPEG_OK ? (ff.stdout.split('\n')[0] || 'ffmpeg') : null;

// ---------- static files ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
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
});

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

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin || '';
  let originOk = !origin;
  if (origin) {
    try { const h = new URL(origin).hostname; originOk = h === 'localhost' || h === '127.0.0.1' || ALLOW_ORIGINS.includes(origin) || ALLOW_ORIGINS.includes('*'); } catch (e) {}
  }
  const key = req.headers['sec-websocket-key'];
  if (!key || !originOk || (TOKEN && url.searchParams.get('token') !== TOKEN)) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    if (!originOk) console.log('Blocked connection from origin', origin, '- add it to ALLOW_ORIGINS in start.bat');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  session(new Conn(socket));
});

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
