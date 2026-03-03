// ============================================================
// FrameDeck — Popup UI
// Tab list, drag reorder, per-tab durations, profiles, controls
// ============================================================

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let allTabs = [];
let selectedTabIds = new Set();
let tabDurations = {};
let rotationState = null;
let profiles = [];
let dragSrcIdx = null;

// ========== INIT ==========

document.addEventListener('DOMContentLoaded', async () => {
  rotationState = await msg({ action: 'get-state' });
  profiles = await msg({ action: 'get-profiles' }) || [];

  const stored = await chrome.storage.local.get('framedeck_prefs');
  const prefs = stored.framedeck_prefs || {};
  if (prefs.intervalSeconds) $('#intervalInput').value = prefs.intervalSeconds;
  if (prefs.countdownEnabled !== undefined) $('#countdownToggle').checked = prefs.countdownEnabled;
  if (prefs.transitionsEnabled !== undefined) $('#transitionsToggle').checked = prefs.transitionsEnabled;

  if (rotationState?.isRotating) {
    $('#intervalInput').value = rotationState.intervalSeconds;
    $('#countdownToggle').checked = rotationState.countdownEnabled;
    $('#transitionsToggle').checked = rotationState.transitionsEnabled;
    tabDurations = { ...(rotationState.tabDurations || {}) };
  }

  allTabs = (await chrome.tabs.query({ currentWindow: true }))
    .filter(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));

  if (rotationState?.isRotating && rotationState.tabOrder.length > 0) {
    const order = new Map(rotationState.tabOrder.map((id, i) => [id, i]));
    allTabs.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    selectedTabIds = new Set(rotationState.tabOrder);
  } else {
    selectedTabIds = new Set(allTabs.map(t => t.id));
  }

  renderTabList();
  renderProfiles();
  updateUI();
  setupEvents();
});

// ========== RENDER TAB LIST ==========

function renderTabList() {
  const list = $('#tabList');
  list.innerHTML = '';

  if (allTabs.length === 0) {
    list.innerHTML = '<div class="tab-list-empty">No tabs found</div>';
    return;
  }

  const defaultInterval = getInterval();

  allTabs.forEach((tab, idx) => {
    const sel = selectedTabIds.has(tab.id);
    const cur = rotationState?.isRotating &&
      rotationState.tabOrder[rotationState.currentIndex] === tab.id;

    const el = document.createElement('div');
    el.className = 'tab-item' + (sel ? '' : ' excluded') + (cur ? ' current' : '');
    el.draggable = true;
    el.dataset.index = idx;

    // Drag handle
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '\u2807';
    handle.title = 'Drag to reorder';

    // Checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = sel;
    cb.addEventListener('change', () => {
      if (cb.checked) { selectedTabIds.add(tab.id); el.classList.remove('excluded'); }
      else { selectedTabIds.delete(tab.id); el.classList.add('excluded'); }
      updateStartBtn();
    });

    // Favicon
    const fav = document.createElement('img');
    fav.className = 'tab-item-favicon';
    const fallback = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="%231c2333"/></svg>';
    fav.src = tab.favIconUrl || fallback;
    fav.onerror = () => { fav.src = fallback; };

    // Title
    const title = document.createElement('span');
    title.className = 'tab-item-title';
    title.textContent = tab.title || tab.url || 'Untitled';
    title.title = tab.url;

    // Per-tab duration
    const durWrap = document.createElement('div');
    durWrap.className = 'tab-duration-wrap';
    const durInput = document.createElement('input');
    durInput.type = 'number';
    durInput.className = 'tab-duration';
    durInput.min = 5;
    durInput.max = 600;
    durInput.value = tabDurations[tab.id] || defaultInterval;
    durInput.title = 'Duration for this tab (seconds)';
    if (tabDurations[tab.id]) durInput.classList.add('custom');

    durInput.addEventListener('change', () => {
      const v = parseInt(durInput.value, 10);
      const def = getInterval();
      if (isNaN(v) || v === def) {
        delete tabDurations[tab.id];
        durInput.classList.remove('custom');
        durInput.value = def;
      } else {
        tabDurations[tab.id] = Math.max(5, Math.min(600, v));
        durInput.value = tabDurations[tab.id];
        durInput.classList.add('custom');
      }
    });
    durInput.addEventListener('mousedown', e => e.stopPropagation());

    const durLabel = document.createElement('span');
    durLabel.className = 'tab-duration-label';
    durLabel.textContent = 's';
    durWrap.appendChild(durInput);
    durWrap.appendChild(durLabel);

    el.appendChild(handle);
    el.appendChild(cb);
    el.appendChild(fav);
    el.appendChild(title);
    el.appendChild(durWrap);

    // Drag events
    el.addEventListener('dragstart', e => {
      dragSrcIdx = idx;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      el.classList.toggle('drag-above', e.clientY < mid);
      el.classList.toggle('drag-below', e.clientY >= mid);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-above', 'drag-below');
    });
    el.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrcIdx !== null && dragSrcIdx !== idx) {
        const [moved] = allTabs.splice(dragSrcIdx, 1);
        allTabs.splice(idx, 0, moved);
        renderTabList();
      }
    });
    el.addEventListener('dragend', () => {
      dragSrcIdx = null;
      list.querySelectorAll('.tab-item').forEach(i =>
        i.classList.remove('dragging', 'drag-above', 'drag-below'));
    });

    list.appendChild(el);
  });
}

