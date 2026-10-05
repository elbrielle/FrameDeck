const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../extension/background.js', `file://${__filename}`), 'utf8');
const clone = value => structuredClone(value);

function event() {
  const listeners = [];
  return { addListener(fn) { listeners.push(fn); }, fire(...args) { listeners.forEach(fn => fn(...args)); } };
}

function browser(options = {}) {
  let now = options.now ?? 100000;
  const local = clone(options.local || {});
  const session = clone(options.session || {});
  const tabs = new Map((options.tabs || [
    { id: 1, windowId: 10, url: 'https://one.example/', active: true },
    { id: 2, windowId: 10, url: 'https://two.example/', active: false },
    { id: 3, windowId: 10, url: 'https://three.example/', active: false },
  ]).map(tab => [tab.id, clone(tab)]));
  const alarms = new Map();
  const timers = new Map();
  const sent = [];
  const created = [];
  const activated = [];
  const injected = [];
  let timerId = 0;
  let nextId = 100;
  function storage(data) {
    return {
      async get(key) { return { [key]: clone(data[key]) }; },
      async set(values) { Object.assign(data, clone(values)); },
      async remove(key) { delete data[key]; },
      async setAccessLevel() {},
    };
  }
  const chrome = {
    runtime: {
      id: 'test-extension', getURL: file => `chrome-extension://test-extension/${file}`,
      onMessage: event(), onStartup: event(), onInstalled: event(),
    },
    storage: { local: storage(local), session: storage(session) },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    sidePanel: { async setPanelBehavior() {} },
    permissions: { async contains() { return options.permission !== false; }, onRemoved: event() },
    scripting: { async executeScript(details) { injected.push(details.target.tabId); } },
    tabs: {
      onRemoved: event(), onDetached: event(), onReplaced: event(), onUpdated: event(),
      async query(query) { return [...tabs.values()].filter(tab => query.windowId === undefined || tab.windowId === query.windowId).map(clone); },
      async get(id) { if (!tabs.has(id)) throw new Error('Missing tab'); return clone(tabs.get(id)); },
      async update(id, change) {
        if (!tabs.has(id)) throw new Error('Missing tab');
        activated.push(id);
        if (change.active) tabs.forEach(tab => { if (tab.windowId === tabs.get(id).windowId) tab.active = tab.id === id; });
        Object.assign(tabs.get(id), change);
        return clone(tabs.get(id));
      },
      async create(properties) {
        const tab = { id: nextId++, ...properties };
        tabs.set(tab.id, tab); created.push(clone(tab)); return clone(tab);
      },
      async sendMessage(id, message) {
        if (!tabs.has(id)) throw new Error('Missing tab');
        if (options.needsInjection && !injected.includes(id)) throw new Error('No listener');
        sent.push({ id, ...clone(message) }); return { ok: true };
      },
    },
    alarms: {
      onAlarm: event(),
      async get(name) { return clone(alarms.get(name)); },
      async clear(name) { return alarms.delete(name); },
      async create(name, info) {
        // Model the store-build floor, which unpacked development omits.
        alarms.set(name, { name, scheduledTime: Math.max(now + 30000, info.when), requestedTime: info.when });
      },
    },
    commands: { onCommand: event() },
  };
  const context = vm.createContext({
    chrome, URL, structuredClone, console,
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, time: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context);
  function message(data, sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') }) {
    return new Promise(resolve => chrome.runtime.onMessage.fire(clone(data), sender, value => resolve(clone(value))));
  }
  const flush = () => message({ action: 'get-state' });
  return {
    chrome, local, session, tabs, alarms, timers, sent, created, activated, injected, message, flush,
    async start(extra = {}) {
      return message({ action: 'start', tabIds: [1, 2, 3], intervalSeconds: 30, windowId: 10, ...extra });
    },
    setNow(value) { now = value; },
    async elapse(milliseconds, { timeouts = true, alarm = true } = {}) {
      now += milliseconds;
      if (timeouts) for (const [id, timer] of [...timers]) if (timer.time <= now) { timers.delete(id); timer.fn(); }
      if (alarm) for (const [name, item] of [...alarms]) if (item.scheduledTime <= now) { alarms.delete(name); chrome.alarms.onAlarm.fire(item); }
      return flush();
    },
  };
}

test('first message waits for session hydration; worker restart preserves exact deadline and pause', async () => {
  const first = browser();
  await first.start({ intervalSeconds: 45 });
  await first.elapse(10000);
  const second = browser({ now: 110000, session: first.session });
  const restored = await second.flush();
  assert.equal(restored.isRotating, true);
  assert.equal(restored.deadline, 145000);
  assert.equal(restored.remainingMs, 35000);
  assert.equal(second.alarms.get('framedeck-next').requestedTime, 145000);
  await second.message({ action: 'pause' });
  const third = browser({ now: 200000, session: second.session });
  const paused = await third.flush();
  assert.equal(paused.isPaused, true);
  assert.equal(paused.remainingMs, 35000);
  assert.equal(third.alarms.size, 0);
});

test('pause/resume keeps remaining time; paused navigation gets new tab duration', async () => {
  const app = browser();
  await app.start({ intervalSeconds: 30, tabDurations: { 2: 50 }, countdownEnabled: true });
  await app.elapse(12000);
  let result = await app.message({ action: 'pause' });
  assert.equal(result.state.remainingMs, 18000);
  assert.equal(app.alarms.size, 0);
  await app.elapse(100000);
  result = await app.message({ action: 'resume' });
  assert.equal(result.state.remainingMs, 18000);
  assert.equal(result.state.deadline, 230000);
  assert.equal(app.sent.at(-1).deadline, 230000);
  await app.message({ action: 'pause' });
  result = await app.message({ action: 'go-next' });
  assert.equal(result.state.isPaused, true);
  assert.equal(result.state.remainingMs, 50000);
  assert.equal(result.state.deadline, null);
  assert.equal(app.alarms.size, 0);
});

test('short rotation works with the packaged 30-second alarm floor; stale timers cannot double advance', async () => {
  const app = browser();
  await app.start({ intervalSeconds: 5 });
  const timer = [...app.timers.values()][0];
  assert.equal(app.alarms.get('framedeck-next').scheduledTime, 130000);
  let current = await app.elapse(5000);
  assert.equal(current.currentIndex, 1);
  timer.fn();
  current = await app.flush();
  assert.equal(current.currentIndex, 1);
  await app.message({ action: 'stop' });
  timer.fn();
  current = await app.flush();
  assert.equal(current.isRotating, false);
  assert.equal(app.alarms.size, 0);
});

test('cold worker recovers overdue cycle once; browser restart never reuses stale disk tab IDs', async () => {
  const app = browser({ local: { framedeck: { isRotating: true, tabOrder: [1, 2] } } });
  assert.equal((await app.flush()).isRotating, false);
  assert.equal(app.local.framedeck, undefined);
  await app.start({ intervalSeconds: 5 });
  const restarted = browser({ now: 180000, session: app.session });
  const state = await restarted.flush();
  assert.equal(state.currentIndex, 1);
  assert.equal(state.deadline, 185000);
  assert.deepEqual(restarted.activated, [2]);
});

test('removing earlier/current tabs preserves order and advances; moving tabs out removes them', async () => {
  const app = browser();
  await app.start();
  await app.message({ action: 'go-next' });
  app.tabs.delete(1); app.chrome.tabs.onRemoved.fire(1);
  let state = await app.flush();
  assert.deepEqual(state.tabOrder, [2, 3]);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.deadline, 130000);
  app.tabs.delete(2); app.chrome.tabs.onRemoved.fire(2);
  state = await app.flush();
  assert.deepEqual(state.tabOrder, [3]);
  assert.equal(app.activated.at(-1), 3);
  app.tabs.get(3).windowId = 20; app.chrome.tabs.onDetached.fire(3);
  state = await app.flush();
  assert.equal(state.isRotating, false);
});

