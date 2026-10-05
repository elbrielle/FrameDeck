// Chrome can suspend this worker at any time. Session storage and an absolute
// deadline survive that; local storage is reserved for saved decks/preferences.
const ALARM = 'framedeck-next';
const DEFAULT_STATE = {
  isRotating: false, isPaused: false, tabOrder: [], currentIndex: 0,
  intervalSeconds: 30, tabDurations: {}, windowId: null,
  transitionsEnabled: false, countdownEnabled: false,
  deadline: null, remainingMs: 0, cycleDurationMs: 0,
};
let state = structuredClone(DEFAULT_STATE);
let shortTimer;
let queue = Promise.resolve();

// A window-wide side panel stays available when rotation activates another tab.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

function enqueue(task) {
  const result = queue.then(() => ready).then(() => runTask(task));
  queue = result.catch(() => {});
  return result;
}

async function runTask(task) {
  const previous = structuredClone(state);
  try { return await task(); }
  catch (error) {
    if (JSON.stringify(state) !== JSON.stringify(previous)) {
      state = previous;
      // An operation can fail after clearing its clock (for example while a
      // tab is being dragged). Preserve the deck and pause instead of leaving
      // a running badge with no timer, or retrying a failed switch in a loop.
      if (state.isRotating) {
        state.remainingMs = remainingMs();
        state.isPaused = true;
        state.deadline = null;
      }
      try { await clearTimer(); await saveState(); await syncCountdown(); }
      catch (recoveryError) { console.error(recoveryError); }
    }
    throw error;
  }
}

function seconds(value) {
  if (!Number.isInteger(value) || value < 5 || value > 600) {
    throw new Error('Choose a whole number of seconds from 5 to 600.');
  }
  return value;
}

function pageURL(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Decks can include http and https websites.');
  }
  return url.href;
}

function isWebTab(tab) {
  try { return Boolean(pageURL(tab.pendingUrl || tab.url)); }
  catch { return false; }
}

function durations(input, ids) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid tab durations.');
  }
  return Object.fromEntries(ids.filter(id => input[id] !== undefined)
    .map(id => [id, seconds(input[id])]));
}

function currentTab() { return state.tabOrder[state.currentIndex]; }
function durationMs() { return (state.tabDurations[currentTab()] || state.intervalSeconds) * 1000; }
function remainingMs() {
  return state.isRotating && !state.isPaused
    ? Math.max(0, state.deadline - Date.now()) : state.remainingMs;
}
function snapshot() { return { ...structuredClone(state), remainingMs: remainingMs() }; }

async function saveState() {
  await chrome.storage.session.set({ framedeck: snapshot() });
  await chrome.action.setBadgeText({ text: state.isRotating ? (state.isPaused ? 'Ⅱ' : '▶') : '' });
  if (state.isRotating) {
    await chrome.action.setBadgeBackgroundColor({ color: state.isPaused ? '#795900' : '#006b50' });
  }
}

async function sendToTab(tabId, message, inject = false) {
  if (!Number.isInteger(tabId)) return null;
  try { return await chrome.tabs.sendMessage(tabId, message); }
  catch {
    if (!inject) return null;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!isWebTab(tab)) return null;
      const origin = new URL(tab.url || tab.pendingUrl).origin + '/*';
      if (!(await chrome.permissions.contains({ origins: [origin] }))) return null;
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch { return null; } // Protected sites do not support page effects.
  }
}

function countdown() {
  if (!state.isRotating || !state.countdownEnabled) return null;
  return {
    target: 'content', action: 'start-countdown', duration: state.cycleDurationMs / 1000,
    deadline: state.deadline, paused: state.isPaused, remainingMs: remainingMs(),
  };
}

async function syncCountdown() {
  await sendToTab(currentTab(), countdown() || { target: 'content', action: 'stop-countdown' },
    state.countdownEnabled);
}

async function clearTimer() {
  clearTimeout(shortTimer);
  shortTimer = undefined;
  await chrome.alarms.clear(ALARM);
}

async function scheduleTimer() {
  clearTimeout(shortTimer);
  shortTimer = undefined;
  if (!state.isRotating || state.isPaused) {
    await chrome.alarms.clear(ALARM);
    return;
  }
  const deadline = state.deadline;
  const remaining = Math.max(0, deadline - Date.now());
  // Alarms have a 30-second floor in store builds. A normal short timeout
  // serves 5–29s rotations; the alarm recovers unexpected worker termination.
  // No artificial heartbeat or offscreen-document keepalive is used.
  const alarm = await chrome.alarms.get(ALARM);
  if (!alarm || alarm.scheduledTime !== deadline) {
    await chrome.alarms.create(ALARM, { when: deadline });
  }
  if (remaining < 30000) {
    shortTimer = setTimeout(() => {
      enqueue(() => advanceIfDue(deadline)).catch(console.error);
    }, Math.max(0, deadline - Date.now()));
  }
}