// ========== PROFILES ==========

function renderProfiles() {
  const sel = $('#profileSelect');
  const val = sel.value;
  sel.innerHTML = '<option value="">-- None --</option>';
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
  sel.value = val;
}

// ========== UI STATE ==========

function updateUI() {
  const isActive = rotationState?.isRotating;
  const isPaused = rotationState?.isPaused;

  const badge = $('#statusBadge');
  badge.className = 'header-status';
  if (isActive && !isPaused) { badge.classList.add('rotating'); badge.textContent = 'Rotating'; }
  else if (isActive && isPaused) { badge.classList.add('paused'); badge.textContent = 'Paused'; }

  if (isActive) {
    $('#startBtn').style.display = 'none';
    $('#activeControls').style.display = '';
    updatePauseBtn(isPaused);
  } else {
    $('#startBtn').style.display = '';
    $('#activeControls').style.display = 'none';
  }
  updateStartBtn();
}

function updateStartBtn() {
  const btn = $('#startBtn');
  const count = selectedTabIds.size;
  btn.disabled = count < 2;
  btn.querySelector('span').textContent = count < 2
    ? 'Select at least 2 tabs'
    : `Start Rotation (${count} tabs)`;
}

function updatePauseBtn(isPaused) {
  $('#pauseResumeLabel').textContent = isPaused ? 'Resume' : 'Pause';
  $('#pauseIcon').style.display = isPaused ? 'none' : '';
  $('#playIcon').style.display = isPaused ? '' : 'none';
}

// ========== EVENTS ==========

