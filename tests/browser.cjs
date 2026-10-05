// Optional real-browser acceptance. No browser library is shipped in the extension.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROMIUM_PATH=/path/to/chrome node tests/browser.cjs
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts');
fs.mkdirSync(output, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer((req, res) => {
  const titles = { '/welcome': "Today's Canvas module", '/schedule': 'Bell schedule countdown', '/studio': 'Hall-pass app' };
  const title = titles[req.url] || 'Classroom display';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });
  res.end(`<!doctype html><html><title>${title}</title><body style="margin:0;background:#e9efe8;color:#17251f;font-family:system-ui;padding:80px"><p>CLASSROOM DISPLAY</p><h1 style="font-size:72px;max-width:700px">${title}</h1><p style="font-size:28px">This page is used to test tab rotation.</p></body></html>`);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'framedeck-browser-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: [`--disable-extensions-except=${path.join(root, 'extension')}`, `--load-extension=${path.join(root, 'extension')}`],
    viewport: { width: 420, height: 600 }, deviceScaleFactor: 2, colorScheme: 'light',
  });
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extension = worker.url().replace(/\/background\.js$/, '');
    const first = await context.newPage(); await first.goto(base + '/welcome');
    const second = await context.newPage(); await second.goto(base + '/schedule');
    const third = await context.newPage(); await third.goto(base + '/studio');
    let ui = await context.newPage();
    const externalRequests = [];
    ui.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
    await ui.goto(extension + '/popup.html');
    const state = () => ui.evaluate(() => chrome.runtime.sendMessage({ action: 'get-state' }));
    const waitState = async predicate => { const end = Date.now() + 12000; while (Date.now() < end) { const value = await state(); if (predicate(value)) return value; await pause(100); } throw new Error('Timed out waiting for rotation state'); };
    const waitIdle = () => ui.waitForFunction(() => document.querySelector('#startBtn').disabled === false);
    await waitIdle();
    assert.equal(await ui.locator('.tab-item').count(), 3);
    assert.equal(await ui.locator('#selectedCount').textContent(), '3');
    assert.equal(await ui.locator('#selectedUnit').textContent(), 'tabs');
    assert.equal(await ui.locator('#loopDuration').textContent(), '1m 30s');
    assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    let timerShape = await ui.locator('#timerShape').elementHandle();
    assert((await timerShape.evaluate(el => getComputedStyle(el).transitionProperty)).includes('border-radius'));
    assert.equal(await ui.locator('.reorder:visible').count(), 3);
    await pause(250);
    await ui.screenshot({ path: path.join(output, 'popup-light.png'), fullPage: true });
    for (const width of [320, 580]) {
      await ui.setViewportSize({ width, height: 600 });
      assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await ui.screenshot({ path: path.join(output, `panel-setup-${width}.png`), fullPage: true });
    }
    await ui.setViewportSize({ width: 420, height: 600 });
    await ui.emulateMedia({ colorScheme: 'dark' }); await pause(250);
    await ui.screenshot({ path: path.join(output, 'popup-dark.png'), fullPage: true });
    await ui.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    assert.equal(await ui.locator('#startBtn').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    assert.equal(await timerShape.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await ui.emulateMedia({ reducedMotion: 'no-preference' });
    await ui.locator('#selectNoneBtn').click();
    await ui.waitForFunction(() => document.querySelector('#selectedCount').textContent === '0');
    assert.equal(await ui.locator('#loopDuration').textContent(), '0s');
    await ui.locator('.tab-select input').first().check();
    assert.equal(await ui.locator('#selectedUnit').textContent(), 'tab');
    assert.equal(await ui.locator('#loopDuration').textContent(), '30s');
    assert.equal(await ui.locator('#startBtn').isDisabled(), true);
    await ui.locator('#selectAllBtn').click(); await waitIdle();
    const policyPagePromise = context.waitForEvent('page');
    await ui.getByRole('link', { name: 'Privacy', exact: true }).click();
    const policyPage = await policyPagePromise;
    await policyPage.waitForLoadState();
    assert.equal(await policyPage.locator('h1').textContent(), 'FrameDeck privacy policy');
    assert((await policyPage.locator('main').textContent()).includes('does not use Chrome'));
    await policyPage.close();
    console.log('PASS loaded extension UI: light/dark, popup width, reduced motion, offline privacy page');

    const duration = ui.locator('.tab-duration').first();
    await duration.fill('45');
    await third.evaluate(() => { document.title = 'Hall-pass app · Updated'; });
    await pause(150);
    assert.equal(await ui.locator('.tab-duration').first().inputValue(), '45');
    await ui.locator('#queueTitle').click(); await waitIdle();
    await ui.getByRole('button', { name: 'Move Bell schedule countdown up', exact: true }).click(); await waitIdle();
    assert.equal(await ui.locator('.tab-title').first().textContent(), 'Bell schedule countdown');
    await ui.locator('.tab-item').first().dragTo(ui.locator('.tab-item').nth(1), { targetPosition: { x: 150, y: 55 } });
    assert.equal(await ui.locator('.tab-title').first().textContent(), "Today's Canvas module");
    await ui.locator('.tab-item').nth(1).dragTo(ui.locator('.tab-item').first(), { targetPosition: { x: 150, y: 3 } });
    assert.equal(await ui.locator('.tab-title').first().textContent(), 'Bell schedule countdown');
    await ui.locator('.tab-select input').last().uncheck();
    await pause(100); await ui.reload(); await waitIdle();
    assert.equal(await ui.locator('.tab-select input:checked').count(), 2);
    assert.equal(await ui.locator('.tab-title').first().textContent(), 'Bell schedule countdown');
    assert.equal(await ui.locator('.tab-duration').nth(1).inputValue(), '45');
    console.log('PASS drafts: selection, keyboard order, durations survive reopen and live title changes');

    await ui.locator('#decksPanel summary').click();
    await ui.locator('#saveProfileBtn').click(); await ui.locator('#profileName').fill('Morning display');
    await ui.locator('#confirmDialogBtn').click(); await ui.waitForFunction(() => !document.querySelector('dialog').open);
    await ui.locator('#loadProfileBtn').click(); await waitIdle();
    assert.equal(await ui.evaluate(async () => (await chrome.tabs.query({ currentWindow: true })).filter(t => /^http/.test(t.url)).length), 3);
    assert.equal(await ui.locator('.tab-title').first().textContent(), 'Bell schedule countdown');
    await ui.locator('#decksPanel summary').click();
    console.log('PASS saved decks: save/load retain order/timing and reuse open tabs');

    timerShape = await ui.locator('#timerShape').elementHandle();
    await ui.locator('#intervalInput').fill('5');
    // A single click after editing must both commit timing and start playback.
    await ui.locator('#startBtn').click();
    await waitState(s => s.isRotating);
    let playing = await state(); assert.equal(playing.intervalSeconds, 5);
    assert.equal(playing.tabOrder.length, 2);
    assert.equal(await ui.evaluate(() => chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })), false);
    await pause(1500); await ui.locator('#pauseResumeBtn').click();
    await waitState(s => s.isPaused);
    const paused = await state(); assert(paused.remainingMs < 4500 && paused.remainingMs > 1000);
    await pause(800); assert.equal((await state()).remainingMs, paused.remainingMs);
    assert.equal(await timerShape.evaluate(el => el.isConnected && getComputedStyle(el).borderTopLeftRadius), '28px');
    assert.equal(await ui.locator('#countdownLabel').textContent(), 'Time left');
    assert.equal(await ui.locator('.reorder:visible').count(), await ui.locator('.tab-item').count());
    assert.equal(await ui.locator('.reorder button:enabled').count(), 0);
    await ui.screenshot({ path: path.join(output, 'popup-paused.png'), fullPage: true });
    await ui.locator('#pauseResumeBtn').click();
    await waitState(s => !s.isPaused);
    assert((await state()).remainingMs <= paused.remainingMs);
    await waitState(s => s.currentIndex === 1);
    playing = await state(); assert.equal(playing.cycleDurationMs, 45000);
    await pause(250);
    assert.equal(await timerShape.evaluate(el => el.isConnected && getComputedStyle(el).borderTopLeftRadius), '50%');
    await ui.screenshot({ path: path.join(output, 'popup-playing.png'), fullPage: true });
    for (const width of [320, 580]) {
      await ui.setViewportSize({ width, height: 600 });
      assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert((await ui.locator('#pauseResumeBtn').boundingBox()).y < 180, 'Pause must stay near the top');
      await ui.screenshot({ path: path.join(output, `panel-playing-${width}.png`), fullPage: true });
    }
    await ui.setViewportSize({ width: 420, height: 600 });
    console.log('PASS real timing: 5s rotation, pause freezes remaining time, resume uses remainder, custom duration');

    // Explicit worker termination exercises session hydration without mocking Chrome.
    const cdp = await context.browser().newBrowserCDPSession();
    const targets = await cdp.send('Target.getTargets');
    const workerTarget = targets.targetInfos.find(t => t.url === worker.url());
    await cdp.send('Target.closeTarget', { targetId: workerTarget.targetId });
    const resumed = await state(); assert.equal(resumed.isRotating, true); assert.equal(resumed.deadline, playing.deadline);
    await ui.locator('#pauseResumeBtn').click();
    await waitState(s => s.isPaused);
    await ui.locator('#prevBtn').click();
    await waitState(s => s.currentIndex === 0);
    assert.equal((await state()).isPaused, true);
    await second.close();
    await waitState(s => s.tabOrder.length === 1);
    assert.equal((await state()).isPaused, true);
    await ui.locator('#stopBtn').click();
    await waitState(s => !s.isRotating);
    console.log('PASS worker restart, paused navigation, selected-tab close and stop');

    await ui.setViewportSize({ width: 320, height: 600 });
    assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await ui.screenshot({ path: path.join(output, 'popup-compact.png'), fullPage: true });
    await ui.setViewportSize({ width: 420, height: 600 });
    // Actual Chrome tabs exercise saved duplicate URLs and the two-window controls.
    const duplicate = await ui.evaluate(async url => {
      await chrome.runtime.sendMessage({ action: 'save-profile', profile: {
        name: 'Repeated pages', defaultInterval: 120,
        tabs: [{ url, duration: 120 }, { url, duration: 180 }],
      } });
      const win = await chrome.windows.getCurrent();
      return chrome.runtime.sendMessage({ action: 'load-profile', name: 'Repeated pages', windowId: win.id });
    }, base + '/welcome');
    assert(duplicate.ok); assert.equal(new Set(duplicate.tabIds).size, 2);
    assert.deepEqual(duplicate.tabIds.map(id => duplicate.tabDurations[id]), [120, 180]);
    const same = await ui.evaluate(async () => chrome.runtime.sendMessage({ action: 'load-profile', name: 'Repeated pages', windowId: (await chrome.windows.getCurrent()).id }));
    assert.deepEqual(same.tabIds, duplicate.tabIds);
    await ui.evaluate(id => chrome.tabs.remove(id), duplicate.tabIds[1]);
    const reopened = await ui.evaluate(async () => chrome.runtime.sendMessage({ action: 'load-profile', name: 'Repeated pages', windowId: (await chrome.windows.getCurrent()).id }));
    assert.equal(reopened.tabIds[0], duplicate.tabIds[0]);
    assert.notEqual(reopened.tabIds[1], duplicate.tabIds[1]);
    const deckWindow = await ui.evaluate(async () => (await chrome.windows.getCurrent()).id);
    await ui.evaluate(async ({ tabIds, tabDurations, windowId }) => chrome.runtime.sendMessage({ action: 'start', tabIds, tabDurations, windowId, intervalSeconds: 120 }), { ...reopened, windowId: deckWindow });
    // A reopened website tab can report its page event after tabs.create resolves.
    const otherPagePromise = context.waitForEvent('page', { predicate: async page => {
      await page.waitForLoadState();
      return page.url() === extension + '/popup.html';
    } });
    const otherWindow = await ui.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL('popup.html') }));
    const otherUI = await otherPagePromise;
    await otherUI.waitForLoadState();
    await otherUI.waitForFunction(() => document.querySelector('#tabPosition')?.textContent.includes('Other window'));
    assert.equal(await otherUI.locator('.tab-select input:checked').count(), 2);
    await otherUI.locator('#stopBtn').click();
    await waitState(s => !s.isRotating);
    await otherUI.waitForFunction(() => document.querySelectorAll('.tab-item').length === 0);
    await ui.evaluate(async ({ tabIds, tabDurations, windowId }) => chrome.runtime.sendMessage({ action: 'start', tabIds, tabDurations, windowId, intervalSeconds: 120 }), { ...reopened, windowId: deckWindow });
    await ui.evaluate(({ id, windowId }) => chrome.tabs.move(id, { windowId, index: -1 }), { id: reopened.tabIds[0], windowId: otherWindow.id });
    await waitState(s => s.tabOrder.length === 1);
    assert.equal((await state()).tabOrder[0], reopened.tabIds[1]);
    await otherUI.evaluate(id => chrome.windows.remove(id), deckWindow);
    ui = otherUI;
    await waitState(s => !s.isRotating);
    assert.deepEqual((await state()).tabOrder, []);
    console.log('PASS duplicate-URL decks, missing-tab reopen, other-window controls, moved tabs and closed deck window');
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log('PASS compact layout and no page errors');
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ date: new Date().toISOString(), browser: context.browser().version(), passed: true, errors, externalRequests }, null, 2));
  } finally { await context.close(); server.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
