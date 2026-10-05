// Real headed Chrome check, with a native Pause/Resume/Stop check in the side panel.
// Uses the same PLAYWRIGHT_MODULE and CHROMIUM_PATH as browser.cjs, in a disposable profile.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const title = req.url === '/module' ? "Today's Canvas module" : 'Bell schedule countdown';
  res.writeHead(200, { 'Content-Type': 'text/html', 'X-Frame-Options': 'DENY' });
  res.end(`<!doctype html><title>${title}</title><body style="background:#edf3ed;color:#17251f;font:24px system-ui;padding:64px"><h1>${title}</h1><p>FrameDeck side panel test</p></body>`);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'framedeck-panel-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [`--disable-extensions-except=${path.join(root, 'extension')}`, `--load-extension=${path.join(root, 'extension')}`],
    viewport: null,
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const url = worker.url().replace('/background.js', '/popup.html');
    const first = await context.newPage(); await first.goto(base + '/module');
    const second = await context.newPage(); await second.goto(base + '/schedule');
    const driver = await context.newPage(); await driver.goto(url);
    await driver.waitForFunction(() => !document.querySelector('#startBtn').disabled);
    const state = () => driver.evaluate(() => chrome.runtime.sendMessage({ action: 'get-state' }));
    const waitFor = async (check, label, timeout = 20000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) { if (await check()) return; await delay(200); }
      throw new Error(`Timed out: ${label}`);
    };
    const config = await driver.evaluate(async () => ({
      behavior: await chrome.sidePanel.getPanelBehavior(), manifest: chrome.runtime.getManifest(),
      windowId: (await chrome.windows.getCurrent()).id,
    }));
    assert.equal(config.behavior.openPanelOnActionClick, true);
    assert.equal(config.manifest.action.default_popup, undefined);
    assert.equal(config.manifest.side_panel.default_path, 'popup.html');
    await driver.evaluate(windowId => chrome.sidePanel.open({ windowId }), config.windowId);
    const panels = () => driver.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }));
    await waitFor(async () => (await panels()).length === 1, 'side panel opens');
    const panelId = (await panels())[0].documentId;
    assert(panelId);
    await driver.evaluate(async ({ base, windowId }) => {
      const tabs = (await chrome.tabs.query({ windowId })).filter(tab => tab.url.startsWith(base));
      const result = await chrome.runtime.sendMessage({ action: 'start', windowId,
        tabIds: tabs.map(tab => tab.id), intervalSeconds: 7, tabDurations: { [tabs[1].id]: 10 } });
      if (!result.ok) throw new Error(result.error);
    }, { base, windowId: config.windowId });
    for (const index of [1, 0, 1]) {
      await waitFor(async () => (await state()).currentIndex === index, 'automatic tab switch');
      const visible = await panels();
      assert.equal(visible.length, 1);
      assert.equal(visible[0].documentId, panelId, 'tab switch must not recreate or close the panel');
    }
    console.log('PASS same side panel survives three automatic switches at 7/10 seconds');
    console.log('NATIVE CHECK: click Pause in the side panel, then Resume, then Stop.');
    await waitFor(async () => (await state()).isPaused, 'native Pause', 120000);
    const paused = await state();
    await delay(1200);
    assert.equal((await state()).remainingMs, paused.remainingMs);
    console.log('PASS native Pause; click Resume');
    await waitFor(async () => !(await state()).isPaused, 'native Resume', 120000);
    assert((await state()).isRotating);
    console.log('PASS native Resume; click Stop');
    await waitFor(async () => !(await state()).isRotating, 'native Stop', 120000);
    assert.equal((await panels())[0].documentId, panelId);
    fs.writeFileSync(path.join(root, 'artifacts/side-panel-results.json'), JSON.stringify({
      date: new Date().toISOString(), browser: context.browser().version(), version: config.manifest.version,
      passed: true, checks: ['toolbar configured for side panel', 'same panel across three 7/10-second switches',
        'native Pause freezes remaining time', 'native Resume', 'native Stop retains panel'],
    }, null, 2));
    console.log('PASS native Stop; persistent side panel acceptance complete');
  } finally { await context.close(); server.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