function resetCycle() {
  state.cycleDurationMs = durationMs();
  state.remainingMs = state.cycleDurationMs;
  state.deadline = state.isPaused ? null : Date.now() + state.remainingMs;
}

async function stopRotation() {
  const ids = [...state.tabOrder];
  Object.assign(state, {
    isRotating: false, isPaused: false, tabOrder: [], currentIndex: 0,
    tabDurations: {}, windowId: null, deadline: null, remainingMs: 0, cycleDurationMs: 0,
  });
  await clearTimer();
  await saveState();
  await Promise.all(ids.map(id => sendToTab(id, { target: 'content', action: 'stop-countdown' })));
}

async function activateCurrent() {
  // A tab may disappear between a query and activation. Remove it and continue
  // at the same index so the following selected tab is not skipped.
  while (state.tabOrder.length) {
    const id = currentTab();
    const tab = await chrome.tabs.get(id).catch(() => null);
    if (tab && tab.windowId === state.windowId && isWebTab(tab)) {
      await chrome.tabs.update(id, { active: true });
      return true;
    }
    state.tabOrder.splice(state.currentIndex, 1);
    delete state.tabDurations[id];
    state.currentIndex %= state.tabOrder.length || 1;
  }
  await stopRotation();
  return false;
}

async function beginCurrent(withFade = false) {
  if (!(await activateCurrent())) return;
  resetCycle();
  await saveState();
  await scheduleTimer();
  if (withFade && state.transitionsEnabled) {
    await sendToTab(currentTab(), { target: 'content', action: 'fade-in' }, true);
  }
  await syncCountdown();
}

async function startRotation(message) {
  if (!Array.isArray(message.tabIds) || message.tabIds.length < 2 ||
      !message.tabIds.every(Number.isInteger) || new Set(message.tabIds).size !== message.tabIds.length ||
      !Number.isInteger(message.windowId)) {
    throw new Error('Select at least two different tabs in this window.');
  }
  const intervalSeconds = seconds(message.intervalSeconds);
  const tabDurations = durations(message.tabDurations || {}, message.tabIds);
  const available = new Map((await chrome.tabs.query({ windowId: message.windowId }))
    .filter(isWebTab).map(tab => [tab.id, tab]));
  if (!message.tabIds.every(id => available.has(id))) {
    throw new Error('A selected tab was closed or moved. Refresh the tab list and try again.');
  }
  await stopRotation();
  Object.assign(state, {
    isRotating: true, isPaused: false, tabOrder: [...message.tabIds], currentIndex: 0,
    intervalSeconds, tabDurations, windowId: message.windowId,
    transitionsEnabled: message.transitionsEnabled === true,
    countdownEnabled: message.countdownEnabled === true,
  });
  await beginCurrent();
}

async function step(direction) {
  if (!state.isRotating || !state.tabOrder.length) return;
  state.remainingMs = remainingMs();
  state.deadline = null;
  await clearTimer();
  const oldTab = currentTab();
  await sendToTab(oldTab, { target: 'content', action: 'stop-countdown' });
  if (state.transitionsEnabled) {
    await sendToTab(oldTab, { target: 'content', action: 'fade-out' }, true);
  }
  state.currentIndex = (state.currentIndex + direction + state.tabOrder.length) % state.tabOrder.length;
  await beginCurrent(true);
}

async function advanceIfDue(expectedDeadline) {
  if (!state.isRotating || state.isPaused || state.deadline !== expectedDeadline || Date.now() < state.deadline) return;
  await step(1);
}

async function pauseRotation() {
  if (!state.isRotating || state.isPaused) return;
  state.remainingMs = remainingMs();
  state.isPaused = true;
  state.deadline = null;
  await clearTimer();
  await saveState();
  await syncCountdown();
}

async function resumeRotation() {
  if (!state.isRotating || !state.isPaused) return;
  state.isPaused = false;
  state.deadline = Date.now() + state.remainingMs;
  await saveState();
  await scheduleTimer();
  await syncCountdown();
}

async function removeTab(tabId) {
  const index = state.tabOrder.indexOf(tabId);
  if (index < 0) return;
  const wasCurrent = index === state.currentIndex;
  state.tabOrder.splice(index, 1);
  delete state.tabDurations[tabId];
  await sendToTab(tabId, { target: 'content', action: 'stop-countdown' });
  if (!state.tabOrder.length) return stopRotation();
  if (index < state.currentIndex) state.currentIndex--;
  state.currentIndex %= state.tabOrder.length;
  if (wasCurrent) await beginCurrent();
  else await saveState();
}

