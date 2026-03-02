// ============================================================
// FrameDeck — Offscreen Timer
// Runs setInterval reliably (service workers get killed)
// ============================================================

let timerHandle = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'start-timer') {
    // Clear any existing timer
    if (timerHandle) clearInterval(timerHandle);

    const intervalMs = msg.intervalMs || 30000;

    timerHandle = setInterval(() => {
      chrome.runtime.sendMessage({ action: 'tick' });
    }, intervalMs);
  }

  if (msg.action === 'stop-timer') {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }
});