test('reload syncs overlay to original deadline; enabling overlay does not restart timer', async () => {
  const app = browser();
  await app.start();
  await app.elapse(9000);
  await app.message({ action: 'update-settings', countdownEnabled: true });
  assert.equal(app.sent.at(-1).remainingMs, 21000);
  assert.equal(app.sent.at(-1).deadline, 130000);
  app.chrome.tabs.onUpdated.fire(1, { status: 'complete' }, app.tabs.get(1));
  await app.flush();
  assert.equal(app.sent.at(-1).remainingMs, 21000);
  const ready = await app.message({ action: 'content-ready' }, { id: app.chrome.runtime.id, tab: { id: 1 }, frameId: 0 });
  assert.equal(ready.countdown.deadline, 130000);
});

test('mutations are serialized and replies reflect committed state', async () => {
  const app = browser();
  const start = app.start({ intervalSeconds: 5 });
  const stop = app.message({ action: 'stop' });
  assert.equal((await start).state.isRotating, true);
  assert.equal((await stop).state.isRotating, false);
  assert.equal(app.session.framedeck.isRotating, false);
  assert.equal(app.timers.size, 0);
  await app.start();
  const results = await Promise.all([app.message({ action: 'go-next' }), app.message({ action: 'go-next' })]);
  assert.equal(results[0].state.currentIndex, 1);
  assert.equal(results[1].state.currentIndex, 2);
});

