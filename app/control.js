/* LCRM Control Room - one screen to switch cameras, slides, hymns, scripture and video
   to Facebook Live and the church TV.  No build step, no frameworks. */
(() => {
'use strict';
const cfg = window.LCRM_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const store = {
  get(k, d) { try { const v = localStorage.getItem('lcrm_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lcrm_' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function toast(msg, ms = 4000) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }
const pad = n => String(n).padStart(2, '0');
const fmtTime = s => `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;

/* ---------------------------------------------------------------- settings */
const DEF = { church: cfg.churchName || 'LCRM Church', bg: '#0b1d3a', bg2: '#17386a', text: '#ffffff', accent: '#f5b942', font: 'Segoe UI', size: 1, align: 'center',
  bgImage: '', logo: '', logoOn: false, relayUrl: cfg.relayUrl, fbServer: cfg.facebookServer, bitrate: 2500, publicUrl: cfg.publicUrl || '', token: '', key: '', rememberKey: false, trans: 'fade', textMode: 'full', tvMode: 'smart' };
const settings = Object.assign({}, DEF, store.get('settings', {}));
function saveSettings() { const s = Object.assign({}, settings); if (!s.rememberKey) s.key = ''; store.set('settings', s); }
const loadImg = url => { if (!url) return null; const i = new Image(); i.src = url; return i; };
let bgImg = loadImg(settings.bgImage), logoImg = loadImg(settings.logo);
const fontStack = () => `"${settings.font}", "Segoe UI", Arial, sans-serif`;

/* ---------------------------------------------------------------- room */
const urlQ = new URLSearchParams(location.search);
const newRoomCode = () => Array.from({ length: 6 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
let room = (urlQ.get('room') || '').toLowerCase().replace(/[^a-z0-9]/g, '') || store.get('room', '') || newRoomCode();
store.set('room', room);

/* ---------------------------------------------------------------- scenes */
const W = 1280, H = 720, TW = 1920, TH = 1080;
const BLACK = { type: 'black' }, WELCOME = { type: 'bg' };
const mkScene = () => ({ base: BLACK, prev: null, fade: 1, text: null });
const P = mkScene(), V = mkScene();
let safeMode = false, lastLive = null;
const LT = { title: '', sub: '', on: false, alpha: 0 };
const target = () => (safeMode ? V : P);

function setBase(sc, src) {
  if (sc.base === src) return;
  if (sc === P && sc.base.type === 'vid') { try { sc.base.el.pause(); } catch (e) {} }
  sc.prev = sc.base; sc.base = src; sc.fade = settings.trans === 'cut' ? 1 : 0;
  if (src.type === 'live' && sc === P) lastLive = src;
  afterChange();
}
function putBase(src) { const t = target(); if (t.text && t.text.mode === 'full') t.text = null; setBase(t, src); afterChange(); }
function putText(item, text, ref) { target().text = { text, ref: ref || '', mode: settings.textMode, item }; afterChange(); }
function clearText() { target().text = null; afterChange(); }
function take() {
  if (!safeMode) return;
  setBase(P, V.base); P.text = V.text ? Object.assign({}, V.text) : null;
  if (P.base.type === 'vid') P.base.el.play().catch(() => {});
  afterChange();
}
function updateScene(sc, dt) { if (sc.fade < 1) { sc.fade = Math.min(1, sc.fade + dt / 0.35); if (sc.fade >= 1) sc.prev = null; } }

function afterChange() { refreshMarks(); syncTally(); }
function isOn(sc, item) { return item.src ? sc.base === item.src : !!(sc.text && sc.text.item === item); }
function refreshMarks() {
  $$('.item').forEach(n => { const it = n._item; if (!it) return; n.classList.toggle('prog', isOn(P, it)); n.classList.toggle('prev', safeMode && isOn(V, it)); });
}

/* ---------------------------------------------------------------- drawing */
const progCanvas = $('#prog'), pvCanvas = $('#pv');
const pctx = progCanvas.getContext('2d'), vctx = pvCanvas.getContext('2d');
const tvCanvas = document.createElement('canvas'); tvCanvas.width = TW; tvCanvas.height = TH;
const tctx = tvCanvas.getContext('2d');
const blurC = document.createElement('canvas'); blurC.width = 48; blurC.height = 27; const bctx = blurC.getContext('2d');

const dimsOf = el => el instanceof HTMLVideoElement ? [el.videoWidth, el.videoHeight] : el instanceof HTMLImageElement ? [el.naturalWidth, el.naturalHeight] : [el.width, el.height];
function drawCover(ctx, el, w, h) {
  const [vw, vh] = dimsOf(el); if (!vw || !vh) return;
  const s = Math.max(w / vw, h / vh), dw = vw * s, dh = vh * s; ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
function drawContain(ctx, el, w, h) {
  const [vw, vh] = dimsOf(el); if (!vw || !vh) return;
  const s = Math.min(w / vw, h / vh), dw = vw * s, dh = vh * s; ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
function drawFitAuto(ctx, el, w, h) {
  const [vw, vh] = dimsOf(el); if (!vw || !vh) return;
  const ar = vw / vh, tar = w / h;
  if (ar > tar * 0.88 && ar < tar * 1.14) return drawCover(ctx, el, w, h);
  // odd shape (e.g. phone held upright): blurred copy behind, whole picture in front
  bctx.drawImage(el, 0, 0, 48, 27); ctx.imageSmoothingEnabled = true; ctx.drawImage(blurC, 0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, w, h); drawContain(ctx, el, w, h);
}
function drawBackground(ctx, w, h, withName) {
  if (bgImg && bgImg.complete && bgImg.naturalWidth) drawCover(ctx, bgImg, w, h);
  else { const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, settings.bg); g.addColorStop(1, settings.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  if (withName && !(bgImg && bgImg.complete && bgImg.naturalWidth)) {
    ctx.fillStyle = settings.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${h * 0.11}px ${fontStack()}`; ctx.fillText(settings.church, w / 2, h * 0.5);
  }
}
function elOf(src) {
  if (src.type === 'live') { const s = sources.get(src.id); const v = s && s.video; return v && v.readyState >= 2 && v.videoWidth ? v : null; }
  if (src.type === 'img') return src.img;
  if (src.type === 'vid') { const v = src.el; return v.readyState >= 2 && v.videoWidth ? v : null; }
  return null;
}
function drawBase(ctx, w, h, src, alpha) {
  ctx.globalAlpha = alpha;
  if (src.type === 'bg') drawBackground(ctx, w, h, true);
  else {
    const el = src.type === 'black' ? null : elOf(src);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    if (el) { if (src.type === 'live' && src.fit !== 'contain') drawFitAuto(ctx, el, w, h); else drawContain(ctx, el, w, h); }
  }
  ctx.globalAlpha = 1;
}

const layoutCache = new Map();
function wrap(ctx, text, maxW) {
  const out = [];
  text.split('\n').forEach(para => {
    let line = '';
    para.split(/\s+/).filter(Boolean).forEach(wd => { const t = line ? line + ' ' + wd : wd; if (line && ctx.measureText(t).width > maxW) { out.push(line); line = wd; } else line = t; });
    out.push(line);
  });
  return out;
}
function fit(ctx, text, bw, bh, maxPx, minPx) {
  const key = [text, Math.round(bw), Math.round(bh), Math.round(maxPx), settings.font].join('|');
  let r = layoutCache.get(key); if (r) return r;
  let lo = Math.round(minPx), hi = Math.round(maxPx), best = lo, bestLines = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1; ctx.font = `700 ${mid}px ${fontStack()}`;
    const lines = wrap(ctx, text, bw);
    if (lines.length * mid * 1.22 <= bh) { best = mid; bestLines = lines; lo = mid + 1; } else hi = mid - 1;
  }
  if (!bestLines) { ctx.font = `700 ${best}px ${fontStack()}`; bestLines = wrap(ctx, text, bw); }
  r = { size: best, lines: bestLines }; layoutCache.set(key, r);
  if (layoutCache.size > 80) layoutCache.delete(layoutCache.keys().next().value);
  return r;
}
function drawTextLayer(ctx, w, h, t, forceFull) {
  const mode = forceFull ? 'full' : t.mode, hasRef = !!t.ref, left = settings.align === 'left';
  ctx.textBaseline = 'middle'; ctx.textAlign = left ? 'left' : 'center';
  const x = left ? w * 0.07 : w / 2;
  if (mode === 'full') {
    drawBackground(ctx, w, h, false);
    const L = fit(ctx, t.text, w * 0.86, h * (hasRef ? 0.70 : 0.80), h * 0.13 * settings.size, h * 0.03);
    const lh = L.size * 1.22, top = (h * (hasRef ? 0.46 : 0.5)) - (L.lines.length * lh) / 2 + lh / 2;
    ctx.font = `700 ${L.size}px ${fontStack()}`; ctx.fillStyle = settings.text; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = L.size * 0.14; ctx.shadowOffsetY = L.size * 0.04;
    L.lines.forEach((ln, i) => ctx.fillText(ln, x, top + i * lh));
    ctx.shadowColor = 'transparent';
    if (hasRef) { ctx.font = `600 ${h * 0.046}px ${fontStack()}`; ctx.fillStyle = settings.accent; ctx.fillText(t.ref, x, h * 0.925); }
  } else {
    const y0 = h * 0.62, g = ctx.createLinearGradient(0, y0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.28, 'rgba(0,0,0,.72)'); g.addColorStop(1, 'rgba(0,0,0,.88)');
    ctx.fillStyle = g; ctx.fillRect(0, y0, w, h - y0);
    const bh = h * (hasRef ? 0.23 : 0.27), cy = h * (hasRef ? 0.795 : 0.83);
    const L = fit(ctx, t.text, w * 0.88, bh, h * 0.07 * settings.size, h * 0.028);
    const lh = L.size * 1.22, top = cy - (L.lines.length * lh) / 2 + lh / 2;
    ctx.font = `700 ${L.size}px ${fontStack()}`; ctx.fillStyle = settings.text; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = L.size * 0.12;
    L.lines.forEach((ln, i) => ctx.fillText(ln, x, top + i * lh)); ctx.shadowColor = 'transparent';
    if (hasRef) { ctx.font = `600 ${h * 0.036}px ${fontStack()}`; ctx.fillStyle = settings.accent; ctx.textAlign = 'right'; ctx.fillText(t.ref, w * 0.95, h * 0.955); }
  }
  ctx.textAlign = 'left';
}
function drawLowerThird(ctx, w, h, lift) {
  if (LT.alpha < 0.02) return;
  const a = LT.alpha, x = w * 0.05 - (1 - a) * w * 0.06, y = h * 0.74 - (lift ? h * 0.2 : 0);
  ctx.globalAlpha = a; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const t1 = h * 0.05, t2 = h * 0.034;
  ctx.font = `700 ${t1}px ${fontStack()}`; const w1 = ctx.measureText(LT.title).width;
  ctx.font = `500 ${t2}px ${fontStack()}`; const w2 = LT.sub ? ctx.measureText(LT.sub).width : 0;
  const bw = Math.max(w1, w2) + h * 0.07, bh = LT.sub ? h * 0.125 : h * 0.085;
  ctx.fillStyle = 'rgba(8,12,22,.82)'; ctx.fillRect(x, y, bw, bh);
  ctx.fillStyle = settings.accent; ctx.fillRect(x, y, h * 0.01, bh);
  ctx.fillStyle = '#fff'; ctx.font = `700 ${t1}px ${fontStack()}`; ctx.fillText(LT.title, x + h * 0.035, y + (LT.sub ? bh * 0.46 : bh * 0.66));
  if (LT.sub) { ctx.fillStyle = 'rgba(255,255,255,.82)'; ctx.font = `500 ${t2}px ${fontStack()}`; ctx.fillText(LT.sub, x + h * 0.035, y + bh * 0.82); }
  ctx.globalAlpha = 1;
}
function drawLogo(ctx, w, h) {
  if (!settings.logoOn || !logoImg || !logoImg.complete || !logoImg.naturalWidth) return;
  const lw = w * 0.1, lh = lw * logoImg.naturalHeight / logoImg.naturalWidth;
  ctx.globalAlpha = 0.92; ctx.drawImage(logoImg, w - lw - w * 0.025, h * 0.035, lw, lh); ctx.globalAlpha = 1;
}
function renderScene(ctx, w, h, sc, overlays) {
  if (sc.fade < 1 && sc.prev) { drawBase(ctx, w, h, sc.prev, 1); drawBase(ctx, w, h, sc.base, sc.fade); } else drawBase(ctx, w, h, sc.base, 1);
  if (sc.text) drawTextLayer(ctx, w, h, sc.text, false);
  if (overlays) { drawLowerThird(ctx, w, h, !!(sc.text && sc.text.mode === 'lower')); drawLogo(ctx, w, h); }
}
function renderTV() {
  const m = settings.tvMode;
  if (m === 'mirror') renderScene(tctx, TW, TH, P, true);
  else if (m === 'smart') { if (P.text) drawTextLayer(tctx, TW, TH, P.text, true); else renderScene(tctx, TW, TH, P, false); }
  else if (m === 'welcome') drawBase(tctx, TW, TH, WELCOME, 1);
  else { tctx.fillStyle = '#000'; tctx.fillRect(0, 0, TW, TH); }
}

/* ---------------------------------------------------------------- main loop (worker timer keeps running when the window is not in front) */
const progStream = progCanvas.captureStream(30);
const tvStream = tvCanvas.captureStream(30);
let tvWin = null, last = performance.now(), level = 0;
const meterBuf = new Uint8Array(1024);
function tick() {
  const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
  updateScene(P, dt); updateScene(V, dt);
  LT.alpha += ((LT.on ? 1 : 0) - LT.alpha) * Math.min(1, dt * 9);
  renderScene(pctx, W, H, P, true);
  if (safeMode) renderScene(vctx, 640, 360, V, false);
  if (tvWin && !tvWin.closed) { if (tvWin.__ready && tvWin.__stream !== tvStream) tvWin.setStream(tvStream); renderTV(); }
  if (analyser) {
    analyser.getByteTimeDomainData(meterBuf); let pk = 0;
    for (let i = 0; i < meterBuf.length; i++) pk = Math.max(pk, Math.abs(meterBuf[i] - 128));
    level = Math.max(pk / 128, level * 0.9); $('#meterBar').style.width = Math.min(100, level * 110) + '%';
  }
  if (streaming) updateLiveClock();
}
const tickWorker = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'], { type: 'text/javascript' })));
tickWorker.onmessage = tick;

/* ---------------------------------------------------------------- audio */
let actx, fbBus, pcBus, dest, analyser, micNode, micGain, micStream, micMuted = false;
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  fbBus = actx.createGain(); pcBus = actx.createGain(); pcBus.gain.value = 0;
  dest = actx.createMediaStreamDestination(); analyser = actx.createAnalyser(); analyser.fftSize = 1024;
  fbBus.connect(dest); fbBus.connect(analyser); pcBus.connect(actx.destination);
}
initAudio();
const resumeAudio = () => { if (actx && actx.state !== 'running') actx.resume().catch(() => {}); };
addEventListener('pointerdown', resumeAudio, true); addEventListener('keydown', resumeAudio, true);

async function listMics(selectId) {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
    const sel = $('#micSel'); sel.innerHTML = devs.map(d => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Microphone')}</option>`).join('') || '<option value="">(none found)</option>';
    if (selectId) sel.value = selectId;
  } catch (e) {}
}
async function micStart() {
  resumeAudio();
  try {
    const id = $('#micSel').value;
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
    if (micNode) micNode.disconnect();
    micNode = actx.createMediaStreamSource(micStream); micGain = micGain || actx.createGain(); micNode.connect(micGain); micGain.connect(fbBus);
    micGain.gain.value = micMuted ? 0 : $('#micVol').value / 100;
    $('#micMute').disabled = false; $('#micOn').textContent = 'Switch input';
    const used = micStream.getAudioTracks()[0].getSettings().deviceId; await listMics(used); store.set('mic', used);
    toast('Sound input is on.');
  } catch (e) { toast('Could not open the microphone: ' + e.message); }
}
$('#micOn').onclick = micStart;
$('#micMute').onclick = () => { micMuted = !micMuted; if (micGain) micGain.gain.value = micMuted ? 0 : $('#micVol').value / 100; $('#micMute').textContent = micMuted ? 'Unmute' : 'Mute'; };
$('#micVol').oninput = () => { if (micGain && !micMuted) micGain.gain.value = $('#micVol').value / 100; };
$('#pcSound').onchange = e => { pcBus.gain.value = e.target.checked ? 1 : 0; };
function routeElement(el) {   // send a media element's sound to Facebook (and optionally this PC)
  if (el.__routed) return; el.__routed = true;
  const src = actx.createMediaElementSource(el); const g = actx.createGain(); src.connect(g); g.connect(fbBus); g.connect(pcBus); el.__gain = g;
}
function routeStream(stream) {
  const tracks = stream.getAudioTracks(); if (!tracks.length) return null;
  const src = actx.createMediaStreamSource(new MediaStream(tracks)); const g = actx.createGain(); g.gain.value = 0; src.connect(g); g.connect(fbBus); g.connect(pcBus); return g;
}

/* ---------------------------------------------------------------- live sources (phones, this computer's camera, shared windows) */
const sources = new Map();
const camOrder = store.get('camOrder', []);   // phones keep the same number week after week
let seq = 0, db = null; const watching = new Set();

function ensureSource(id, name, kind) {
  let s = sources.get(id); if (s) return s;
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.autoplay = true;
  if (kind === 'phone' && !camOrder.includes(id)) { camOrder.push(id); store.set('camOrder', camOrder); }
  s = { id, name, kind, seq: ++seq, video, stream: null, state: 'connecting', src: { type: 'live', id, fit: kind === 'screen' ? 'contain' : 'auto' }, gain: null, audioOn: false, sid: null, pc: null, tally: undefined };
  const tile = document.createElement('div'); tile.className = 'item cam'; tile._item = s; s.el = tile;
  tile.innerHTML = `<div class="thumb"><span class="num"></span><div class="off"></div></div><div class="meta"><span class="dot"></span><b></b><small class="res"></small><button class="aud" title="Use this camera's sound" hidden>Sound</button><button class="rm" hidden>Remove</button></div>`;
  $('.thumb', tile).prepend(video);
  tile.addEventListener('click', e => { if (e.target.closest('button')) return; setActive(listOfCams(), listOfCams().indexOf(s)); putBase(s.src); });
  $('.aud', tile).onclick = () => {
    resumeAudio(); if (!s.gain) s.gain = routeStream(s.stream); if (!s.gain) return toast('This camera is not sending sound. Turn on "Send this phone\'s microphone" on the phone.');
    s.audioOn = !s.audioOn; s.gain.gain.value = s.audioOn ? 1 : 0; $('.aud', tile).classList.toggle('on', s.audioOn); $('.aud', tile).textContent = s.audioOn ? 'Sound on' : 'Sound';
  };
  $('.rm', tile).onclick = () => removeSource(s);
  sources.set(id, s); $('#camGrid').appendChild(tile); updateTile(s); updateCounts();
  return s;
}
function updateTile(s) {
  const t = s.el, live = s.state === 'live';
  $('b', t).textContent = s.name;
  $('.dot', t).className = 'dot ' + (live ? 'ok' : s.state === 'connecting' ? 'warn' : 'bad');
  $('.off', t).textContent = s.state === 'connecting' ? 'Connecting…' : 'Camera offline';
  t.classList.toggle('offline', !live);
  $('.rm', t).hidden = s.kind === 'phone' ? live : false; $('.aud', t).hidden = !(s.stream && s.stream.getAudioTracks().length);
  updateCounts();
}
const orderIdx = s => (s.kind === 'phone' ? camOrder.indexOf(s.id) : 1000 + s.seq);
const ordered = () => [...sources.values()].sort((a, b) => orderIdx(a) - orderIdx(b));
function updateCounts() {
  const n = [...sources.values()].filter(s => s.state === 'live').length; $('#camCount').textContent = n;
  $('#camEmpty').style.display = sources.size ? 'none' : 'block';
  ordered().forEach((s, i) => { $('.num', s.el).textContent = i + 1; s.el.style.order = i; });
}
setInterval(() => { sources.forEach(s => { const r = s.video.videoWidth ? `${s.video.videoWidth}×${s.video.videoHeight}` : ''; const el = $('.res', s.el); if (el.textContent !== r) el.textContent = r; }); }, 1500);
function removeSource(s) {
  if (P.base === s.src) setBase(P, BLACK); if (V.base === s.src) setBase(V, BLACK);
  try { s.pc && s.pc.close(); } catch (e) {} if (s.stream && s.kind !== 'phone') s.stream.getTracks().forEach(t => t.stop());
  s.el.remove(); sources.delete(s.id); updateCounts(); afterChange();
}
const listOfCams = () => ordered().map(s => Object.assign(s, { show: () => putBase(s.src) }));

/* phones over WebRTC */
async function startSignaling() {
  let blocked = false;
  Signal.onError = m => { blocked = true; setNet('Database blocked - set Firebase rules', 'bad'); toast('Phones cannot connect: the Firebase database refused access (' + m.replace(/^.*?:\s*/, '') + '). See SETUP, step 3.', 12000); };
  try { db = await Signal.connect(); }
  catch (e) { setNet('No internet - phones cannot connect', 'bad'); return; }
  try { await db.set(`rooms/${room}/_ping`, Date.now()); } catch (e) { return; }   // proves the database accepts us
  if (!blocked) setNet(db.name === 'local' ? 'Test mode' : 'Online - room ' + room, 'ok');
  db.onChildAdded(`rooms/${room}/cams`, camId => {
    if (watching.has(camId)) return; watching.add(camId);
    db.onValue(`rooms/${room}/cams/${camId}`, v => onCam(camId, v));
  });
}
function setNet(text, kind) { $('#netText').textContent = text; $('#net .dot').className = 'dot ' + (kind || ''); }
function onCam(id, v) {
  const s = sources.get(id);
  if (!v) { if (s && s.kind === 'phone') { s.state = 'offline'; s.sid = null; updateTile(s); } return; }
  const cam = ensureSource(id, v.name || 'Camera', 'phone'); cam.name = v.name || cam.name; updateTile(cam);
  if (cam.sid === v.sid) return; cam.sid = v.sid; connectPhone(cam, v);
}
async function connectPhone(s, v) {
  const sid = v.sid;
  if (s.pc) { try { s.pc.close(); } catch (e) {} } if (s.unsubCand) s.unsubCand();
  s.state = 'connecting'; updateTile(s);
  const pc = s.pc = new RTCPeerConnection({ iceServers: cfg.iceServers });
  pc.ontrack = e => {
    const st = e.streams[0] || new MediaStream([e.track]);
    if (s.stream !== st) { s.stream = st; s.gain = null; s.video.srcObject = st; s.video.play().catch(() => {}); }
    updateTile(s);
  };
  pc.onicecandidate = e => { if (e.candidate && s.sid === sid) db.push(`rooms/${room}/cand/${s.id}/${sid}/ctrl`, e.candidate.toJSON()); };
  pc.onconnectionstatechange = () => {
    if (s.pc !== pc) return; const c = pc.connectionState;
    s.state = c === 'connected' ? 'live' : (c === 'failed' || c === 'closed') ? 'offline' : 'connecting'; updateTile(s);
  };
  try {
    await pc.setRemoteDescription(v.offer);
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    await db.set(`rooms/${room}/ans/${s.id}/${sid}`, { type: ans.type, sdp: ans.sdp });
    s.unsubCand = db.onChildAdded(`rooms/${room}/cand/${s.id}/${sid}/phone`, (k, c) => { if (s.pc === pc) pc.addIceCandidate(c).catch(() => {}); });
  } catch (e) { console.warn('connectPhone', e); s.state = 'offline'; updateTile(s); }
}
function syncTally() {
  if (!db) return;
  sources.forEach(s => {
    if (s.kind !== 'phone') return;
    const v = P.base === s.src ? 'program' : (safeMode && V.base === s.src) ? 'preview' : null;
    if (s.tally !== v) { s.tally = v; db.set(`rooms/${room}/tally/${s.id}`, v); }
  });
}

$('#addWebcam').onclick = async () => {
  try {
    const st = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    const s = ensureSource('pc-cam-' + Math.random().toString(36).slice(2, 5), 'This computer', 'webcam');
    s.stream = st; s.video.srcObject = st; s.state = 'live'; updateTile(s); st.getVideoTracks()[0].onended = () => { s.state = 'offline'; updateTile(s); };
  } catch (e) { toast('Could not open the camera: ' + e.message); }
};
$('#addScreen').onclick = async () => {
  try {
    const st = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const s = ensureSource('screen-' + Math.random().toString(36).slice(2, 5), 'Shared window', 'screen');
    s.stream = st; s.video.srcObject = st; s.state = 'live'; updateTile(s); st.getVideoTracks()[0].onended = () => removeSource(s);
  } catch (e) { if (e.name !== 'NotAllowedError') toast('Could not share the window: ' + e.message); }
};

/* ---------------------------------------------------------------- shared list navigation (arrow keys step through slides / verses / hymn sections) */
let active = { arr: [], idx: -1 };
function setActive(arr, idx) { active = { arr, idx }; }
function step(d) {
  const n = active.idx + d; if (n < 0 || n >= active.arr.length) return;
  active.idx = n; const it = active.arr[n]; it.show(); if (it.el && it.el.scrollIntoView) it.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/* ---------------------------------------------------------------- slides */
const slides = [];
let pdfLib = null;
function slideNode(sl) {
  const n = document.createElement('div'); n.className = 'item slide'; n._item = sl; sl.el = n;
  n.innerHTML = `<div class="thumb"></div><div class="meta"><span>${esc(sl.name)}</span></div><button class="x" title="Remove">×</button>`;
  $('.thumb', n).appendChild(sl.thumb);
  n.onclick = e => { if (e.target.closest('.x')) { slides.splice(slides.indexOf(sl), 1); if (P.base === sl.src) setBase(P, BLACK); n.remove(); $('#slideEmpty').style.display = slides.length ? 'none' : 'block'; return; } setActive(slides, slides.indexOf(sl)); putBase(sl.src); };
  $('#slideGrid').appendChild(n); $('#slideEmpty').style.display = 'none';
}
function addSlide(name, el) {
  const sl = { name, thumb: el, src: { type: 'img', img: el, fit: 'contain' } }; sl.show = () => putBase(sl.src); slides.push(sl); slideNode(sl);
}
async function loadPdfJs() {
  if (pdfLib) return pdfLib;
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not download the PDF reader (check internet)')); document.head.appendChild(s); });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([`importScripts("${base}pdf.worker.min.js")`], { type: 'text/javascript' }));
  return (pdfLib = window.pdfjsLib);
}
async function addPdf(file) {
  const lib = await loadPdfJs(); const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i); const vp0 = page.getViewport({ scale: 1 }); const vp = page.getViewport({ scale: 1600 / vp0.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; addSlide(`${file.name.replace(/\.pdf$/i, '')} · ${i}`, c);
  }
}
$('#slideAdd').onclick = () => $('#slideFiles').click();
$('#slideFiles').onchange = async e => {
  const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); e.target.value = '';
  for (const f of files) {
    try {
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { toast('Reading ' + f.name + '…'); await addPdf(f); }
      else if (f.type.startsWith('image/')) { const img = new Image(); img.src = URL.createObjectURL(f); await img.decode(); addSlide(f.name.replace(/\.[^.]+$/, ''), img); }
    } catch (err) { toast('Could not add ' + f.name + ': ' + err.message); }
  }
  if (slides.length) setActive(slides, -1);
};
$('#slideClear').onclick = () => { if (!slides.length || !confirm('Remove all slides?')) return; slides.splice(0).forEach(sl => { if (P.base === sl.src) setBase(P, BLACK); sl.el.remove(); }); $('#slideEmpty').style.display = 'block'; };

/* ---------------------------------------------------------------- hymns & lyrics */
const SAMPLE = [{ id: 'sample', title: 'Sample hymn (edit me)', text: '[Verse 1]\nType the first verse here,\nOne line for each line of the hymn.\n\n[Chorus]\nType the chorus here.\nIt will show as its own slide.\n\n[Verse 2]\nLeave a blank line between slides.' }];
let songs = store.get('songs', null) || SAMPLE, curSong = null;
const saveSongs = () => store.set('songs', songs);
function sectionsOf(text) {
  return text.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
    const lines = b.split('\n'); let label = ''; const m = lines[0].trim().match(/^\[(.+?)\]$/); if (m) { label = m[1]; lines.shift(); }
    return { label, text: lines.join('\n').trim() };
  }).filter(s => s.text);
}
function textCards(container, sections, refOf) {
  container.innerHTML = ''; const arr = [];
  sections.forEach((sec, i) => {
    const it = { label: sec.label, text: sec.text, ref: refOf ? refOf(sec) : '' };
    it.show = () => putText(it, it.text, it.ref);
    const n = document.createElement('div'); n.className = 'item txt'; n._item = it; it.el = n;
    n.innerHTML = `${it.label ? `<div class="lab">${esc(it.label)}</div>` : ''}<div class="body">${esc(it.text)}</div>${it.ref ? `<div class="ref">${esc(it.ref)}</div>` : ''}`;
    n.onclick = () => { setActive(arr, i); it.show(); }; container.appendChild(n); arr.push(it);
  });
  return arr;
}
function renderSongList() {
  const q = $('#songSearch').value.trim().toLowerCase(); const list = $('#songList');
  const rows = songs.filter(s => !q || s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q)).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
  list.innerHTML = rows.length ? '' : '<div class="none">No hymns found. Click “+ New”.</div>';
  rows.forEach(s => { const b = document.createElement('button'); b.textContent = s.title; b.className = curSong === s.id ? 'on' : ''; b.onclick = () => openSong(s.id); list.appendChild(b); });
}
function openSong(id) {
  curSong = id; const s = songs.find(x => x.id === id); if (!s) return;
  $('#songTitle').textContent = s.title; $('#songEdit').hidden = false;
  const arr = textCards($('#songSections'), sectionsOf(s.text)); setActive(arr, -1); renderSongList(); refreshMarks();
}
function editSong(id) {
  const s = id ? songs.find(x => x.id === id) : { id: 'new', title: '', text: '' };
  $('#songDlgTitle').textContent = id ? 'Edit hymn' : 'New hymn'; $('#edTitle').value = s.title; $('#edText').value = s.text; $('#edDelete').style.display = id ? '' : 'none';
  $('#dlgSong').dataset.id = id || ''; $('#dlgSong').showModal();
}
$('#songNew').onclick = () => editSong(null);
$('#songEdit').onclick = () => editSong(curSong);
$('#edCancel').onclick = () => $('#dlgSong').close();
$('#edSave').onclick = () => {
  const id = $('#dlgSong').dataset.id, title = $('#edTitle').value.trim() || 'Untitled', text = $('#edText').value;
  if (id) { const s = songs.find(x => x.id === id); s.title = title; s.text = text; } else { const n = { id: 's' + Date.now().toString(36), title, text }; songs.push(n); curSong = n.id; }
  if (songs.length > 1) songs = songs.filter(s => s.id !== 'sample' || s.text !== SAMPLE[0].text);
  saveSongs(); $('#dlgSong').close(); renderSongList(); openSong(curSong);
};
$('#edDelete').onclick = () => { const id = $('#dlgSong').dataset.id; if (!confirm('Delete this hymn?')) return; songs = songs.filter(s => s.id !== id); saveSongs(); curSong = null; $('#songSections').innerHTML = ''; $('#songTitle').textContent = 'Pick a hymn'; $('#songEdit').hidden = true; $('#dlgSong').close(); renderSongList(); };
$('#songSearch').oninput = renderSongList;
$('#songImport').onclick = () => $('#songFiles').click();
$('#songFiles').onchange = async e => {
  for (const f of e.target.files) songs.push({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), title: f.name.replace(/\.[^.]+$/, ''), text: await f.text() });
  e.target.value = ''; songs = songs.filter(s => s.id !== 'sample'); saveSongs(); renderSongList(); toast('Hymns imported.');
};
$('#songExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(songs, null, 1)], { type: 'application/json' })); a.download = 'lcrm-hymns-backup.json'; a.click(); };
$('#songRestore').onclick = () => $('#songRestoreFile').click();
$('#songRestoreFile').onchange = async e => { try { const arr = JSON.parse(await e.target.files[0].text()); if (Array.isArray(arr)) { songs = arr; saveSongs(); renderSongList(); toast('Hymns restored.'); } } catch (err) { toast('That file is not a hymn backup.'); } e.target.value = ''; };

/* ---------------------------------------------------------------- scripture (free bible-api.com; needs internet) */
const bibleCache = store.get('bibleCache', {});
async function findVerses(e) {
  e.preventDefault();
  const ref = $('#bibleRef').value.trim(), ver = $('#bibleVer').value, group = Number($('#bibleGroup').value) || 1; if (!ref) return;
  const msg = $('#bibleMsg'); msg.textContent = 'Looking up…'; const key = ver + '|' + ref.toLowerCase();
  try {
    let data = bibleCache[key];
    if (!data) {
      const r = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=${ver}`); data = await r.json();
      if (!data.verses) throw new Error(data.error || 'Not found'); bibleCache[key] = data;
      const keys = Object.keys(bibleCache); if (keys.length > 40) delete bibleCache[keys[0]]; store.set('bibleCache', bibleCache);
    }
    const tr = (data.translation_id || ver).toUpperCase(); const vs = data.verses.map(v => ({ b: v.book_name, c: v.chapter, v: v.verse, t: v.text.replace(/\s+/g, ' ').trim() }));
    const chunks = []; for (let i = 0; i < vs.length; i += group) chunks.push(vs.slice(i, i + group));
    const secs = chunks.map(ch => {
      const a = ch[0], z = ch[ch.length - 1]; const range = ch.length === 1 ? `${a.c}:${a.v}` : a.c === z.c ? `${a.c}:${a.v}-${z.v}` : `${a.c}:${a.v}-${z.c}:${z.v}`;
      return { label: '', text: ch.map(x => x.t).join(' '), ref: `${a.b} ${range} (${tr})` };
    });
    msg.textContent = `${data.reference} · ${tr} · ${vs.length} verse${vs.length === 1 ? '' : 's'}`;
    const arr = textCards($('#bibleOut'), secs, s => s.ref); setActive(arr, -1);
  } catch (err) {
    msg.textContent = (navigator.onLine ? 'Could not find that passage (' + err.message + '). Check the spelling, e.g. “1 Corinthians 13:4-7”.' : 'No internet. Type the verse in the Words tab instead.');
  }
}
$('#bibleForm').onsubmit = findVerses;

/* ---------------------------------------------------------------- video files */
const medias = [];
function addMedia(file) {
  const video = document.createElement('video'); video.src = URL.createObjectURL(file); video.preload = 'auto'; video.playsInline = true;
  const m = { name: file.name, video, src: { type: 'vid', el: video, fit: 'contain' } }; m.show = () => playMedia(m); medias.push(m);
  const n = document.createElement('div'); n.className = 'item'; n._item = m; m.el = n;
  n.innerHTML = `<div class="thumb"></div><div class="meta"><b>${esc(file.name)}</b><small></small></div><button class="x" title="Remove">×</button>`;
  const th = document.createElement('video'); th.muted = true; th.preload = 'metadata'; th.src = video.src + '#t=0.3'; $('.thumb', n).appendChild(th);
  video.onloadedmetadata = () => { $('small', n).textContent = fmtTime(Math.round(video.duration)).replace(/^00:/, ''); };
  video.onended = () => { if (P.base === m.src && lastLive) setBase(P, lastLive); };
  n.onclick = e => {
    if (e.target.closest('.x')) { video.pause(); if (P.base === m.src) setBase(P, BLACK); medias.splice(medias.indexOf(m), 1); n.remove(); $('#mediaEmpty').style.display = medias.length ? 'none' : 'block'; return; }
    setActive(medias, medias.indexOf(m)); playMedia(m);
  };
  $('#mediaGrid').appendChild(n); $('#mediaEmpty').style.display = 'none';
}
function playMedia(m) {
  resumeAudio(); routeElement(m.video); if (m.video.__gain) m.video.__gain.gain.value = $('#mediaVol').value / 100;
  m.video.currentTime = 0; putBase(m.src);
  if (!safeMode) m.video.play().catch(() => toast('The browser could not play this video. Try an .mp4 file.'));
}
$('#mediaAdd').onclick = () => $('#mediaFiles').click();
$('#mediaFiles').onchange = e => { [...e.target.files].forEach(addMedia); e.target.value = ''; };
const curVid = () => (P.base.type === 'vid' ? P.base : null);
$('#mediaPlay').onclick = () => { const v = curVid(); if (!v) return; v.el.paused ? v.el.play() : v.el.pause(); };
$('#mediaRestart').onclick = () => { const v = curVid(); if (v) { v.el.currentTime = 0; v.el.play(); } };
$('#mediaStop').onclick = () => { const v = curVid(); if (v) v.el.pause(); setBase(P, lastLive || BLACK); afterChange(); };
$('#mediaVol').oninput = () => { medias.forEach(m => { if (m.video.__gain) m.video.__gain.gain.value = $('#mediaVol').value / 100; }); };

/* ---------------------------------------------------------------- words tab */
$('#wordsText').value = store.get('words', '');
function buildWords() {
  const txt = $('#wordsText').value; store.set('words', txt);
  const arr = textCards($('#wordsOut'), sectionsOf(txt)); setActive(arr, -1);
}
$('#wordsBuild').onclick = buildWords;
$('#wordsClear').onclick = () => { $('#wordsText').value = ''; buildWords(); };

/* ---------------------------------------------------------------- name bar */
$('#btnLt').onclick = () => {
  if (LT.on) { LT.on = false; $('#btnLt').textContent = 'Show bar'; return; }
  LT.title = $('#ltTitle').value.trim(); LT.sub = $('#ltSub').value.trim(); if (!LT.title) return toast('Type a name or title first.');
  LT.on = true; $('#btnLt').textContent = 'Hide bar';
};

/* ---------------------------------------------------------------- top buttons, tabs, shortcuts */
$$('.tabs [data-tab]').forEach(b => b.onclick = () => { $$('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b)); $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + b.dataset.tab)); });
$$('.tabs [data-tm]').forEach(b => b.onclick = () => { settings.textMode = b.dataset.tm; saveSettings(); $$('[data-tm]').forEach(x => x.classList.toggle('on', x === b)); });
$$('[data-tm]').forEach(x => x.classList.toggle('on', x.dataset.tm === settings.textMode));
$('#prevItem').onclick = () => step(-1); $('#nextItem').onclick = () => step(1);
$('#btnBlack').onclick = () => { const t = target(); t.text = null; setBase(t, BLACK); afterChange(); };
$('#btnWelcome').onclick = () => { const t = target(); t.text = null; setBase(t, WELCOME); afterChange(); };
$('#btnClearText').onclick = clearText;
$('#btnTake').onclick = take;
$('#trans').value = settings.trans; $('#trans').onchange = e => { settings.trans = e.target.value; saveSettings(); };
$('#safeMode').onchange = e => {
  e.target.blur(); safeMode = e.target.checked; $('#pvMon').hidden = !safeMode; $('#btnTake').disabled = !safeMode;
  if (safeMode) { V.base = P.base; V.prev = null; V.fade = 1; V.text = P.text ? Object.assign({}, P.text) : null; }
  afterChange();
};
$('#tvMode').value = settings.tvMode; $('#tvMode').onchange = e => { settings.tvMode = e.target.value; saveSettings(); };
addEventListener('keydown', e => {
  const t = e.target, tag = (t.tagName || '').toLowerCase();
  const typing = tag === 'textarea' || tag === 'select' || (tag === 'input' && !['checkbox', 'range', 'button', 'color', 'file'].includes(t.type));
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (t.type === 'range' && k.startsWith('Arrow')) return;          // let sliders use the arrows
  if (k === 'Enter' && tag === 'button') return;                     // Enter on a focused button just presses it
  if (/^[1-9]$/.test(k)) { const s = ordered()[Number(k) - 1]; if (s) { setActive(listOfCams(), Number(k) - 1); putBase(s.src); } }
  else if (k === 'b' || k === 'B') $('#btnBlack').click(); else if (k === 'w' || k === 'W') $('#btnWelcome').click(); else if (k === 'c' || k === 'C') clearText();
  else if (k === 'Enter') take(); else if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); step(1); } else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); step(-1); }
});

/* TV window */
async function openTV() {
  let features = 'popup=yes,width=1280,height=720';
  try {
    if (window.getScreenDetails) {
      const d = await getScreenDetails(); const ext = d.screens.find(s => s !== d.currentScreen && !s.isPrimary) || d.screens.find(s => s !== d.currentScreen);
      if (ext) features = `popup=yes,left=${ext.availLeft},top=${ext.availTop},width=${ext.availWidth},height=${ext.availHeight}`;
    }
  } catch (e) {}
  tvWin = window.open('tv.html', 'lcrm_tv', features);
  if (!tvWin) toast('The browser blocked the TV window. Allow pop-ups for this page, then click again.');
  else toast('TV window opened. Click once inside it to go full screen. (If it is on the wrong screen, drag it onto the TV first.)', 7000);
}
$('#btnTv').onclick = openTV;

/* phones dialog */
function publicBase() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
  if (!local) return location.origin + location.pathname.replace(/[^/]*$/, '');
  const u = (settings.publicUrl || '').trim().replace(/\/+$/, ''); return u ? u + '/' : '';
}
function refreshPhoneLink() {
  $('#roomCode').textContent = room; const base = publicBase(); $('#pubUrl').value = settings.publicUrl; $('#pubUrl').parentElement;
  const link = base ? `${base}cam.html?room=${room}${Signal.isLocal ? '&local=1' : ''}` : '';
  $('#phoneLink').value = link || '(type the online address above first)'; $('#waLink').href = link ? 'https://wa.me/?text=' + encodeURIComponent('LCRM camera link - open on the phone and tap Start camera: ' + link) : '#';
}
$('#btnPhones').onclick = () => { refreshPhoneLink(); $('#dlgPhones').showModal(); };
$('#pubUrl').oninput = e => { settings.publicUrl = e.target.value; saveSettings(); refreshPhoneLink(); };
$('#copyLink').onclick = async () => { try { await navigator.clipboard.writeText($('#phoneLink').value); toast('Link copied.'); } catch (e) { $('#phoneLink').select(); } };
$('#closePhones').onclick = () => $('#dlgPhones').close();
$('#newRoom').onclick = () => { if (!confirm('Make a new room code? Phones will need the new link.')) return; store.set('room', newRoomCode()); location.href = location.pathname + (Signal.isLocal ? '?local=1' : ''); };

/* look & logo dialog */
const fields = { sChurch: 'church', sBg: 'bg', sBg2: 'bg2', sText: 'text', sAccent: 'accent', sFont: 'font', sSize: 'size', sAlign: 'align' };
function readFile(f) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }); }
$('#btnSettings').onclick = () => { Object.entries(fields).forEach(([id, k]) => { $('#' + id).value = settings[k]; }); $('#sLogoOn').checked = settings.logoOn; $('#dlgLook').showModal(); };
Object.entries(fields).forEach(([id, k]) => { $('#' + id).oninput = e => { settings[k] = k === 'size' ? Number(e.target.value) : e.target.value; layoutCache.clear(); saveSettings(); }; });
$('#sLogoOn').onchange = e => { settings.logoOn = e.target.checked; saveSettings(); };
$('#sBgImg').onchange = async e => { if (!e.target.files[0]) return; settings.bgImage = await readFile(e.target.files[0]); bgImg = loadImg(settings.bgImage); if (!store.set('settings', settings)) toast('That picture is large, so it will not be remembered after you close the page.'); saveSettings(); };
$('#sLogoImg').onchange = async e => { if (!e.target.files[0]) return; settings.logo = await readFile(e.target.files[0]); logoImg = loadImg(settings.logo); settings.logoOn = true; $('#sLogoOn').checked = true; saveSettings(); };
$('#clearImgs').onclick = () => { settings.bgImage = ''; settings.logo = ''; bgImg = logoImg = null; settings.logoOn = false; $('#sLogoOn').checked = false; saveSettings(); };
$('#closeLook').onclick = () => $('#dlgLook').close();

/* ---------------------------------------------------------------- Facebook Live via the relay */
let ws = null, rec = null, streaming = false, streamStart = 0, stopping = false;
$('#fbKey').value = settings.rememberKey ? settings.key : ''; $('#rememberKey').checked = settings.rememberKey;
$('#bitrate').value = String(settings.bitrate); $('#relayUrl').value = settings.relayUrl; $('#fbServer').value = settings.fbServer; $('#relayToken').value = settings.token;
$('#fbLink').href = cfg.facebookProducerUrl || 'https://www.facebook.com/live/producer';
$('#rememberKey').onchange = e => { settings.rememberKey = e.target.checked; settings.key = e.target.checked ? $('#fbKey').value : ''; saveSettings(); };
$('#fbKey').oninput = e => { if (settings.rememberKey) { settings.key = e.target.value; saveSettings(); } };
$('#bitrate').onchange = e => { settings.bitrate = Number(e.target.value); saveSettings(); };
$('#relayUrl').onchange = e => { settings.relayUrl = e.target.value.trim(); saveSettings(); };
$('#fbServer').onchange = e => { settings.fbServer = e.target.value.trim(); saveSettings(); };
$('#relayToken').onchange = e => { settings.token = e.target.value; saveSettings(); };

function setStatus(text, kind) { const s = $('#streamStatus'); s.textContent = text; s.className = 'status ' + (kind || ''); }
function setLiveUi(on) {
  streaming = on; const b = $('#btnGoLive'); b.textContent = on ? 'Stop Facebook Live' : 'Start Facebook Live'; b.classList.toggle('stop', on);
  $('#progMon').classList.toggle('air', on); const lb = $('#liveBadge'); lb.className = 'live ' + (on ? 'on' : 'off'); if (!on) lb.textContent = 'OFF AIR';
}
function updateLiveClock() { $('#liveBadge').textContent = '● LIVE ' + fmtTime(Math.round((Date.now() - streamStart) / 1000)); }
function pickMime() { return ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)); }

function startStream() {
  resumeAudio();
  const key = $('#fbKey').value.trim(); if (!key) return setStatus('Paste the stream key from Facebook first (click the link above the box).', 'bad');
  if (!window.MediaRecorder || !pickMime()) return setStatus('This browser cannot stream. Use Chrome or Edge.', 'bad');
  const url = settings.relayUrl + (settings.token ? (settings.relayUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(settings.token) : '');
  setStatus('Connecting to the relay program…', 'warn'); $('#btnGoLive').disabled = true; stopping = false;
  try { ws = new WebSocket(url); } catch (e) { $('#btnGoLive').disabled = false; return setStatus('The relay address is not valid.', 'bad'); }
  const mine = ws; let opened = false;
  ws.onopen = () => { opened = true; mine.send(JSON.stringify({ cmd: 'start', server: settings.fbServer, key, bitrate: settings.bitrate, fps: 30 })); };
  ws.onerror = () => { if (!opened && ws === mine) { $('#btnGoLive').disabled = false; setStatus('Cannot reach the relay at ' + settings.relayUrl + '. Is start.bat running on this laptop?', 'bad'); } };
  ws.onclose = () => { if (ws === mine) { if (streaming && !stopping) endStream('The relay program closed.'); ws = null; $('#btnGoLive').disabled = false; } };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type === 'ready') beginRecording(mine);
    else if (m.type === 'error') { setStatus(m.message, 'bad'); $('#btnGoLive').disabled = false; try { mine.close(); } catch (e) {} }
    else if (m.type === 'stats') {
      const slow = m.speed && parseFloat(m.speed) < 0.9; const behind = mine.bufferedAmount > 4e6;
      setStatus(`Streaming · ${m.bitrate && m.bitrate !== 'N/A' ? m.bitrate.replace('kbits/s', ' kbps') : '…'}` + (slow ? ' · computer is too slow, lower the quality' : '') + (behind ? ' · internet upload too slow' : ''), slow || behind ? 'warn' : 'ok');
    } else if (m.type === 'ended') { const tail = (m.tail || []).join(' ').slice(0, 200); endStream(m.reason + (m.code && !stopping && tail ? ' (' + tail + ')' : '')); }
  };
}
function beginRecording(sock) {
  const stream = new MediaStream([...progStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  rec = new MediaRecorder(stream, { mimeType: pickMime(), videoBitsPerSecond: Math.round(settings.bitrate * 1000 * 1.15), audioBitsPerSecond: 128000 });
  rec.ondataavailable = e => { if (e.data && e.data.size && sock.readyState === 1) sock.send(e.data); };
  rec.onerror = () => endStream('The recorder stopped unexpectedly.');
  rec.start(250); streamStart = Date.now(); setLiveUi(true); $('#btnGoLive').disabled = false;
  setStatus('Sending to Facebook… In Facebook Live Producer, wait for the preview, then click “Go Live”.', 'ok');
}
function stopStream() {
  if (!confirm('Stop the Facebook live broadcast?')) return;
  stopping = true; try { rec && rec.state !== 'inactive' && rec.stop(); } catch (e) {}
  try { ws && ws.readyState === 1 && ws.send(JSON.stringify({ cmd: 'stop' })); } catch (e) {}
  setStatus('Stopping…', 'warn');
  setTimeout(() => { if (streaming) endStream('Stopped.'); }, 2500);
}
function endStream(reason) {
  try { rec && rec.state !== 'inactive' && rec.stop(); } catch (e) {} rec = null;
  try { ws && ws.close(); } catch (e) {} ws = null; setLiveUi(false); $('#btnGoLive').disabled = false;
  setStatus(reason || 'Stopped.', stopping ? '' : 'bad'); stopping = false;
}
$('#btnGoLive').onclick = () => (streaming ? stopStream() : startStream());
addEventListener('beforeunload', e => { if (streaming) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------------------------------------------------------- start */
(async function init() {
  renderSongList(); if (songs[0] && songs.length === 1) openSong(songs[0].id);
  const savedMic = store.get('mic', ''); if (savedMic) { try { await listMics(savedMic); } catch (e) {} }
  startSignaling();
  window.LCRM = { P, V, sources, ordered, putBase, putText, take, setBase, get streaming() { return streaming; }, progStream, tvStream, room, settings };   // handy for debugging
})();
})();