function normalizeProfile(profile) {
  if (!profile || typeof profile.name !== 'string' || !profile.name.trim() || profile.name.trim().length > 100) {
    throw new Error('Use 1 to 100 characters for the deck name.');
  }
  const entries = profile.tabs || profile.urls?.map(url => ({ url, duration: profile.tabDurations?.[url] }));
  if (!Array.isArray(entries) || !entries.length) throw new Error('A saved deck needs website tabs.');
  return {
    name: profile.name.trim(), defaultInterval: seconds(profile.defaultInterval ?? 30),
    transitionsEnabled: profile.transitionsEnabled === true,
    countdownEnabled: profile.countdownEnabled === true,
    tabs: entries.map(entry => ({
      url: pageURL(entry.url),
      ...(entry.duration === undefined ? {} : { duration: seconds(entry.duration) }),
    })),
  };
}

async function storedProfiles() {
  const { framedeck_profiles: profiles = [] } = await chrome.storage.local.get('framedeck_profiles');
  return Array.isArray(profiles) ? profiles : [];
}

async function getProfiles() {
  return (await storedProfiles()).flatMap(profile => {
    try { return [normalizeProfile(profile)]; }
    catch { return []; } // An invalid legacy deck must not prevent opening the popup.
  });
}

async function loadProfile(name, windowId) {
  if (state.isRotating) throw new Error('Stop the current rotation before loading a saved deck.');
  if (!Number.isInteger(windowId)) throw new Error('Choose a browser window.');
  const profile = (await getProfiles()).find(item => item.name === name);
  if (!profile) throw new Error('This saved deck no longer exists.');
  const available = (await chrome.tabs.query({ windowId })).filter(isWebTab);
  const tabIds = [];
  const tabDurations = {};
  for (const entry of profile.tabs) {
    const index = available.findIndex(tab => pageURL(tab.pendingUrl || tab.url) === entry.url);
    const tab = index < 0 ? await chrome.tabs.create({ windowId, url: entry.url, active: false })
      : available.splice(index, 1)[0];
    tabIds.push(tab.id);
    if (entry.duration !== undefined) tabDurations[tab.id] = entry.duration;
  }
  return { ok: true, profile, tabIds, tabDurations };
}

async function handleMessage(message, sender) {
  if (message.action === 'content-ready') {
    return { countdown: sender.tab?.id === currentTab() ? countdown() : null };
  }
  switch (message.action) {
    case 'get-state': return snapshot();
    case 'get-profiles': return getProfiles();
    case 'start': await startRotation(message); break;
    case 'stop': await stopRotation(); break;
    case 'pause': await pauseRotation(); break;
    case 'resume': await resumeRotation(); break;
    case 'go-next': await step(1); break;
    case 'go-prev': await step(-1); break;
    case 'update-interval': {
      const oldDuration = durationMs();
      state.intervalSeconds = seconds(message.intervalSeconds);
      if (state.isRotating && durationMs() !== oldDuration) {
        resetCycle();
      }
      await saveState();
      await scheduleTimer();
      await syncCountdown();
      break;
    }
    case 'update-settings': {
      const oldDuration = durationMs();
      const nextDurations = message.tabDurations === undefined ? null : durations(message.tabDurations, state.tabOrder);
      for (const key of ['transitionsEnabled', 'countdownEnabled']) {
        if (message[key] !== undefined && typeof message[key] !== 'boolean') throw new Error('Invalid display setting.');
      }
      if (message.transitionsEnabled !== undefined) state.transitionsEnabled = message.transitionsEnabled;
      if (message.countdownEnabled !== undefined) state.countdownEnabled = message.countdownEnabled;
      if (nextDurations) state.tabDurations = nextDurations;
      if (state.isRotating && durationMs() !== oldDuration) resetCycle();
      await saveState();
      await scheduleTimer();
      await syncCountdown();
      break;
    }
    case 'save-profile': {
      const profile = normalizeProfile(message.profile);
      if (profile.tabs.length < 2) throw new Error('A saved deck needs at least two tabs.');
      const profiles = (await storedProfiles()).filter(item => item?.name !== profile.name);
      await chrome.storage.local.set({ framedeck_profiles: [...profiles, profile] });
      break;
    }
    case 'delete-profile': {
      const profiles = await storedProfiles();
      await chrome.storage.local.set({ framedeck_profiles: profiles.filter(item => item?.name !== message.name) });
      break;
    }
    case 'load-profile': return loadProfile(message.name, message.windowId);
    default: throw new Error('Unknown FrameDeck action.');
  }
  return { ok: true, state: snapshot() };
}