test('invalid inputs and content-script privileged actions leave active rotation untouched', async () => {
  const app = browser();
  await app.start();
  for (const intervalSeconds of [0, 4, 601, 5.5, '30', NaN]) {
    assert.equal((await app.message({ action: 'update-interval', intervalSeconds })).ok, false);
  }
  assert.equal((await app.start({ tabIds: [1, 1] })).ok, false);
  assert.equal((await app.start({ tabIds: [1, 999] })).ok, false);
  assert.equal((await app.message({ action: 'stop' }, { id: app.chrome.runtime.id, tab: { id: 1 }, frameId: 0 })).ok, false);
  assert.equal((await app.flush()).isRotating, true);
  assert.equal((await app.flush()).intervalSeconds, 30);
});

test('saved decks preserve duplicate URLs, per-entry durations and order; load reuses distinct tabs', async () => {
  const app = browser();
  const profile = {
    name: 'Morning', defaultInterval: 30,
    tabs: [
      { url: 'https://two.example/', duration: 15 },
      { url: 'https://one.example/', duration: 25 },
      { url: 'https://one.example/', duration: 45 },
    ],
  };
  assert.equal((await app.message({ action: 'save-profile', profile })).ok, true);
  const loaded = await app.message({ action: 'load-profile', name: 'Morning', windowId: 10 });
  assert.deepEqual(loaded.tabIds, [2, 1, 100]);
  assert.deepEqual(loaded.tabDurations, { 1: 25, 2: 15, 100: 45 });
  assert.equal(app.created.length, 1);
  await app.message({ action: 'load-profile', name: 'Morning', windowId: 10 });
  assert.equal(app.created.length, 1);
  assert.equal((await app.flush()).isRotating, false);
  await app.start();
  assert.equal((await app.message({ action: 'load-profile', name: 'Morning', windowId: 10 })).ok, false);
});

test('legacy saved decks normalize without losing URL order or timing', async () => {
  const app = browser({ local: { framedeck_profiles: [{
    name: 'Legacy', urls: ['https://two.example/', 'https://one.example/'],
    defaultInterval: 30, tabDurations: { 'https://two.example/': 60 },
  }] } });
  const [profile] = await app.message({ action: 'get-profiles' });
  assert.deepEqual(profile.tabs, [{ url: 'https://two.example/', duration: 60 }, { url: 'https://one.example/' }]);
});

test('page access stays optional and injection is limited to the current selected tab', async () => {
  const denied = browser({ needsInjection: true, permission: false });
  assert.equal((await denied.start({ countdownEnabled: true })).ok, true);
  assert.deepEqual(denied.injected, []);
  assert.equal((await denied.elapse(30000)).currentIndex, 1);
  const allowed = browser({ needsInjection: true });
  await allowed.start({ countdownEnabled: true });
  assert.deepEqual(allowed.injected, [1]);
  await allowed.message({ action: 'go-next' });
  assert.deepEqual(allowed.injected, [1, 2]);
});

