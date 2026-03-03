// ============================================================
// FrameDeck — Background Service Worker
// Handles tab rotation, offscreen timer, transitions, profiles
// ============================================================

let state = {
  isRotating: false,
  isPaused: false,
  tabOrder: [],
  currentIndex: 0,
  intervalSeconds: 30,
  tabDurations: {},
  windowId: null,
  transitionsEnabled: true,
  countdownEnabled: true,
};

let transitioning = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function sendToTab(tabId, msg) {
  try { return await chrome.tabs.sendMessage(tabId, msg); }
  catch { return null; }
}

// ===== Offscreen Document =====

async function ensureOffscreen() {
  if (!(await chrome.offscreen.hasDocument().catch(() => false))) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Reliable timer for tab rotation',
    });
  }
}

async function closeOffscreen() {
  if (await chrome.offscreen.hasDocument().catch(() => false)) {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

function startTimer(ms) {
  chrome.runtime.sendMessage({
    target: 'offscreen', action: 'start-timer', intervalMs: ms,
  }).catch(() => {});
}

function stopTimer() {
  chrome.runtime.sendMessage({
    target: 'offscreen', action: 'stop-timer',
  }).catch(() => {});
}

// ===== Duration Helper =====

function getDuration(tabId) {
  return state.tabDurations[tabId] || state.intervalSeconds;
}

// ===== Rotation Control =====

async function startRotation(tabIds, intervalSeconds, windowId, tabDurations, transitionsEnabled, countdownEnabled) {
  Object.assign(state, {
    tabOrder: tabIds,
    intervalSeconds,
    currentIndex: 0,
    isRotating: true,
    isPaused: false,
    windowId,
    tabDurations: tabDurations || {},
    transitionsEnabled: transitionsEnabled !== false,
    countdownEnabled: countdownEnabled !== false,
  });

  await saveState();
  await ensureOffscreen();

  const firstTab = tabIds[0];
  const dur = getDuration(firstTab);
  startTimer(dur * 1000);
  updateBadge();

  if (tabIds.length > 0) {
    await switchToTab(firstTab);
    await sleep(100);
    if (state.countdownEnabled) {
      await sendToTab(firstTab, { target: 'content', action: 'start-countdown', duration: dur });
    }
  }
}

async function stopRotation() {
  for (const tid of state.tabOrder) {
    await sendToTab(tid, { target: 'content', action: 'stop-countdown' });
  }

  Object.assign(state, {
    isRotating: false,
    isPaused: false,
    tabOrder: [],
    currentIndex: 0,
  });

  stopTimer();
  await closeOffscreen();
  await saveState();
  updateBadge();
}

async function pauseRotation() {
  state.isPaused = true;
  stopTimer();

  const curTab = state.tabOrder[state.currentIndex];
  if (curTab && state.countdownEnabled) {
    await sendToTab(curTab, { target: 'content', action: 'pause-countdown' });
  }

  await saveState();
  updateBadge();
}

async function resumeRotation() {
  state.isPaused = false;
  await ensureOffscreen();

  const curTab = state.tabOrder[state.currentIndex];
  if (curTab && state.countdownEnabled) {
    await sendToTab(curTab, { target: 'content', action: 'resume-countdown' });
  }

  const dur = getDuration(curTab);
  startTimer(dur * 1000);
  await saveState();
  updateBadge();
}

async function toggleRotation() {
  if (!state.isRotating) return;
  state.isPaused ? await resumeRotation() : await pauseRotation();
}

// ===== Tab Switching =====

async function advanceTab() {
  if (!state.isRotating || state.isPaused || transitioning) return;
  if (state.tabOrder.length === 0) return stopRotation();

  transitioning = true;
  stopTimer();

  const oldTab = state.tabOrder[state.currentIndex];

  if (state.transitionsEnabled) {
    await sendToTab(oldTab, { target: 'content', action: 'stop-countdown' });
    await sendToTab(oldTab, { target: 'content', action: 'fade-out' });
  }

  state.currentIndex = (state.currentIndex + 1) % state.tabOrder.length;
  const newTab = state.tabOrder[state.currentIndex];

  await switchToTab(newTab);
  await sleep(80);

  if (state.transitionsEnabled) {
    await sendToTab(newTab, { target: 'content', action: 'fade-in' });
  }

  const dur = getDuration(newTab);
  if (state.countdownEnabled) {
    await sendToTab(newTab, { target: 'content', action: 'start-countdown', duration: dur });
  }

  startTimer(dur * 1000);
  transitioning = false;
  await saveState();
}

async function goNext() {
  if (!state.isRotating || state.tabOrder.length === 0) return;

  const oldTab = state.tabOrder[state.currentIndex];
  await sendToTab(oldTab, { target: 'content', action: 'stop-countdown' });

  if (state.transitionsEnabled) {
    await sendToTab(oldTab, { target: 'content', action: 'fade-out' });
  }

  state.currentIndex = (state.currentIndex + 1) % state.tabOrder.length;
  const newTab = state.tabOrder[state.currentIndex];

  await switchToTab(newTab);
  await sleep(50);

  if (state.transitionsEnabled) {
    await sendToTab(newTab, { target: 'content', action: 'fade-in' });
  }

  const dur = getDuration(newTab);
  if (!state.isPaused) {
    stopTimer();
    startTimer(dur * 1000);
  }
  if (state.countdownEnabled && !state.isPaused) {
    await sendToTab(newTab, { target: 'content', action: 'start-countdown', duration: dur });
  }

  await saveState();
}

async function goPrev() {
  if (!state.isRotating || state.tabOrder.length === 0) return;

  const oldTab = state.tabOrder[state.currentIndex];
  await sendToTab(oldTab, { target: 'content', action: 'stop-countdown' });

  if (state.transitionsEnabled) {
    await sendToTab(oldTab, { target: 'content', action: 'fade-out' });
  }

  state.currentIndex = (state.currentIndex - 1 + state.tabOrder.length) % state.tabOrder.length;
  const newTab = state.tabOrder[state.currentIndex];

  await switchToTab(newTab);
  await sleep(50);

  if (state.transitionsEnabled) {
    await sendToTab(newTab, { target: 'content', action: 'fade-in' });
  }

  const dur = getDuration(newTab);
  if (!state.isPaused) {
    stopTimer();
    startTimer(dur * 1000);
  }
  if (state.countdownEnabled && !state.isPaused) {
    await sendToTab(newTab, { target: 'content', action: 'start-countdown', duration: dur });
  }

  await saveState();
}

async function switchToTab(tabId) {
  try { await chrome.tabs.update(tabId, { active: true }); }
  catch { removeTabFromRotation(tabId); }
}

function removeTabFromRotation(tabId) {
  const idx = state.tabOrder.indexOf(tabId);
  if (idx === -1) return;
  state.tabOrder.splice(idx, 1);
  delete state.tabDurations[tabId];
  if (state.tabOrder.length === 0) return stopRotation();
  if (state.currentIndex >= state.tabOrder.length) state.currentIndex = 0;
  else if (idx < state.currentIndex) state.currentIndex--;
  saveState();
}

// ===== Persistence =====

async function saveState() {
  await chrome.storage.local.set({ framedeck: { ...state } });
}

async function loadState() {
  const d = await chrome.storage.local.get('framedeck');
  if (d.framedeck) Object.assign(state, d.framedeck);
}

// ===== Profiles =====

async function getProfiles() {
  const d = await chrome.storage.local.get('framedeck_profiles');
  return d.framedeck_profiles || [];
}

async function saveProfile(profile) {
  const profiles = await getProfiles();
  const filtered = profiles.filter(p => p.name !== profile.name);
  filtered.push(profile);
  await chrome.storage.local.set({ framedeck_profiles: filtered });
}

async function deleteProfile(name) {
  const profiles = await getProfiles();
  await chrome.storage.local.set({
    framedeck_profiles: profiles.filter(p => p.name !== name),
  });
}

// ===== Badge =====

function updateBadge() {
  if (state.isRotating && !state.isPaused) {
    chrome.action.setBadgeText({ text: '\u25B6' });
    chrome.action.setBadgeBackgroundColor({ color: '#4f6ef7' });
  } else if (state.isRotating && state.isPaused) {
    chrome.action.setBadgeText({ text: '\u23F8' });
    chrome.action.setBadgeBackgroundColor({ color: '#eab308' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ===== Message Handling =====

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg.action === 'tick') { advanceTab(); return; }

  switch (msg.action) {
    case 'start':
      startRotation(msg.tabIds, msg.intervalSeconds, msg.windowId,
        msg.tabDurations, msg.transitionsEnabled, msg.countdownEnabled);
      respond({ ok: true });
      break;
    case 'stop': stopRotation(); respond({ ok: true }); break;
    case 'pause': pauseRotation(); respond({ ok: true }); break;
    case 'resume': resumeRotation(); respond({ ok: true }); break;
    case 'get-state': respond({ ...state }); break;
    case 'go-next': goNext(); respond({ ok: true }); break;
    case 'go-prev': goPrev(); respond({ ok: true }); break;
    case 'update-interval':
      state.intervalSeconds = msg.intervalSeconds;
      if (state.isRotating && !state.isPaused) {
        const dur = getDuration(state.tabOrder[state.currentIndex]);
        stopTimer();
        startTimer(dur * 1000);
      }
      saveState();
      respond({ ok: true });
      break;
    case 'update-settings':
      if (msg.transitionsEnabled !== undefined) state.transitionsEnabled = msg.transitionsEnabled;
      if (msg.countdownEnabled !== undefined) state.countdownEnabled = msg.countdownEnabled;
      if (msg.tabDurations !== undefined) state.tabDurations = msg.tabDurations;
      if (msg.countdownEnabled === false && state.isRotating) {
        const cur = state.tabOrder[state.currentIndex];
        if (cur) sendToTab(cur, { target: 'content', action: 'stop-countdown' });
      }
      if (msg.countdownEnabled === true && state.isRotating && !state.isPaused) {
        const cur = state.tabOrder[state.currentIndex];
        const dur = getDuration(cur);
        if (cur) sendToTab(cur, { target: 'content', action: 'start-countdown', duration: dur });
      }
      saveState();
      respond({ ok: true });
      break;
    case 'save-profile':
      saveProfile(msg.profile).then(() => respond({ ok: true }));
      return true;
    case 'get-profiles':
      getProfiles().then(p => respond(p));
      return true;
    case 'delete-profile':
      deleteProfile(msg.name).then(() => respond({ ok: true }));
      return true;
  }
});

// ===== Tab Events =====

chrome.tabs.onRemoved.addListener(tabId => {
  if (state.isRotating) {
    removeTabFromRotation(tabId);
    updateBadge();
  }
});

// ===== Keyboard Commands =====

chrome.commands.onCommand.addListener(cmd => {
  switch (cmd) {
    case 'toggle-rotation': toggleRotation(); break;
    case 'next-tab': goNext(); break;
    case 'prev-tab': goPrev(); break;
  }
});

// ===== Startup =====

chrome.runtime.onStartup.addListener(async () => {
  await loadState();
  if (state.isRotating && !state.isPaused) {
    await ensureOffscreen();
    const dur = getDuration(state.tabOrder[state.currentIndex]);
    startTimer(dur * 1000);
  }
  updateBadge();
});

chrome.runtime.onInstalled.addListener(async () => {
  await loadState();
  updateBadge();
});
