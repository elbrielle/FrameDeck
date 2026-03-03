// ============================================================
// FrameDeck — Content Script
// Countdown overlay + transition effects injected into pages
// ============================================================
(() => {
  if (window.__framedeck) return;
  window.__framedeck = true;

  let els = null;
  let raf = null;
  let startTime = 0;
  let duration = 0;
  let paused = false;
  let pausedLeft = 0;

  function getEls() {
    if (els) return els;
    const root = document.createElement('div');
    root.id = 'fd-root';
    root.innerHTML = `
      <div id="fd-bar"><div id="fd-fill"></div></div>
      <div id="fd-time"></div>
      <div id="fd-fade"></div>
    `;
    const s = document.createElement('style');
    s.textContent = `
      #fd-root{position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;font-family:system-ui,-apple-system,sans-serif}
      #fd-bar{height:3px;background:rgba(0,0,0,.12);width:100%}
      #fd-fill{height:100%;width:100%;background:linear-gradient(90deg,#4f6ef7,#6b85ff);transform-origin:left;box-shadow:0 0 6px rgba(79,110,247,.5)}
      #fd-fill.paused{background:linear-gradient(90deg,#eab308,#fbbf24);box-shadow:0 0 6px rgba(234,179,8,.5)}
      #fd-time{position:fixed;top:8px;right:12px;background:rgba(15,18,25,.88);color:#d4d4dc;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;border:1px solid rgba(79,110,247,.25);opacity:0;transition:opacity .3s;font-variant-numeric:tabular-nums;backdrop-filter:blur(6px)}
      #fd-time.on{opacity:1}
      #fd-fade{position:fixed;top:0;left:0;width:100vw;height:100vh;background:#0f1219;opacity:0;pointer-events:none;transition:opacity .3s ease}
      #fd-fade.out{opacity:1}
    `;
    document.documentElement.appendChild(s);
    document.documentElement.appendChild(root);
    els = {
      fill: root.querySelector('#fd-fill'),
      time: root.querySelector('#fd-time'),
      fade: root.querySelector('#fd-fade'),
    };
    return els;
  }

  function removeEls() {
    const r = document.getElementById('fd-root');
    if (r) r.remove();
    els = null;
  }

  function startCountdown(sec) {
    const { fill, time } = getEls();
    duration = sec * 1000;
    startTime = performance.now();
    paused = false;
    fill.classList.remove('paused');
    time.classList.add('on');
    if (raf) cancelAnimationFrame(raf);
    tick();
  }

  function tick() {
    if (paused || !els) return;
    const left = Math.max(0, duration - (performance.now() - startTime));
    const pct = left / duration;
    els.fill.style.transform = `scaleX(${pct})`;
    els.time.textContent = `${Math.ceil(left / 1000)}s`;
    if (left > 0) raf = requestAnimationFrame(tick);
  }

  function pauseCountdown() {
    paused = true;
    pausedLeft = Math.max(0, duration - (performance.now() - startTime));
    if (els) {
      els.fill.classList.add('paused');
      els.time.textContent = `\u23F8 ${Math.ceil(pausedLeft / 1000)}s`;
    }
    if (raf) cancelAnimationFrame(raf);
  }

  function resumeCountdown() {
    paused = false;
    duration = pausedLeft;
    startTime = performance.now();
    if (els) els.fill.classList.remove('paused');
    tick();
  }

  function stopCountdown() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    removeEls();
  }

  function fadeOut() {
    return new Promise(resolve => {
      const { fade } = getEls();
      fade.classList.remove('out');
      void fade.offsetHeight;
      fade.classList.add('out');
      setTimeout(resolve, 300);
    });
  }

  function fadeIn() {
    const { fade } = getEls();
    fade.classList.add('out');
    void fade.offsetHeight;
    fade.classList.remove('out');
  }

  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.target !== 'content') return;
    switch (msg.action) {
      case 'start-countdown': startCountdown(msg.duration); respond({ ok: 1 }); break;
      case 'pause-countdown': pauseCountdown(); respond({ ok: 1 }); break;
      case 'resume-countdown': resumeCountdown(); respond({ ok: 1 }); break;
      case 'stop-countdown': stopCountdown(); respond({ ok: 1 }); break;
      case 'fade-out': fadeOut().then(() => respond({ ok: 1 })); return true;
      case 'fade-in': fadeIn(); respond({ ok: 1 }); break;
    }
  });
})();
