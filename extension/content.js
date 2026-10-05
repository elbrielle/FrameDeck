// The worker owns the clock; this script only draws the current deadline.
(() => {
  if (window.__framedeck) return;
  window.__framedeck = true;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let els = null;
  let countdown = null;
  let tickTimer = null;
  let fadeTimer = null;
  let revision = 0;

  function getEls() {
    if (els?.root.isConnected) return els;
    const root = document.createElement('div');
    root.id = 'framedeck-overlay';
    // Host-page selectors cannot style the contents of this shadow root.
    root.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
    const shadow = root.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box}
        #countdown{font-family:system-ui,-apple-system,sans-serif;color:#d6fff1}
        #countdown[hidden]{display:none}
        #bar{height:4px;background:#cde8e1;width:100%}
        #fill{height:100%;background:#006b5e;transform-origin:left;border-radius:0 4px 4px 0;transition:transform .1s linear}
        #time{position:absolute;top:16px;right:16px;padding:8px 14px;border-radius:18px;background:#005347;color:#d6fff1;box-shadow:0 2px 8px #001f1926;font-size:13px;line-height:20px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.1px}
        #countdown.paused #time{background:#e3eae6;color:#3c4943}
        #countdown.paused #fill{background:#62746a}
        #veil{position:absolute;inset:0;background:#10211d;opacity:0;transition:opacity .16s cubic-bezier(.2,0,0,1)}
        #veil.out{opacity:1}
        @media(prefers-reduced-motion:reduce){#fill,#veil{transition:none}}
      </style>
      <div id="countdown" hidden>
        <div id="bar" aria-hidden="true"><div id="fill"></div></div>
        <div id="time" role="timer" aria-live="off" aria-label="Time until next tab"></div>
      </div>
      <div id="veil" aria-hidden="true"></div>
    `;
    document.documentElement.appendChild(root);
    els = {
      root,
      countdown: shadow.querySelector('#countdown'),
      fill: shadow.querySelector('#fill'),
      time: shadow.querySelector('#time'),
      veil: shadow.querySelector('#veil'),
    };
    return els;
  }

  function tick() {
    clearTimeout(tickTimer);
    if (!countdown || !els) return;
    const left = countdown.paused ? countdown.remainingMs : Math.max(0, countdown.deadline - Date.now());
    els.fill.style.transform = `scaleX(${Math.min(1, left / countdown.durationMs)})`;
    els.time.textContent = countdown.paused
      ? `Paused · ${Math.ceil(left / 1000)}s`
      : `Next tab in ${Math.ceil(left / 1000)}s`;
    if (!countdown.paused && left > 0 && !document.hidden) {
      tickTimer = setTimeout(tick, reducedMotion.matches ? 1000 : 100);
    }
  }

  function startCountdown(msg) {
    if (!Number.isFinite(msg.duration) || msg.duration <= 0 ||
        (!msg.paused && !Number.isFinite(msg.deadline))) return;
    countdown = {
      durationMs: msg.duration * 1000,
      deadline: msg.deadline,
      paused: msg.paused === true,
      remainingMs: Number.isFinite(msg.remainingMs) ? Math.max(0, msg.remainingMs) : 0,
    };
    const ui = getEls();
    ui.countdown.hidden = false;
    ui.countdown.classList.toggle('paused', countdown.paused);
    tick();
  }

  function stopCountdown() {
    clearTimeout(tickTimer);
    clearTimeout(fadeTimer);
    countdown = null;
    els?.root.remove();
    els = null;
  }

  function clearFade() {
    clearTimeout(fadeTimer);
    if (!els) return;
    els.veil.classList.remove('out');
    if (!countdown) {
      els.root.remove();
      els = null;
    }
  }

  function fadeOut() {
    if (reducedMotion.matches || document.hidden) return Promise.resolve();
    clearTimeout(fadeTimer);
    const { veil } = getEls();
    veil.classList.remove('out');
    void veil.offsetHeight;
    veil.classList.add('out');
    // Also clear if switching fails; an old tab must never stay covered.
    fadeTimer = setTimeout(clearFade, 700);
    return new Promise(resolve => setTimeout(resolve, 160));
  }

  function fadeIn() {
    clearFade();
    if (reducedMotion.matches || document.hidden) return;
    const { veil } = getEls();
    veil.classList.add('out');
    void veil.offsetHeight;
    veil.classList.remove('out');
    fadeTimer = setTimeout(clearFade, 180);
  }

  async function restoreCountdown() {
    const requestRevision = ++revision;
    try {
      const reply = await chrome.runtime.sendMessage({ action: 'content-ready' });
      if (requestRevision !== revision) return;
      if (reply?.countdown) startCountdown(reply.countdown);
      else stopCountdown();
    } catch { /* The extension may have been reloaded while this page stayed open. */ }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.target !== 'content') return;
    revision++;
    switch (msg.action) {
      case 'start-countdown': startCountdown(msg); break;
      case 'stop-countdown': stopCountdown(); break;
      case 'fade-out': fadeOut().then(() => respond({ ok: true })); return true;
      case 'fade-in': fadeIn(); break;
      default: return;
    }
    respond({ ok: true });
  });

  document.addEventListener('visibilitychange', () => {
    clearFade();
    clearTimeout(tickTimer);
    if (!document.hidden) restoreCountdown();
  });
  window.addEventListener('pageshow', restoreCountdown);
  reducedMotion.addEventListener('change', () => { clearFade(); tick(); });
  restoreCountdown();
})();
