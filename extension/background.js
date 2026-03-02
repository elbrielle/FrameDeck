// ============================================================
// FrameDeck — Background Service Worker
// Handles tab rotation, offscreen timer, and keyboard commands
// ============================================================

let rotationState = {
  isRotating: false,
  isPaused: false,
  tabOrder: [],       // array of tab IDs in rotation
  currentIndex: 0,
  intervalSeconds: 30,
  windowId: null,
};

// ========== OFFSCREEN DOCUMENT ==========

async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument().catch(() => false);
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: 'Reliable timer for tab rotation (service workers get killed)',
    });
  }
}

async function closeOffscreen() {
  const exists = await chrome.offscreen.hasDocument().catch(() => false);
  if (exists) {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

// ========== ROTATION CONTROL ==========

async function startRotation(tabIds, intervalSeconds, windowId) {
  rotationState.tabOrder = tabIds;
  rotationState.intervalSeconds = intervalSeconds;
  rotationState.currentIndex = 0;
  rotationState.isRotating = true;
  rotationState.isPaused = false;
  rotationState.windowId = windowId;

  await saveState();
  await ensureOffscreen();

  // Tell offscreen to start ticking
  chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'start-timer',
    intervalMs: intervalSeconds * 1000,
  });

  // Update badge
  updateBadge();

  // Switch to first tab
  if (tabIds.length > 0) {
    await switchToTab(tabIds[0]);
  }
}

async function stopRotation() {
  rotationState.isRotating = false;
  rotationState.isPaused = false;
  rotationState.tabOrder = [];
  rotationState.currentIndex = 0;

  // Tell offscreen to stop
  chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stop-timer',
  }).catch(() => {});

  await closeOffscreen();
  await saveState();
  updateBadge();
}

async function pauseRotation() {
  rotationState.isPaused = true;
  chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'stop-timer',
  }).catch(() => {});
  await saveState();
  updateBadge();
}

async function resumeRotation() {
  rotationState.isPaused = false;
  await ensureOffscreen();
  chrome.runtime.sendMessage({
    target: 'offscreen',
    action: 'start-timer',
    intervalMs: rotationState.intervalSeconds * 1000,
  });
  await saveState();
  updateBadge();
}

async function toggleRotation() {
  if (!rotationState.isRotating) return;
  if (rotationState.isPaused) {
    await resumeRotation();
  } else {
    await pauseRotation();
  }
}

// ========== TAB SWITCHING ==========

async function advanceTab() {
  if (!rotationState.isRotating || rotationState.isPaused) return;
  if (rotationState.tabOrder.length === 0) {
    await stopRotation();
    return;
  }

  // Move to next
  rotationState.currentIndex = (rotationState.currentIndex + 1) % rotationState.tabOrder.length;
  const tabId = rotationState.tabOrder[rotationState.currentIndex];
  await switchToTab(tabId);
  await saveState();
}

async function goNext() {
  if (!rotationState.isRotating || rotationState.tabOrder.length === 0) return;
  rotationState.currentIndex = (rotationState.currentIndex + 1) % rotationState.tabOrder.length;
  const tabId = rotationState.tabOrder[rotationState.currentIndex];
  await switchToTab(tabId);
  await saveState();
}

async function goPrev() {
  if (!rotationState.isRotating || rotationState.tabOrder.length === 0) return;
  rotationState.currentIndex = (rotationState.currentIndex - 1 + rotationState.tabOrder.length) % rotationState.tabOrder.length;
  const tabId = rotationState.tabOrder[rotationState.currentIndex];
  await switchToTab(tabId);
  await saveState();
}

async function switchToTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (e) {
    // Tab was closed — remove it from rotation
    removeTabFromRotation(tabId);
  }
}

function removeTabFromRotation(tabId) {
  const idx = rotationState.tabOrder.indexOf(tabId);
  if (idx === -1) return;

  rotationState.tabOrder.splice(idx, 1);

  if (rotationState.tabOrder.length === 0) {
    stopRotation();
    return;
  }

  // Adjust currentIndex
  if (rotationState.currentIndex >= rotationState.tabOrder.length) {
    rotationState.currentIndex = 0;
  } else if (idx < rotationState.currentIndex) {
    rotationState.currentIndex--;
  }
  saveState();
}

// ========== PERSISTENCE ==========

async function saveState() {
  await chrome.storage.local.set({
    framedeck: {
      isRotating: rotationState.isRotating,
      isPaused: rotationState.isPaused,
      tabOrder: rotationState.tabOrder,
      currentIndex: rotationState.currentIndex,
      intervalSeconds: rotationState.intervalSeconds,
      windowId: rotationState.windowId,
    }
  });
}

async function loadState() {
  const data = await chrome.storage.local.get('framedeck');
  if (data.framedeck) {
    Object.assign(rotationState, data.framedeck);
  }
}

// ========== BADGE ==========

function updateBadge() {
  if (rotationState.isRotating && !rotationState.isPaused) {
    chrome.action.setBadgeText({ text: '▶' });
    chrome.action.setBadgeBackgroundColor({ color: '#4f6ef7' });
  } else if (rotationState.isRotating && rotationState.isPaused) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#eab308' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ========== MESSAGE HANDLING ==========

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Messages from offscreen timer
  if (msg.action === 'tick') {
    advanceTab();
    return;
  }

  // Messages from popup
  if (msg.action === 'start') {
    startRotation(msg.tabIds, msg.intervalSeconds, msg.windowId);
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'stop') {
    stopRotation();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'pause') {
    pauseRotation();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'resume') {
    resumeRotation();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'get-state') {
    sendResponse({ ...rotationState });
    return;
  }

  if (msg.action === 'go-next') {
    goNext();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'go-prev') {
    goPrev();
    sendResponse({ ok: true });
    return;
  }

  if (msg.action === 'update-interval') {
    rotationState.intervalSeconds = msg.intervalSeconds;
    if (rotationState.isRotating && !rotationState.isPaused) {
      // Restart timer with new interval
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'start-timer',
        intervalMs: msg.intervalSeconds * 1000,
      }).catch(() => {});
    }
    saveState();
    sendResponse({ ok: true });
    return;
  }
});

// ========== TAB EVENTS ==========

chrome.tabs.onRemoved.addListener((tabId) => {
  if (rotationState.isRotating) {
    removeTabFromRotation(tabId);
    updateBadge();
  }
});

// ========== KEYBOARD COMMANDS ==========

chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case 'toggle-rotation':
      toggleRotation();
      break;
    case 'next-tab':
      goNext();
      break;
    case 'prev-tab':
      goPrev();
      break;
  }
});

// ========== STARTUP ==========

chrome.runtime.onStartup.addListener(async () => {
  await loadState();
  if (rotationState.isRotating && !rotationState.isPaused) {
    // Restart the timer after browser restart
    await ensureOffscreen();
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'start-timer',
      intervalMs: rotationState.intervalSeconds * 1000,
    });
  }
  updateBadge();
});

// Also load state on install/update
chrome.runtime.onInstalled.addListener(async () => {
  await loadState();
  updateBadge();
});
