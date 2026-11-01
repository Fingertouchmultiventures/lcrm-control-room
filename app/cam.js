// cam.js - turns a phone into a WebRTC camera for the control room.
(function () {
  const $ = id => document.getElementById(id);
  const cfg = window.LCRM_CONFIG;
  const qs = new URLSearchParams(location.search);
  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const cleanRoom = s => {
    s = String(s || '').trim();
    const m = s.match(/[?&]room=([A-Za-z0-9]+)/);   // someone pasted the whole link: take the code from it
    return (m ? m[1] : s).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  };
  const withTimeout = (pr, ms, msg) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

  let dc, db, stream, pc, room, camId, camName, facing, curSid, unsubs = [], pending = [], watchdog, retryTimer, wake, stopped = false;

  $('room').value = cleanRoom(qs.get('room')) || cfg.defaultRoom || store.get('lcrm_cam_room', '');
  $('name').value = qs.get('name') || store.get('lcrm_cam_name', '');
  $('facing').value = qs.get('facing') || store.get('lcrm_cam_facing', 'environment');
  $('res').value = qs.get('res') || store.get('lcrm_cam_res', '720');
  camId = store.get('lcrm_cam_id', '') || ('c' + Math.random().toString(36).slice(2, 8));
  store.set('lcrm_cam_id', camId);
  if (qs.get('cam')) camId = cleanRoom(qs.get('cam'));   // explicit id (used for testing)

  function showErr(msg) { const e = $('err'); e.textContent = msg; e.style.display = msg ? 'block' : 'none'; }
  function setStatus(text, kind) { $('status').textContent = text; $('dot').className = 'dot ' + (kind || ''); }
  const dims = { 480: [854, 480], 720: [1280, 720], 1080: [1920, 1080] };
  const bitrates = { 480: 900000, 720: 2200000, 1080: 4500000 };

  async function getStream() {
    const [w, h] = dims[$('res').value] || dims[720];
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30, max: 30 } },
      audio: $('mic').checked ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false
    });
  }

  function checkOrientation() {
    const t = stream && stream.getVideoTracks()[0];
    const s = t && t.getSettings ? t.getSettings() : {};
    $('orient').style.display = (s.width && s.height && s.height > s.width) ? 'block' : 'none';
  }

  async function start() {
    showErr('');
    room = cleanRoom($('room').value);
    if (!room) return showErr('Type the room code shown in the control room.');
    camName = $('name').value.trim() || 'Camera';
    facing = $('facing').value;
    store.set('lcrm_cam_room', room); store.set('lcrm_cam_name', camName);
    store.set('lcrm_cam_facing', facing); store.set('lcrm_cam_res', $('res').value);
    stopped = false;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This page must be opened with https:// to use the camera.');
      stream = await getStream();
    } catch (e) { return showErr('Could not open the camera: ' + e.message); }
    $('preview').srcObject = stream;
    $('setup').classList.add('hide'); $('live').classList.remove('hide');
    $('camlabel').textContent = camName;
    checkOrientation();
    setStatus('Connecting…', 'warn');
    try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {}
    Signal.onError = m => setStatus('The database refused the link (' + m.replace(/^.*?:\s*/, '') + ') on ' + Signal.dbHost() + '. Ask the admin to set the Firebase rules - see SETUP.', 'bad');
    try { db = await Signal.connect(); } catch (e) { setStatus('No internet: ' + e.message, 'bad'); return; }
    let lastTally = null;
    db.onValue(`rooms/${room}/tally/${camId}`, v => {
      $('stage').className = 'stage ' + (v === 'program' ? 'program' : v === 'preview' ? 'preview' : ''); $('tally').textContent = v === 'program' ? 'ON AIR' : 'NEXT';
      const now = v === 'program' ? 'air' : v === 'preview' ? 'next' : 'off';
      if (lastTally !== null && now !== lastTally) {   // tell the person holding the phone what just happened
        if (now === 'air') cue('air', '● YOU ARE ON AIR', 3500, [300]); else if (now === 'next') cue('next', 'GET READY - YOU ARE NEXT', 3000, [80, 60, 80]); else if (lastTally === 'air') cue('off', 'Off air', 1500, [60]);
      }
      lastTally = now;
    });
    let pingN = null;
    db.onValue(`rooms/${room}/ping/${camId}`, m => {
      if (pingN === null) { pingN = m ? m.n : 0; return; }   // ignore an old message that was waiting
      if (!m || m.n === pingN) return; pingN = m.n; showPing(m);
    });
    publish().catch(() => { retryTimer = setTimeout(() => publish().catch(() => {}), 8000); });
  }

  async function publish() {
    if (stopped) return;
    clearTimeout(watchdog); clearTimeout(retryTimer);
    unsubs.forEach(f => { try { f(); } catch (e) {} }); unsubs = []; pending = [];
    if (pc) { try { pc.onconnectionstatechange = null; pc.close(); } catch (e) {} }
    const sid = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
    curSid = sid;
    await db.remove(`rooms/${room}/ans/${camId}`);
    await db.remove(`rooms/${room}/cand/${camId}`);
    const conn = pc = new RTCPeerConnection({ iceServers: cfg.iceServers });
    stream.getTracks().forEach(t => conn.addTrack(t, stream));
    dc = conn.createDataChannel('ctl'); dc.binaryType = 'arraybuffer';      // lets the control room ask for photos and receive them
    dc.onmessage = e => { try { const m = JSON.parse(e.data); if (m.t === 'shoot') shoot(true, m.fr); } catch (err) {} };
    conn.onicecandidate = e => { if (e.candidate && curSid === sid) db.push(`rooms/${room}/cand/${camId}/${sid}/phone`, e.candidate.toJSON()); };
    conn.onconnectionstatechange = () => {
      if (pc !== conn) return;
      const s = conn.connectionState;
      if (s === 'connected') { setStatus('Connected to control room', 'ok'); clearTimeout(retryTimer); tuneBitrate(); }
      else if (s === 'connecting') setStatus('Connecting…', 'warn');
      else if (s === 'disconnected') { setStatus('Connection lost… retrying', 'warn'); clearTimeout(retryTimer); retryTimer = setTimeout(() => publish().catch(() => {}), 4000); }
      else if (s === 'failed') { setStatus('Reconnecting…', 'bad'); clearTimeout(retryTimer); retryTimer = setTimeout(() => publish().catch(() => {}), 1000); }
    };
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    unsubs.push(db.onValue(`rooms/${room}/ans/${camId}/${sid}`, async ans => {
      if (!ans || pc !== conn || conn.signalingState !== 'have-local-offer') return;
      try { await conn.setRemoteDescription(ans); pending.splice(0).forEach(c => conn.addIceCandidate(c).catch(() => {})); } catch (e) { console.warn(e); }
    }));
    unsubs.push(db.onChildAdded(`rooms/${room}/cand/${camId}/${sid}/ctrl`, (k, c) => {
      if (pc !== conn) return;
      if (conn.remoteDescription) conn.addIceCandidate(c).catch(() => {}); else pending.push(c);
    }));
    try { await withTimeout(db.set(`rooms/${room}/cams/${camId}`, { name: camName, sid, facing, offer: { type: offer.type, sdp: offer.sdp }, t: Date.now() }), 12000, 'no reply from the database'); }
    catch (e) { setStatus('Cannot reach the database (' + e.message + '). Check the internet and the Firebase rules - retrying…', 'bad'); throw e; }
    db.onDisconnectRemove(`rooms/${room}/cams/${camId}`);
    setStatus('Waiting for control room…', 'warn');
    watchdog = setTimeout(() => { if (pc === conn && conn.connectionState !== 'connected') publish().catch(() => {}); }, 15000);
  }

  function tuneBitrate() {
    const bps = bitrates[$('res').value] || 2200000;
    pc.getSenders().filter(s => s.track && s.track.kind === 'video').forEach(s => {
      try { const p = s.getParameters(); if (!p.encodings || !p.encodings.length) p.encodings = [{}]; p.encodings[0].maxBitrate = bps; s.setParameters(p).catch(() => {}); } catch (e) {}
    });
  }

  /* ---- keep feeding the control room: bring the camera back if the phone/browser switched it off ---- */
  let mutedSince = 0, reviving = false;
  async function revive() {
    if (reviving || stopped || !stream) return; reviving = true;
    try {
      const old = stream, next = await getStream(), vt = next.getVideoTracks()[0];
      const vs = pc && pc.getSenders().find(s => s.track && s.track.kind === 'video'); if (vs) await vs.replaceTrack(vt);
      old.getTracks().forEach(t => { try { t.stop(); } catch (e) {} }); stream = next; $('preview').srcObject = next; checkOrientation(); mutedSince = 0; setStatus('Camera restarted - feeding the control room', 'ok');
    } catch (e) { setStatus('Camera is off (' + e.message + '). Bring this page to the front.', 'bad'); }
    reviving = false;
  }
  setInterval(() => {
    if (stopped || !stream) return; const vt = stream.getVideoTracks()[0];
    if (!vt || vt.readyState === 'ended') return revive();
    if (vt.muted) { mutedSince = mutedSince || Date.now(); if (Date.now() - mutedSince > 3000 && document.visibilityState === 'visible') revive(); } else mutedSince = 0;
  }, 2000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !stopped && stream) setTimeout(() => { const vt = stream.getVideoTracks()[0]; if (!vt || vt.readyState === 'ended' || vt.muted) revive(); }, 600); });
  // small floating window keeps the camera running when you leave this page (Chrome on Android, desktop Chrome/Edge)
  const pipOk = !!(document.pictureInPictureEnabled && $('preview').requestPictureInPicture);
  $('pip').hidden = !pipOk;
  async function goPip() { try { await $('preview').play(); await $('preview').requestPictureInPicture(); shotMsg('Camera is in a small window. You can leave this page.'); } catch (e) { shotMsg('Could not make the small window: ' + e.message); } }
  $('pip').onclick = goPip;
  try { navigator.mediaSession.setActionHandler('enterpictureinpicture', goPip); $('preview').autoPictureInPicture = true; } catch (e) {}

  async function flip() {
    facing = facing === 'user' ? 'environment' : 'user';
    $('facing').value = facing; store.set('lcrm_cam_facing', facing);
    try {
      const old = stream; const next = await getStream();
      const vt = next.getVideoTracks()[0];
      const sender = pc && pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(vt);
      old.getVideoTracks().forEach(t => t.stop());
      old.removeTrack(old.getVideoTracks()[0]); old.addTrack(vt);
      $('preview').srcObject = old; checkOrientation(); next.getAudioTracks().forEach(t => t.stop());
    } catch (e) { setStatus('Could not flip: ' + e.message, 'bad'); }
  }

  async function stop() {
    stopped = true; clearTimeout(watchdog); clearTimeout(retryTimer);
    unsubs.forEach(f => { try { f(); } catch (e) {} });
    try { pc && pc.close(); } catch (e) {}
    try { stream && stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { await db.remove(`rooms/${room}/cams/${camId}`); } catch (e) {}
    try { wake && wake.release(); } catch (e) {}
    $('live').classList.add('hide'); $('setup').classList.remove('hide');
  }

  $('room').addEventListener('input', () => { const c = cleanRoom($('room').value); if (c !== $('room').value) $('room').value = c; });

  /* ---- shutter: full-size photo saved on this phone, and a smaller copy sent to the control room laptop ---- */
  const shotMsg = t => { $('shotmsg').textContent = t; };
  async function snap() {
    const track = stream && stream.getVideoTracks()[0]; if (!track) throw new Error('camera is not on');
    // 1) the phone's real still-photo mode: full sensor resolution, autofocus and proper exposure (not a frame of the video)
    try {
      if (window.ImageCapture) {
        const ic = new ImageCapture(track); let opt = { fillLightMode: 'off' };
        try { const caps = await ic.getPhotoCapabilities(); if (caps.imageWidth && caps.imageHeight) { opt.imageWidth = caps.imageWidth.max; opt.imageHeight = caps.imageHeight.max; } if (caps.redEyeReduction === 'controllable') opt.redEyeReduction = false; } catch (e) {}
        let b; try { b = await ic.takePhoto(opt); } catch (e) { b = await ic.takePhoto(); }
        if (b && b.size) return b;
      }
    } catch (e) {}
    // 2) otherwise the sharpest frame we have: ask for the camera's largest picture just for this instant
    const v = $('preview'); let w = v.videoWidth, h = v.videoHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(v, 0, 0, w, h);
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.97));
  }
  async function smaller(blob, maxW) {
    try { const bm = await createImageBitmap(blob), s = Math.min(1, maxW / bm.width), cv = document.createElement('canvas'); cv.width = Math.round(bm.width * s); cv.height = Math.round(bm.height * s);
      const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(bm, 0, 0, cv.width, cv.height); return await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.95)); } catch (e) { return blob; }
  }
  let curFr = 0;
  async function sendToLaptop(blob, name) {
    if (!dc || dc.readyState !== 'open') return false;
    const buf = await blob.arrayBuffer(); dc.send(JSON.stringify({ t: 'shot', name, size: buf.byteLength, fr: curFr }));
    for (let o = 0; o < buf.byteLength; o += 16000) { while (dc.bufferedAmount > 1e6) await new Promise(r => setTimeout(r, 40)); dc.send(buf.slice(o, o + 16000)); }
    dc.send(JSON.stringify({ t: 'end' })); return true;
  }
  async function saveHere(blob, name, remote) {
    const file = new File([blob], name, { type: 'image/jpeg' });
    try { if (!remote && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }
  function buzz(p) { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) {} }
  let cueT;
  function cue(cls, text, ms, vib) { const c = $('cue'); c.className = 'cue show ' + cls; c.textContent = text; buzz(vib || [60]); clearTimeout(cueT); cueT = setTimeout(() => { c.className = 'cue ' + cls; }, ms); }
  function screenFlash() { const f = $('fullflash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); buzz([40]); }
  let curPing = null;
  function showPing(m) { curPing = m; $('pingFrom').textContent = (m.from || 'Control room') + ' says'; $('pingMsg').textContent = m.text; $('pingBox').classList.add('show'); buzz([200, 100, 200, 100, 200]); }
  function ackPing(r) { if (!curPing) return; $('pingBox').classList.remove('show'); db.set(`rooms/${room}/pingack/${camId}`, { n: curPing.n, r, m: r === 'no' ? 'cannot do it right now' : '' }).catch(() => {}); curPing = null; }
  $('pingOk').onclick = () => ackPing('ok'); $('pingNo').onclick = () => ackPing('no');
  async function shoot(remote, fr) {
    try {
      screenFlash();
      $('preview').classList.add('flash'); setTimeout(() => $('preview').classList.remove('flash'), 300); shotMsg('Taking photo…');
      curFr = fr || 0; const full = await snap(), d = new Date(), pad = n => String(n).padStart(2, '0');
      const name = `LCRM-${(camName || 'camera').replace(/[^A-Za-z0-9]+/g, '')}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
      const sent = await sendToLaptop(await smaller(full, 2560), name);
      await saveHere(full, name, remote);
      shotMsg(`Photo saved on this phone${sent ? ' and sent to the control room' : ''}.`);
    } catch (e) { shotMsg('Could not take the photo: ' + e.message); }
  }
  $('shutter').onclick = () => shoot(false);

  $('start').onclick = start; $('flip').onclick = flip; $('stop').onclick = stop;
  addEventListener('online', () => { if (db && !stopped) publish().catch(() => {}); });
  document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && !stopped && stream) { try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {} } });
  if (qs.get('auto') === '1') start();   // used when the phone opens a saved link
})();
