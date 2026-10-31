// frame.js - the church "photo frame" strip (logo, church name, theme, address, date) or a picture such as a flier header,
// drawn across the live picture and on photos. Ported from the earlier LCRM church live app.
(function () {
  var DEF = { on: false, tv: false, photos: true, pos: "top", op: 100, mode: "strip", logo: "logos/logo-left.png", name: "LOVE OF CHRIST ASSEMBLY", sub: "Christ Apostolic Church",
    theme: "", tag: "", date: "", autodate: true, addr1: "69A, Itoki Road, Olaore Bus Stop,", addr2: "Ajegunle, Abule Iroko,", addr3: "Ogun State.", tiktok: "lcrm.church", facebook: "lcrmchurch",
    strip: 72, img: "", from: "top", amount: 28 };
  function merge(c) { var o = {}, k; c = c || {}; for (k in DEF) o[k] = DEF[k]; for (k in c) if (c[k] !== undefined && c[k] !== null) o[k] = c[k]; return o; }
  function ord(n) { var s = ["TH", "ST", "ND", "RD"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function autoDate(d) {
    d = d || new Date();
    var W = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"], M = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    return W[d.getDay()] + " " + ord(d.getDate()) + " " + M[d.getMonth()] + ", " + d.getFullYear();
  }
  var OLD = ["name", "sub", "addr1", "addr2", "addr3", "handle", "logo"];
  var logoCache = {};
  function loadLogo(src) {
    if (!src) return Promise.resolve(null);
    if (logoCache[src]) return logoCache[src];
    return (logoCache[src] = new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }));
  }
  function fit(cx, text, font, maxW, size) { cx.font = font.replace("{s}", size); while (size > 6 && cx.measureText(text).width > maxW) { size *= 0.94; cx.font = font.replace("{s}", size); } return size; }
  function wrap(text, n) {
    var out = [];
    String(text || "").split(/\n/).forEach(function (ln) {
      var words = ln.trim().split(/\s+/).filter(Boolean), cur = "";
      words.forEach(function (w) { if (cur && (cur + " " + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; });
      if (cur) out.push(cur);
    });
    return out;
  }
  function shadow(cx, u, a) { cx.shadowColor = "rgba(0,0,0," + (a || .85) + ")"; cx.shadowBlur = .5 * u; cx.shadowOffsetY = .12 * u; }
  // Draw the picture and the strip onto canvas cv. img = Image or canvas. Returns a Promise.
  function drawStrip(cv, img, cfg) {
    var c = merge(cfg), W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    cv.width = W; cv.height = H; var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, W, H);
    if (!c.on) return Promise.resolve(cv);
    return loadLogo(c.logo === "none" ? "" : c.logo).then(function (logo) {
      var u = W / 100, yT = H - 14.8 * u, sh = 9 * u, mid = yT + sh / 2;
      cx.save();
      cx.fillStyle = "rgba(10,10,28," + Math.max(0, Math.min(1, (Number(c.strip) || 72) / 100)) + ")"; cx.fillRect(0, yT, W, sh);
      cx.fillStyle = "rgba(255,255,255,.35)"; cx.fillRect(0, yT, W, Math.max(1, .12 * u)); cx.fillRect(0, yT + sh - Math.max(1, .12 * u), W, Math.max(1, .12 * u));
      // left: logo + name
      var lx = 3.5 * u, ld = 6.6 * u;
      if (logo) { cx.drawImage(logo, lx, mid - ld / 2, ld, ld); lx += ld + 1.6 * u; }
      cx.textBaseline = "middle"; cx.textAlign = "left"; shadow(cx, u);
      var nameW = 24 * u, ns = fit(cx, c.name, "700 {s}px Georgia, 'Times New Roman', serif", nameW, 2.7 * u);
      cx.fillStyle = "#fff"; cx.font = "700 " + ns + "px Georgia, 'Times New Roman', serif"; cx.fillText(c.name, lx, c.sub ? mid - 1.1 * u : mid);
      if (c.sub) { var ss = fit(cx, c.sub, "400 {s}px system-ui, Arial, sans-serif", nameW, 1.9 * u); cx.font = "400 " + ss + "px system-ui, Arial, sans-serif"; cx.fillStyle = "rgba(255,255,255,.85)"; cx.fillText(c.sub, lx, mid + 1.5 * u); }
      // right: address lines
      cx.textAlign = "right"; cx.fillStyle = "#fff"; var addr = [c.addr1, c.addr2, c.addr3].filter(Boolean), as = 1.7 * u, rx = W - 3.5 * u, lh = as * 1.18;
      addr.forEach(function (t, i) { var s2 = fit(cx, t, "700 {s}px system-ui, Arial, sans-serif", 28 * u, as); cx.font = "700 " + s2 + "px system-ui, Arial, sans-serif"; cx.fillText(t, rx, mid + (i - (addr.length - 1) / 2) * lh); });
      // middle: theme (may rise above the strip)
      var th = wrap(c.theme, 20).slice(0, 4);
      if (th.length) {
        var fs = Math.min(5.4 * u, (sh * 1.25) / th.length / 0.95), tl = fs * .95;
        cx.textAlign = "center"; cx.lineJoin = "round";
        var ts = fs, F = "900 {s}px 'Trebuchet MS', Impact, Arial, sans-serif";
        th.forEach(function (t) { ts = Math.min(ts, fit(cx, t.toUpperCase(), F, 28 * u, fs)); });      // one size for every line
        th.forEach(function (t, i) {
          var tt = t.toUpperCase(), y = mid + (i - (th.length - 1) / 2) * ts * 1.0 - (c.tag ? .5 * u : 0);
          cx.font = F.replace("{s}", ts);
          cx.shadowColor = "rgba(0,0,0,.7)"; cx.shadowBlur = .8 * u;
          cx.strokeStyle = "#4a2600"; cx.lineWidth = Math.max(2, ts * .16); cx.strokeText(tt, W / 2, y);
          var g = cx.createLinearGradient(0, y - ts / 2, 0, y + ts / 2); g.addColorStop(0, "#ffe9a0"); g.addColorStop(.5, "#f2b53a"); g.addColorStop(1, "#c77d12");
          cx.shadowBlur = 0; cx.fillStyle = g; cx.fillText(tt, W / 2, y);
        });
      }
      // second row: date left, small line middle, TikTok / Facebook in the bottom right corner
      var y2 = yT + sh + 2.4 * u, ds = c.date || (c.autodate ? autoDate() : "");
      shadow(cx, u, .9); cx.textBaseline = "middle"; cx.fillStyle = "#fff";
      if (ds) { cx.textAlign = "left"; var s4 = fit(cx, ds, "700 {s}px system-ui, Arial, sans-serif", 34 * u, 1.65 * u); cx.font = "700 " + s4 + "px system-ui, Arial, sans-serif"; cx.fillText(ds, 3.5 * u, y2); }
      if (c.tag) { cx.textAlign = "center"; cx.fillStyle = "#fff6d6"; cx.font = "700 " + 1.5 * u + "px system-ui, Arial, sans-serif"; if ("letterSpacing" in cx) cx.letterSpacing = (.35 * u) + "px"; cx.fillText(String(c.tag).toUpperCase(), W / 2, y2); if ("letterSpacing" in cx) cx.letterSpacing = "0px"; }
      var soc = []; if (c.tiktok) soc.push("TikTok: " + c.tiktok); if (c.facebook) soc.push("Facebook: " + c.facebook);
      cx.textAlign = "right"; cx.fillStyle = "#fff";
      soc.forEach(function (t, i) { var s5 = fit(cx, t, "700 {s}px system-ui, Arial, sans-serif", 26 * u, 1.45 * u); cx.font = "700 " + s5 + "px system-ui, Arial, sans-serif"; cx.fillText(t, W - 2.5 * u, y2 + (i - (soc.length - 1) / 2) * 1.9 * u + (soc.length > 1 ? .2 * u : 0)); });
      cx.restore(); return cv;
    });
  }
  var cache = { key: "", cv: null }, pending = "";
  function loadImg(src) { return new Promise(function (ok) { if (!src) return ok(null); var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }); }
  function build(c) {
    var BW = 1920;
    if (c.mode === "image") {
      return loadImg(c.img).then(function (im) {
        if (!im) return null; var nw = im.naturalWidth, nh = im.naturalHeight, a = Math.max(5, Math.min(100, Number(c.amount) || 28)) / 100, sh = nh * a, sy = c.from === "bottom" ? nh - sh : 0;
        var cv = document.createElement("canvas"); cv.width = BW; cv.height = Math.round(BW * sh / nw); cv.getContext("2d").drawImage(im, 0, sy, nw, sh, 0, 0, cv.width, cv.height); return cv;
      });
    }
    var blank = document.createElement("canvas"); blank.width = BW; blank.height = Math.round(16.6 * BW / 100); var cv = document.createElement("canvas");
    return drawStrip(cv, blank, Object.assign({}, c, { on: true }));
  }
  // the band as a canvas (null while it is still being made)
  function band(cfg) {
    var c = merge(cfg), key = JSON.stringify([c.mode, c.logo, c.name, c.sub, c.theme, c.tag, c.date, c.autodate && autoDate(), c.addr1, c.addr2, c.addr3, c.tiktok, c.facebook, c.strip, c.img.length, c.img.slice(-40), c.from, c.amount]);
    if (cache.key === key) return cache.cv;
    if (pending !== key) { pending = key; build(c).then(function (cv) { cache = { key: key, cv: cv }; if (pending === key) pending = ""; }); }
    return cache.key ? cache.cv : null;
  }
  // draw onto a w x h canvas. Returns the share of the height that the frame covers (0 when nothing is drawn).
  function draw(cx, w, h, cfg) {
    var c = merge(cfg); if (!c.on) return 0; var b = band(c); if (!b) return 0;
    var dw = w, dh = w * b.height / b.width; if (dh > h * .5) { dh = h * .5; dw = dh * b.width / b.height; }
    cx.save(); cx.globalAlpha = Math.max(.2, Math.min(1, (Number(c.op) || 100) / 100));
    cx.drawImage(b, (w - dw) / 2, c.pos === "bottom" ? h - dh : 0, dw, dh); cx.restore(); return dh / h;
  }
  function fromFile(file, maxW) {
    return new Promise(function (ok, no) {
      var im = new Image(), url = URL.createObjectURL(file);
      im.onload = function () { var w = Math.min(maxW || 1280, im.naturalWidth), h = Math.round(im.naturalHeight * w / im.naturalWidth), cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d").drawImage(im, 0, 0, w, h); ok(cv.toDataURL("image/jpeg", .85)); };
      im.onerror = no; im.src = url;
    });
  }
  window.Frame = { DEF: DEF, merge: merge, draw: draw, band: band, fromFile: fromFile, autoDate: autoDate };
})();
