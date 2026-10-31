// signal.js - tiny realtime key/value tree used for WebRTC signaling.
//   Production : Firebase Realtime Database (loaded from Google's CDN on demand)
//   Testing    : add ?local=1 to every page URL and a localStorage-based tree is
//                used instead (works between tabs of the same browser, no internet).
(function () {
  const cfg = window.LCRM_CONFIG || {};
  const useLocal = new URLSearchParams(location.search).get('local') === '1';
  const clean = p => String(p).split('/').filter(Boolean);

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src + ' (check internet)'));
      document.head.appendChild(s);
    });
  }

  // the database address can be overridden with ?db=https://NAME-default-rtdb.firebaseio.com (remembered on this device)
  function dbUrl() {
    try { const q = new URLSearchParams(location.search).get('db'); if (q) localStorage.setItem('lcrm_db', q); const v = localStorage.getItem('lcrm_db'); if (v && /^https:\/\/.+/.test(v)) return v; } catch (e) {}
    return cfg.databaseURL;
  }
  function firebaseBackend() {
    if (!firebase.apps.length) firebase.initializeApp({ databaseURL: dbUrl() });
    const db = firebase.database();
    // any refusal (usually the database rules) is reported to the page so it can tell the user
    const report = e => { const m = (e && e.message) || String(e); if (window.Signal && typeof Signal.onError === 'function') Signal.onError(m); };
    const guard = pr => pr.catch(e => { report(e); throw e; });
    return {
      name: 'firebase',
      set: (p, v) => guard(db.ref(p).set(v)),
      remove: p => guard(db.ref(p).remove()),
      push: (p, v) => guard(db.ref(p).push(v)),
      onValue(p, cb) { const r = db.ref(p); const h = r.on('value', s => cb(s.val()), report); return () => r.off('value', h); },
      onChildAdded(p, cb) { const r = db.ref(p); const h = r.on('child_added', s => cb(s.key, s.val()), report); return () => r.off('child_added', h); },
      onDisconnectRemove: p => db.ref(p).onDisconnect().remove()
    };
  }

  // Church-network mode: the relay program on the laptop introduces phones/TV to the control room (no internet needed).
  const qsLan = new URLSearchParams(location.search).get('lan') === '1';
  try { if (qsLan) sessionStorage.setItem('lcrm_lan', '1'); } catch (e) {}
  const useLan = !useLocal && (qsLan || (function () { try { return sessionStorage.getItem('lcrm_lan') === '1'; } catch (e) { return false; } })() || location.port === String(cfg.lanPort || 8788));
  function lanBackend() {
    return new Promise((resolve, reject) => {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/sig';
      let ws, id = 0, opened = false; const subs = new Map(), dcs = new Set(), queue = [];
      const send = o => { const t = JSON.stringify(o); if (ws && ws.readyState === 1) ws.send(t); else queue.push(t); };
      function open() {
        ws = new WebSocket(url);
        ws.onopen = () => { opened = true; subs.forEach((v, i) => ws.send(JSON.stringify({ op: 'sub', id: i, path: v.path, kind: v.kind }))); dcs.forEach(p => ws.send(JSON.stringify({ op: 'dc', path: p }))); queue.splice(0).forEach(t => ws.send(t)); resolve(api); };
        ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } const sub = subs.get(m.id); if (!sub) return; if (m.t === 'value') sub.cb(m.v); else sub.cb(m.k, m.v); };
        ws.onclose = () => { if (!opened) return reject(new Error('Cannot reach the relay on this laptop. Is start-lan.bat running?')); setTimeout(open, 1500); };
        ws.onerror = () => {};
      }
      const sub = (path, kind, cb) => { const i = ++id; subs.set(i, { path, kind, cb }); send({ op: 'sub', id: i, path, kind }); return () => { subs.delete(i); send({ op: 'unsub', id: i }); }; };
      const api = {
        name: 'lan',
        set: async (p, v) => send({ op: 'set', path: p, value: v }), remove: async p => send({ op: 'remove', path: p }), push: async (p, v) => send({ op: 'push', path: p, value: v }),
        onValue: (p, cb) => sub(p, 'value', cb), onChildAdded: (p, cb) => sub(p, 'child', cb),
        onDisconnectRemove: p => { dcs.add(p); send({ op: 'dc', path: p }); }
      };
      cfg.iceServers = [];   // same network: no outside help needed
      open();
    });
  }

  function localBackend() {
    const KEY = 'lcrm_local_db';
    const subs = new Set();
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const getAt = (t, p) => clean(p).reduce((o, k) => (o == null ? undefined : o[k]), t);
    const setAt = (t, p, v) => {
      const ks = clean(p); let o = t;
      ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
      if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v;
    };
    const notify = () => subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    const write = t => { localStorage.setItem(KEY, JSON.stringify(t)); setTimeout(notify, 0); };
    addEventListener('storage', e => { if (e.key === KEY) notify(); });
    let seq = 0;
    return {
      name: 'local',
      set: async (p, v) => { const t = read(); setAt(t, p, JSON.parse(JSON.stringify(v))); write(t); },
      remove: async p => { const t = read(); setAt(t, p, null); write(t); },
      push: async (p, v) => {
        const t = read(); const k = Date.now().toString(36) + (seq++).toString(36).padStart(3, '0') + Math.random().toString(36).slice(2, 5);
        setAt(t, p + '/' + k, JSON.parse(JSON.stringify(v))); write(t);
      },
      onValue(p, cb) {
        let last = '__none__';
        const f = () => { const v = getAt(read(), p); const s = JSON.stringify(v === undefined ? null : v); if (s !== last) { last = s; cb(v === undefined ? null : v); } };
        subs.add(f); f(); return () => subs.delete(f);
      },
      onChildAdded(p, cb) {
        const seen = new Set();
        const f = () => { const obj = getAt(read(), p); if (obj && typeof obj === 'object') Object.keys(obj).sort().forEach(k => { if (!seen.has(k)) { seen.add(k); cb(k, obj[k]); } }); };
        subs.add(f); f(); return () => subs.delete(f);
      },
      onDisconnectRemove(p) { addEventListener('beforeunload', () => { const t = read(); setAt(t, p, null); localStorage.setItem(KEY, JSON.stringify(t)); }); }
    };
  }

  window.Signal = {
    isLocal: useLocal,
    isLan: useLan,
    onError: null,
    dbHost() { if (useLan) return 'church network'; try { return new URL(dbUrl()).hostname.replace('.firebaseio.com', ''); } catch (e) { return '?'; } },
    async connect() {
      if (useLocal) return localBackend();
      if (useLan) return lanBackend();
      if (typeof firebase === 'undefined') {
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js');
      }
      return firebaseBackend();
    }
  };
})();
