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

  $('room').value = cleanRoom(qs.get('room')) || store.get('lcrm_cam_room', '');
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
    db.onValue(`rooms/${room}/tally/${camId}`, v => { $('stage').className = 'stage ' + (v === 'program' ? 'program' : v === 'preview' ? 'preview' : ''); $('tally').textContent = v === 'program' ? 'ON AIR' : 'NEXT'; });
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
    dc.onmessage = e => { try { const m = JSON.parse(e.data); if (m.t === 'shoot') shoot(true); } catch (err) {} };
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
    try { if (window.ImageCapture) { const b = await new ImageCapture(track).takePhoto(); if (b && b.size) return b; } } catch (e) {}
    const v = $('preview'), cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight; cv.getContext('2d').drawImage(v, 0, 0);
    return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.92));
  }
  async function smaller(blob, maxW) {
    try { const bm = await createImageBitmap(blob), s = Math.min(1, maxW / bm.width), cv = document.createElement('canvas'); cv.width = Math.round(bm.width * s); cv.height = Math.round(bm.height * s);
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height); return await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.9)); } catch (e) { return blob; }
  }
  async function sendToLaptop(blob, name) {
    if (!dc || dc.readyState !== 'open') return false;
    const buf = await blob.arrayBuffer(); dc.send(JSON.stringify({ t: 'shot', name, size: buf.byteLength }));
    for (let o = 0; o < buf.byteLength; o += 16000) { while (dc.bufferedAmount > 1e6) await new Promise(r => setTimeout(r, 40)); dc.send(buf.slice(o, o + 16000)); }
    dc.send(JSON.stringify({ t: 'end' })); return true;
  }
  async function saveHere(blob, name, remote) {
    const file = new File([blob], name, { type: 'image/jpeg' });
    try { if (!remote && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }
  async function shoot(remote) {
    try {
      $('preview').classList.add('flash'); setTimeout(() => $('preview').classList.remove('flash'), 300); shotMsg('Taking photo…');
      const full = await snap(), d = new Date(), pad = n => String(n).padStart(2, '0');
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
