// tv.js - lets the TV screen run on ANY window or device (a second laptop, a smart-TV browser, an installed app window)
// instead of only as a pop-up of the control room. It asks the control room for the TV picture over WebRTC.
(function () {
  const cfg = window.LCRM_CONFIG, qs = new URLSearchParams(location.search);
  let popup = false; try { popup = !!(window.opener && window.opener.location.origin === location.origin && !qs.get('room')); } catch (e) { popup = false; }
  if (popup) return;                         // opened by the control room: it pushes the picture in (setStream)
  const clean = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const room = clean(qs.get('room')) || cfg.defaultRoom || clean(store.get('lcrm_tv_room', ''));
  const id = store.get('lcrm_tv_id', '') || ('t' + Math.random().toString(36).slice(2, 7)); store.set('lcrm_tv_id', id);
  const hint = document.getElementById('hint'), v = document.getElementById('v');
  const say = t => { hint.textContent = t; document.body.classList.remove('full'); if (document.fullscreenElement) document.body.classList.add('full'); };
  let db, pc, unsubs = [], watchdog, retry, cur;
  async function connect() {
    clearTimeout(watchdog); clearTimeout(retry); unsubs.forEach(f => { try { f(); } catch (e) {} }); unsubs = [];
    if (pc) { try { pc.onconnectionstatechange = null; pc.close(); } catch (e) {} }
    const sid = cur = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3), tid = 'tv-' + id;
    await db.remove(`rooms/${room}/ans/${tid}`); await db.remove(`rooms/${room}/cand/${tid}`);
    const conn = pc = new RTCPeerConnection({ iceServers: cfg.iceServers });
    conn.addTransceiver('video', { direction: 'recvonly' });
    conn.ontrack = e => { v.srcObject = e.streams[0] || new MediaStream([e.track]); v.play().catch(() => {}); say('Connected. Click once to go full screen.'); };
    conn.onicecandidate = e => { if (e.candidate && cur === sid) db.push(`rooms/${room}/cand/${tid}/${sid}/phone`, e.candidate.toJSON()); };
    conn.onconnectionstatechange = () => {
      if (pc !== conn) return; const s = conn.connectionState;
      if (s === 'connected') clearTimeout(retry); else if (s === 'disconnected' || s === 'failed') { say('Connection lost… reconnecting'); clearTimeout(retry); retry = setTimeout(() => connect().catch(() => {}), 1500); }
    };
    const offer = await conn.createOffer(); await conn.setLocalDescription(offer); const pending = [];
    unsubs.push(db.onValue(`rooms/${room}/ans/${tid}/${sid}`, async ans => { if (!ans || pc !== conn || conn.signalingState !== 'have-local-offer') return; try { await conn.setRemoteDescription(ans); pending.splice(0).forEach(c => conn.addIceCandidate(c).catch(() => {})); } catch (e) {} }));
    unsubs.push(db.onChildAdded(`rooms/${room}/cand/${tid}/${sid}/ctrl`, (k, c) => { if (pc !== conn) return; if (conn.remoteDescription) conn.addIceCandidate(c).catch(() => {}); else pending.push(c); }));
    await db.set(`rooms/${room}/tvs/${id}`, { sid, offer: { type: offer.type, sdp: offer.sdp }, t: Date.now() });
    db.onDisconnectRemove(`rooms/${room}/tvs/${id}`);
    say(`Waiting for the control room (room ${room})…`);
    watchdog = setTimeout(() => { if (pc === conn && conn.connectionState !== 'connected') connect().catch(() => {}); }, 15000);
  }
  (async () => {
    say('Connecting…'); Signal.onError = m => say('The database refused the link (' + m + ') on ' + Signal.dbHost());
    try { db = await Signal.connect(); } catch (e) { return say('No internet: ' + e.message); }
    connect().catch(e => say('Could not connect: ' + e.message)); addEventListener('online', () => connect().catch(() => {}));
  })();
})();