test('tab replacement preserves current duration and deadline', async () => {
  const app = browser();
  await app.start({ tabDurations: { 1: 50 }, countdownEnabled: true });
  app.tabs.set(4, { id: 4, windowId: 10, url: 'https://one.example/' });
  app.tabs.delete(1);
  app.chrome.tabs.onReplaced.fire(4, 1);
  const state = await app.flush();
  assert.deepEqual(state.tabOrder, [4, 2, 3]);
  assert.deepEqual(state.tabDurations, { 4: 50 });
  assert.equal(state.deadline, 150000);
  assert.equal(app.sent.at(-1).id, 4);
});

test('only the exact popup URL is trusted when opened as an extension tab', async () => {
  const app = browser();
  const sender = { id: app.chrome.runtime.id, tab: { id: 99 }, frameId: 0, url: app.chrome.runtime.getURL('popup.html') };
  assert.equal((await app.message({ action: 'get-state' }, sender)).isRotating, false);
  assert.equal((await app.message({ action: 'get-state' }, { ...sender, url: sender.url + '/spoof' })).ok, false);
  assert.equal((await app.message({ action: 'get-state' }, { ...sender, id: 'other-extension' })).ok, false);
});

test('editing a future tab or overridden default preserves the current clock', async () => {
  const app = browser();
  await app.start({ tabDurations: { 1: 45 } });
  await app.elapse(10000);
  let result = await app.message({ action: 'update-settings', tabDurations: { 1: 45, 2: 60 } });
  assert.equal(result.state.deadline, 145000);
  result = await app.message({ action: 'update-interval', intervalSeconds: 90 });
  assert.equal(result.state.deadline, 145000);
  result = await app.message({ action: 'update-settings', tabDurations: { 1: 50, 2: 60 } });
  assert.equal(result.state.deadline, 160000);
});

test('transient tab activation failure preserves the deck and pauses safely', async () => {
  const app = browser();
  await app.start();
  await app.elapse(10000);
  const update = app.chrome.tabs.update;
  app.chrome.tabs.update = async () => { throw new Error('Tabs cannot be edited right now.'); };
  const result = await app.message({ action: 'go-next' });
  assert.equal(result.ok, false);
  let state = await app.flush();
  assert.deepEqual(state.tabOrder, [1, 2, 3]);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.isPaused, true);
  assert.equal(state.remainingMs, 20000);
  assert.equal(app.alarms.size, 0);
  app.chrome.tabs.update = update;
  state = (await app.message({ action: 'resume' })).state;
  assert.equal(state.remainingMs, 20000);
  assert.equal(state.isPaused, false);
});

test('failed session write rolls back timing change and pauses the preserved deck', async () => {
  const app = browser();
  await app.start();
  const save = app.chrome.storage.session.set;
  let fail = true;
  app.chrome.storage.session.set = async data => {
    if (fail) { fail = false; throw new Error('Storage write failed.'); }
    return save(data);
  };
  assert.equal((await app.message({ action: 'update-interval', intervalSeconds: 60 })).ok, false);
  const state = await app.flush();
  assert.equal(state.intervalSeconds, 30);
  assert.equal(state.isPaused, true);
  assert.equal(app.session.framedeck.intervalSeconds, 30);
  assert.equal(app.session.framedeck.isPaused, true);
});

test('invalid legacy decks do not block the popup and remain stored when another deck changes', async () => {
  const legacy = { name: 'Local', urls: ['file:///one.pdf', 'file:///two.pdf'] };
  const app = browser({ local: { framedeck_profiles: [legacy, { name: 'Single', urls: ['https://one.example/'] }] } });
  const profiles = await app.message({ action: 'get-profiles' });
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, 'Single');
  await app.message({ action: 'save-profile', profile: { name: 'New', tabs: [{ url: 'https://one.example/' }, { url: 'https://two.example/' }] } });
  assert.deepEqual(app.local.framedeck_profiles[0], legacy);
});

test('cold-worker tab removal activates the next surviving selected tab immediately', async () => {
  const first = browser();
  await first.start();
  const restarted = browser({
    now: 110000, session: first.session,
    tabs: [...first.tabs.values()].filter(tab => tab.id !== 1),
  });
  const state = await restarted.flush();
  assert.deepEqual(state.tabOrder, [2, 3]);
  assert.equal(state.currentIndex, 0);
  assert.equal(state.deadline, 140000);
  assert.deepEqual(restarted.activated, [2]);
});