// Listeners must be installed synchronously, before session hydration finishes.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || message.target === 'content' || message.target === 'offscreen') return;
  const contentReady = message.action === 'content-ready' && sender.tab && sender.frameId === 0;
  const extensionPage = sender.url === chrome.runtime.getURL('popup.html');
  if (sender.id !== chrome.runtime.id || (!contentReady && !extensionPage)) {
    respond({ ok: false, error: 'This action is only available in FrameDeck.' });
    return;
  }
  enqueue(() => handleMessage(message, sender)).then(respond,
    error => respond({ ok: false, error: error.message }));
  return true;
});
// Register these events so Chrome wakes the worker to clear the badge and any
// previous-session alarm even before the user opens the popup.
chrome.runtime.onStartup.addListener(() => { enqueue(() => {}).catch(console.error); });
chrome.runtime.onInstalled.addListener(() => { enqueue(() => {}).catch(console.error); });

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM) enqueue(() => advanceIfDue(state.deadline)).catch(console.error);
});
chrome.tabs.onRemoved.addListener(id => { enqueue(() => removeTab(id)).catch(console.error); });
chrome.tabs.onDetached.addListener(id => { enqueue(() => removeTab(id)).catch(console.error); });
chrome.tabs.onReplaced.addListener((added, removed) => {
  enqueue(async () => {
    const index = state.tabOrder.indexOf(removed);
    if (index < 0) return;
    state.tabOrder[index] = added;
    if (state.tabDurations[removed]) state.tabDurations[added] = state.tabDurations[removed];
    delete state.tabDurations[removed];
    await saveState();
    if (index === state.currentIndex) await syncCountdown();
  }).catch(console.error);
});
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.status !== 'complete' && !change.url) return;
  enqueue(async () => {
    if (!state.tabOrder.includes(id)) return;
    if (!isWebTab(tab)) return removeTab(id);
    if (id === currentTab() && change.status === 'complete') await syncCountdown();
  }).catch(console.error);
});
chrome.commands.onCommand.addListener(command => {
  enqueue(async () => {
    if (command === 'toggle-rotation') await (state.isPaused ? resumeRotation() : pauseRotation());
    if (command === 'next-tab') await step(1);
    if (command === 'prev-tab') await step(-1);
  }).catch(console.error);
});
chrome.permissions.onRemoved.addListener(() => {
  enqueue(async () => {
    if (await chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })) return;
    state.countdownEnabled = false;
    state.transitionsEnabled = false;
    await Promise.all(state.tabOrder.map(id => sendToTab(id, { target: 'content', action: 'stop-countdown' })));
    await saveState();
  }).catch(console.error);
});

async function initialize() {
  let currentChanged = false;
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const { framedeck: saved } = await chrome.storage.session.get('framedeck');
  // Older builds stored ephemeral Chrome tab IDs on disk. Never revive those
  // IDs after a browser restart: they can refer to entirely different pages.
  await chrome.storage.local.remove('framedeck');
  if (saved?.isRotating && Array.isArray(saved.tabOrder)) {
    try {
      const available = new Set((await chrome.tabs.query({ windowId: saved.windowId })).filter(isWebTab).map(tab => tab.id));
      const ids = [...new Set(saved.tabOrder)].filter(id => available.has(id));
      if (ids.length) {
        const oldCurrent = saved.tabOrder[saved.currentIndex];
        const nextCurrent = saved.tabOrder.slice(saved.currentIndex).find(id => available.has(id)) ?? ids[0];
        state = {
          ...DEFAULT_STATE, ...saved, tabOrder: ids,
          currentIndex: ids.indexOf(nextCurrent),
          intervalSeconds: seconds(saved.intervalSeconds), tabDurations: durations(saved.tabDurations || {}, ids),
        };
        currentChanged = oldCurrent !== currentTab();
        if (currentChanged || !Number.isFinite(state.cycleDurationMs) ||
            (!state.isPaused && !Number.isFinite(state.deadline))) resetCycle();
        if (!Number.isFinite(state.remainingMs) || state.remainingMs < 0) state.remainingMs = durationMs();
      }
    } catch { state = structuredClone(DEFAULT_STATE); }
  }
  await saveState();
  if (currentChanged) await runTask(async () => { state.deadline = null; await beginCurrent(); }).catch(console.error);
  else if (state.isRotating && !state.isPaused && state.deadline <= Date.now()) await runTask(() => step(1)).catch(console.error);
  else await scheduleTimer();
}
const ready = initialize();
ready.catch(console.error);
