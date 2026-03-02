// ============================================================
// FrameDeck — Popup UI
// Shows tab list, controls rotation, communicates with background
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let allTabs = [];
let selectedTabIds = new Set();
let rotationState = null;

// ========== INIT ==========

document.addEventListener('DOMContentLoaded', async () => {
  // Load current rotation state
  rotationState = await sendMessage({ action: 'get-state' });

  // Load saved interval
  const stored = await chrome.storage.local.get('framedeck_prefs');
  const prefs = stored.framedeck_prefs || {};
  if (prefs.intervalSeconds) {
    $('#intervalInput').value = prefs.intervalSeconds;
  }
  if (rotationState && rotationState.intervalSeconds) {
    $('#intervalInput').value = rotationState.intervalSeconds;
  }

  // Get tabs in current window
  allTabs = await chrome.tabs.query({ currentWindow: true });

  // Filter out extension pages
  allTabs = allTabs.filter(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));

  // Determine which tabs are selected
  if (rotationState && rotationState.isRotating && rotationState.tabOrder.length > 0) {
    // Use the rotation tab order
    selectedTabIds = new Set(rotationState.tabOrder);
  } else {
    // Default: all tabs selected
    selectedTabIds = new Set(allTabs.map(t => t.id));
  }

  renderTabList();
  updateUI();
  setupEventListeners();
});

// ========== RENDER TAB LIST ==========

function renderTabList() {
  const list = $('#tabList');
  list.innerHTML = '';

  if (allTabs.length === 0) {
    list.innerHTML = '<div class="tab-list-empty">No tabs found</div>';
    return;
  }

  allTabs.forEach(tab => {
    const isSelected = selectedTabIds.has(tab.id);
    const isCurrent = rotationState?.isRotating &&
      rotationState.tabOrder[rotationState.currentIndex] === tab.id;

    const el = document.createElement('label');
    el.className = 'tab-item' + (isSelected ? '' : ' excluded') + (isCurrent ? ' current' : '');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedTabIds.add(tab.id);
        el.classList.remove('excluded');
      } else {
        selectedTabIds.delete(tab.id);
        el.classList.add('excluded');
      }
      updateStartButton();
    });

    const favicon = document.createElement('img');
    favicon.className = 'tab-item-favicon';
    favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="%231c2333"/></svg>';
    favicon.onerror = () => {
      favicon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="%231c2333"/></svg>';
    };

    const title = document.createElement('span');
    title.className = 'tab-item-title';
    title.textContent = tab.title || tab.url || 'Untitled';
    title.title = tab.url;

    el.appendChild(checkbox);
    el.appendChild(favicon);
    el.appendChild(title);
    list.appendChild(el);
  });
}

// ========== UI STATE ==========

function updateUI() {
  const isActive = rotationState?.isRotating;
  const isPaused = rotationState?.isPaused;

  // Status badge
  const badge = $('#statusBadge');
  badge.className = 'header-status';
  if (isActive && !isPaused) {
    badge.classList.add('rotating');
    badge.textContent = 'Rotating';
  } else if (isActive && isPaused) {
    badge.classList.add('paused');
    badge.textContent = 'Paused';
  }

  // Buttons
  const startBtn = $('#startBtn');
  const activeControls = $('#activeControls');

  if (isActive) {
    startBtn.style.display = 'none';
    activeControls.style.display = '';
    updatePauseResumeBtn(isPaused);
  } else {
    startBtn.style.display = '';
    activeControls.style.display = 'none';
  }

  updateStartButton();
}

function updateStartButton() {
  const startBtn = $('#startBtn');
  const count = selectedTabIds.size;
  startBtn.disabled = count < 2;
  if (count < 2) {
    startBtn.querySelector('span').textContent = 'Select at least 2 tabs';
  } else {
    startBtn.querySelector('span').textContent = `Start Rotation (${count} tabs)`;
  }
}

function updatePauseResumeBtn(isPaused) {
  const label = $('#pauseResumeLabel');
  const pauseIcon = $('#pauseIcon');
  const playIcon = $('#playIcon');

  if (isPaused) {
    label.textContent = 'Resume';
    pauseIcon.style.display = 'none';
    playIcon.style.display = '';
  } else {
    label.textContent = 'Pause';
    pauseIcon.style.display = '';
    playIcon.style.display = 'none';
  }
}

// ========== EVENT LISTENERS ==========

function setupEventListeners() {
  // Start
  $('#startBtn').addEventListener('click', async () => {
    const tabIds = [...selectedTabIds];
    const interval = getInterval();
    const win = await chrome.windows.getCurrent();

    await savePrefs(interval);
    await sendMessage({
      action: 'start',
      tabIds,
      intervalSeconds: interval,
      windowId: win.id,
    });

    rotationState = await sendMessage({ action: 'get-state' });
    renderTabList();
    updateUI();
  });

  // Pause / Resume
  $('#pauseResumeBtn').addEventListener('click', async () => {
    if (rotationState?.isPaused) {
      await sendMessage({ action: 'resume' });
    } else {
      await sendMessage({ action: 'pause' });
    }
    rotationState = await sendMessage({ action: 'get-state' });
    updateUI();
  });

  // Stop
  $('#stopBtn').addEventListener('click', async () => {
    await sendMessage({ action: 'stop' });
    rotationState = await sendMessage({ action: 'get-state' });
    // Re-select all tabs
    selectedTabIds = new Set(allTabs.map(t => t.id));
    renderTabList();
    updateUI();
  });

  // Prev / Next
  $('#prevBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'go-prev' });
  });
  $('#nextBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'go-next' });
  });

  // Select all / none
  $('#selectAllBtn').addEventListener('click', () => {
    selectedTabIds = new Set(allTabs.map(t => t.id));
    renderTabList();
    updateStartButton();
  });

  $('#selectNoneBtn').addEventListener('click', () => {
    selectedTabIds.clear();
    renderTabList();
    updateStartButton();
  });

  // Interval change
  $('#intervalInput').addEventListener('change', async () => {
    const interval = getInterval();
    await savePrefs(interval);
    if (rotationState?.isRotating) {
      await sendMessage({ action: 'update-interval', intervalSeconds: interval });
    }
  });
}

// ========== HELPERS ==========

function getInterval() {
  const val = parseInt($('#intervalInput').value, 10);
  return Math.max(5, Math.min(600, isNaN(val) ? 30 : val));
}

async function savePrefs(intervalSeconds) {
  await chrome.storage.local.set({
    framedeck_prefs: { intervalSeconds }
  });
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || null);
    });
  });
}