function setupEvents() {
  // Start
  $('#startBtn').addEventListener('click', async () => {
    const tabIds = allTabs.filter(t => selectedTabIds.has(t.id)).map(t => t.id);
    const interval = getInterval();
    const win = await chrome.windows.getCurrent();

    await savePrefs();
    await msg({
      action: 'start',
      tabIds,
      intervalSeconds: interval,
      windowId: win.id,
      tabDurations: { ...tabDurations },
      transitionsEnabled: $('#transitionsToggle').checked,
      countdownEnabled: $('#countdownToggle').checked,
    });

    rotationState = await msg({ action: 'get-state' });
    renderTabList();
    updateUI();
  });

  // Pause/Resume
  $('#pauseResumeBtn').addEventListener('click', async () => {
    await msg({ action: rotationState?.isPaused ? 'resume' : 'pause' });
    rotationState = await msg({ action: 'get-state' });
    updateUI();
  });

  // Stop
  $('#stopBtn').addEventListener('click', async () => {
    await msg({ action: 'stop' });
    rotationState = await msg({ action: 'get-state' });
    selectedTabIds = new Set(allTabs.map(t => t.id));
    renderTabList();
    updateUI();
  });

  // Prev/Next
  $('#prevBtn').addEventListener('click', () => msg({ action: 'go-prev' }));
  $('#nextBtn').addEventListener('click', () => msg({ action: 'go-next' }));

  // Select all/none
  $('#selectAllBtn').addEventListener('click', () => {
    selectedTabIds = new Set(allTabs.map(t => t.id));
    renderTabList(); updateStartBtn();
  });
  $('#selectNoneBtn').addEventListener('click', () => {
    selectedTabIds.clear();
    renderTabList(); updateStartBtn();
  });

  // Interval change
  $('#intervalInput').addEventListener('change', async () => {
    await savePrefs();
    if (rotationState?.isRotating) {
      await msg({ action: 'update-interval', intervalSeconds: getInterval() });
    }
    renderTabList();
  });

  // Settings toggles
  $('#countdownToggle').addEventListener('change', async () => {
    await savePrefs();
    if (rotationState?.isRotating) {
      await msg({ action: 'update-settings', countdownEnabled: $('#countdownToggle').checked });
    }
  });
  $('#transitionsToggle').addEventListener('change', async () => {
    await savePrefs();
    if (rotationState?.isRotating) {
      await msg({ action: 'update-settings', transitionsEnabled: $('#transitionsToggle').checked });
    }
  });

  // Save profile
  $('#saveProfileBtn').addEventListener('click', async () => {
    const name = prompt('Profile name:');
    if (!name || !name.trim()) return;

    const selectedTabs = allTabs.filter(t => selectedTabIds.has(t.id));
    const profile = {
      name: name.trim(),
      urls: selectedTabs.map(t => t.url),
      defaultInterval: getInterval(),
      tabDurations: {},
      transitionsEnabled: $('#transitionsToggle').checked,
      countdownEnabled: $('#countdownToggle').checked,
    };
    selectedTabs.forEach(t => {
      if (tabDurations[t.id]) profile.tabDurations[t.url] = tabDurations[t.id];
    });

    await msg({ action: 'save-profile', profile });
    profiles = await msg({ action: 'get-profiles' }) || [];
    renderProfiles();
    $('#profileSelect').value = name.trim();
  });

  // Load profile
  $('#loadProfileBtn').addEventListener('click', async () => {
    const name = $('#profileSelect').value;
    if (!name) return;
    const profile = profiles.find(p => p.name === name);
    if (!profile) return;

    // Open profile URLs as new tabs
    const newTabs = [];
    for (const url of profile.urls) {
      const tab = await chrome.tabs.create({ url, active: false });
      newTabs.push(tab);
    }

    // Map URL-based durations to new tab IDs
    tabDurations = {};
    newTabs.forEach(tab => {
      const dur = profile.tabDurations?.[tab.pendingUrl || tab.url];
      if (dur) tabDurations[tab.id] = dur;
    });

    // Refresh tab list
    allTabs = (await chrome.tabs.query({ currentWindow: true }))
      .filter(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
    selectedTabIds = new Set(newTabs.map(t => t.id));

    // Apply profile settings
    $('#intervalInput').value = profile.defaultInterval || 30;
    $('#countdownToggle').checked = profile.countdownEnabled !== false;
    $('#transitionsToggle').checked = profile.transitionsEnabled !== false;

    await savePrefs();
    renderTabList();
    updateUI();
  });

  // Delete profile
  $('#deleteProfileBtn').addEventListener('click', async () => {
    const name = $('#profileSelect').value;
    if (!name) return;
    if (!confirm(`Delete profile "${name}"?`)) return;
    await msg({ action: 'delete-profile', name });
    profiles = await msg({ action: 'get-profiles' }) || [];
    renderProfiles();
  });
}

// ========== HELPERS ==========

function getInterval() {
  const v = parseInt($('#intervalInput').value, 10);
  return Math.max(5, Math.min(600, isNaN(v) ? 30 : v));
}

async function savePrefs() {
  await chrome.storage.local.set({
    framedeck_prefs: {
      intervalSeconds: getInterval(),
      countdownEnabled: $('#countdownToggle').checked,
      transitionsEnabled: $('#transitionsToggle').checked,
    },
  });
}

function msg(data) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(data, r => resolve(r || null));
  });
}
