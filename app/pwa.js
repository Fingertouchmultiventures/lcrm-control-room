// pwa.js - registers the service worker and shows an "Install app" pop-up.
(function () {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;
  const KEY = 'lcrm_install_dismissed';
  const dismissed = () => { try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 7 * 864e5; } catch (e) { return false; } };
  const remember = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} };
  let deferred = null;

  function banner(html, withInstall) {
    if (document.getElementById('lcrmInstall') || dismissed()) return;
    const b = document.createElement('div'); b.id = 'lcrmInstall';
    b.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100;width:min(440px,calc(100vw - 24px));background:#151922;color:#eceff5;border:1px solid #f5b942;border-radius:14px;padding:14px 16px;font:14px/1.45 system-ui,"Segoe UI",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6);display:flex;gap:12px;align-items:center';
    b.innerHTML = '<img src="icons/icon-192.png" alt="" width="44" height="44" style="border-radius:10px"><div style="flex:1"><b>Install the LCRM app</b><div style="color:#9aa3b5;font-size:13px">' + html + '</div></div>' +
      (withInstall ? '<button id="lcrmInstallGo" style="background:#f5b942;color:#1a1300;border:0;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer">Install</button>' : '') +
      '<button id="lcrmInstallNo" aria-label="Close" style="background:none;border:0;color:#9aa3b5;font-size:22px;cursor:pointer">×</button>';
    document.body.appendChild(b);
    b.querySelector('#lcrmInstallNo').onclick = () => { remember(); b.remove(); };
    const go = b.querySelector('#lcrmInstallGo');
    if (go) go.onclick = async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; b.remove(); };
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; banner('Open it like a normal app from your home screen or desktop.', true); });
  addEventListener('appinstalled', () => { const b = document.getElementById('lcrmInstall'); if (b) b.remove(); });
  // iPhone / iPad Safari has no install button, so explain the manual steps
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) addEventListener('load', () => setTimeout(() => banner('Tap the <b>Share</b> button, then <b>Add to Home Screen</b>.', false), 1500));
})();
