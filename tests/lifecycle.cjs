// Real Chrome lifecycle checks, with Playwright disconnected during timer waits.
// Requires Node 22+, PLAYWRIGHT_MODULE and CHROMIUM_PATH (see tests/browser.cjs).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'framedeck-lifecycle-'));
const results = { date: new Date().toISOString(), passed: false, checks: [] };
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><title>Lifecycle ${req.url.slice(1)}</title><h1>FrameDeck lifecycle test</h1>`);
});
let processHandle, browser, observer;

async function launch() {
  fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true });
  processHandle = spawn(process.env.CHROMIUM_PATH || chromium.executablePath(), [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    `--disable-extensions-except=${path.join(root, 'extension')}`, `--load-extension=${path.join(root, 'extension')}`,
    'about:blank',
  ], { stdio: 'ignore' });
  const end = Date.now() + 15000;
  while (!fs.existsSync(path.join(profile, 'DevToolsActivePort'))) {
    if (Date.now() > end || processHandle.exitCode !== null) throw new Error('Chrome did not start.');
    await pause(50);
  }
  const [port, endpoint] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
  return { http: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}${endpoint}` };
}

// Browser-level target discovery observes worker lifecycle without attaching a
// debugger to the worker. No storage reads, extension messages or polling run
// during the quiet intervals.
async function observe(endpoint) {
  const socket = new WebSocket(endpoint);
  await once(socket, 'open');
  const pending = new Map(), targets = new Map(), events = [];
  let id = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (request) message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    }
    if (message.method === 'Target.targetCreated' || message.method === 'Target.targetInfoChanged') {
      const target = message.params.targetInfo;
      targets.set(target.targetId, target);
      if (message.method === 'Target.targetCreated') events.push({ action: 'created', time: Date.now(), ...target });
    }
    if (message.method === 'Target.targetDestroyed') {
      const target = targets.get(message.params.targetId);
      events.push({ action: 'destroyed', time: Date.now(), ...target });
      targets.delete(message.params.targetId);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  await send('Target.setDiscoverTargets', { discover: true });
  return { send, events, close: () => socket.close() };
}
async function connect(address) {
  browser = await chromium.connectOverCDP(address.http);
  return browser.contexts()[0];
}
async function openUI(context, extension) {
  const ui = await context.newPage();
  await ui.goto(extension + '/popup.html');
  await ui.waitForFunction(() => document.querySelector('#startBtn') && !document.querySelector('#feedback').classList.contains('error'));
  return ui;
}
const readState = ui => ui.evaluate(() => chrome.runtime.sendMessage({ action: 'get-state' }));
async function start(ui, seconds) {
  await ui.waitForFunction(() => document.querySelector('#startBtn').disabled === false);
  await ui.locator('#intervalInput').fill(String(seconds));
  await ui.locator('#startBtn').click();
  await ui.waitForFunction(() => document.querySelector('#statusBadge').textContent === 'Playing');
  const state = await readState(ui);
  assert.equal(state.intervalSeconds, seconds);
  return state;
}
async function disconnect() {
  // connectOverCDP browser.close() detaches the client; it does not close Chrome.
  await browser.close(); browser = null;
  assert.equal(processHandle.exitCode, null);
}
async function closeChrome() {
  if (browser) await disconnect();
  const exited = once(processHandle, 'exit');
  if (observer) {
    observer.send('Browser.close').catch(() => {});
    await exited;
    observer.close(); observer = null;
  } else {
    processHandle.kill('SIGTERM');
    await exited;
  }
  processHandle = null;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let address = await launch();
  let context = await connect(address);
  results.browser = browser.version();
  let worker;
  for (let attempt = 0; attempt < 100 && !worker; attempt++) {
    for (const candidate of context.serviceWorkers()) {
      const name = await candidate.evaluate(() => chrome.runtime.getManifest().name).catch(() => null);
      if (name === 'FrameDeck') { worker = candidate; break; }
    }
    if (!worker) await pause(100);
  }
  assert(worker, 'The FrameDeck service worker did not load.');
  const extension = worker.url().replace(/\/background\.js$/, '');
  for (const name of ['one', 'two', 'three']) {
    const page = await context.newPage(); await page.goto(`${base}/${name}`);
  }
  observer = await observe(address.ws);
  let ui = await openUI(context, extension);
  await start(ui, 5);
  await ui.close(); await disconnect();
  const shortStarted = Date.now();
  await pause(6200);
  context = await connect(address); ui = await openUI(context, extension);
  let state = await readState(ui);
  assert.equal(state.isRotating, true);
  assert.equal(state.currentIndex, 1);
  results.checks.push({ name: '5-second rotation with popup closed and Playwright detached', elapsedMs: Date.now() - shortStarted, currentIndex: state.currentIndex });
  console.log('PASS 5-second rotation with no popup or attached worker debugger');
  await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'stop' }));
  await ui.waitForFunction(() => !document.querySelector('#startBtn').hidden && !document.querySelector('#startBtn').disabled);

  await start(ui, 31);
  await ui.close(); await disconnect();
  const longStarted = Date.now();
  const targets = await observer.send('Target.getTargets');
  const activeWorker = targets.targetInfos.find(target => target.url === extension + '/background.js');
  assert.equal(activeWorker?.attached, false, 'The worker must have no debugger attached during the idle wait.');
  await pause(33400);
  const lifecycle = observer.events.filter(event => event.type === 'service_worker' && event.url === extension + '/background.js' && event.time >= longStarted);
  assert(lifecycle.some(event => event.action === 'destroyed'), 'Chrome did not terminate the idle worker.');
  assert(lifecycle.some(event => event.action === 'created'), 'The scheduled alarm did not restart the worker.');
  context = await connect(address); ui = await openUI(context, extension);
  state = await readState(ui);
  assert.equal(state.isRotating, true);
  assert.equal(state.currentIndex, 1);
  results.checks.push({ name: '31-second alarm crosses natural worker shutdown with no popup/debugger', elapsedMs: Date.now() - longStarted, currentIndex: state.currentIndex, lifecycle: lifecycle.map(event => ({ action: event.action, elapsedMs: event.time - longStarted })) });
  console.log('PASS Chrome naturally stopped the worker; 31-second alarm restarted it and advanced the deck');

  const saved = await ui.evaluate(async () => {
    const state = await chrome.runtime.sendMessage({ action: 'get-state' });
    const tabs = await Promise.all(state.tabOrder.map(id => chrome.tabs.get(id)));
    return chrome.runtime.sendMessage({ action: 'save-profile', profile: {
      name: 'Persistent lifecycle deck', defaultInterval: 31, tabs: tabs.map(tab => ({ url: tab.url })),
    } });
  });
  assert.equal(saved.ok, true);
  await closeChrome();
  address = await launch(); context = await connect(address); observer = await observe(address.ws);
  ui = await openUI(context, extension);
  state = await readState(ui);
  const profiles = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'get-profiles' }));
  assert.equal(state.isRotating, false);
  assert.deepEqual(state.tabOrder, []);
  assert.equal(profiles.find(deck => deck.name === 'Persistent lifecycle deck')?.tabs.length, 3);
  results.checks.push({ name: 'browser restart preserves saved deck and clears runtime tab IDs', profiles: profiles.length, isRotating: state.isRotating });
  console.log('PASS complete browser restart keeps saved deck and stops rotation');
  results.passed = true;
})().catch(error => {
  results.error = error.stack;
  console.error(error); process.exitCode = 1;
}).finally(async () => {
  if (processHandle) await closeChrome();
  server.close();
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'artifacts/lifecycle-results.json'), JSON.stringify(results, null, 2));
  fs.rmSync(profile, { recursive: true, force: true });
});
