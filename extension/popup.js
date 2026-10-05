// The side panel edits a draft. The background owns the running deck and its clock.
const $ = selector => document.querySelector(selector);
const PAGE_ACCESS = { origins: ['http://*/*', 'https://*/*'] };
let allTabs = [], selectedTabIds = new Set(), tabDurations = {}, profiles = [];
let rotationState = {}, windowId, viewingWindowId, dragId, dialogMode, busy = false;
let draftWrites = Promise.resolve(), actions = Promise.resolve(), pendingActions = 0, refreshRevision = 0, draftWindowToRestore = null;

function clampSeconds(value) {
  const number = value === '' ? 30 : Number(value);
  return Math.max(5, Math.min(600, Math.round(Number.isFinite(number) ? number : 30)));
}
const isWebTab = tab => /^https?:\/\//i.test(tab.pendingUrl || tab.url || '');
const selectedTabs = () => allTabs.filter(tab => selectedTabIds.has(tab.id));
const prefs = () => ({ intervalSeconds: clampSeconds($('#intervalInput').value), countdownEnabled: $('#countdownToggle').checked, transitionsEnabled: $('#transitionsToggle').checked });

async function msg(data) {
  const result = await chrome.runtime.sendMessage(data);
  if (!result) throw new Error('FrameDeck could not connect. Reopen the panel and try again.');
  if (result.ok === false) throw new Error(result.error || 'That action could not be completed.');
  return result;
}
function feedback(text, error = false) {
  $('#feedback').textContent = text;
  $('#feedback').hidden = !text;
  $('#feedback').classList.toggle('error', error);
}
function run(action, block = true) {
  if (block) pendingActions++;
  busy = pendingActions > 0;
  updateUI();
  actions = actions.catch(() => {}).then(async () => {
    if (block) feedback('');
    try { await action(); }
    catch (error) { feedback(error.message, true); }
    finally { if (block) pendingActions--; busy = pendingActions > 0; updateUI(); }
  });
  return actions;
}
function applyPrefs(settings) {
  $('#intervalInput').value = clampSeconds(settings.intervalSeconds ?? settings.defaultInterval);
  $('#countdownToggle').checked = settings.countdownEnabled === true;
  $('#transitionsToggle').checked = settings.transitionsEnabled === true;
}
async function savePrefs() { await chrome.storage.local.set({ framedeck_prefs: prefs() }); }
function saveDraft() {
  if (rotationState.isRotating || viewingWindowId !== windowId) return Promise.resolve();
  const draft = { order: allTabs.map(t => t.id), selected: [...selectedTabIds], tabDurations: { ...tabDurations } };
  // Serialize read/modify/write so quick checkbox changes cannot overwrite each other.
  draftWrites = draftWrites.catch(() => {}).then(async () => {
    const { framedeck_drafts: drafts = {} } = await chrome.storage.session.get('framedeck_drafts');
    drafts[windowId] = draft;
    await chrome.storage.session.set({ framedeck_drafts: drafts });
  });
  return draftWrites;
}
async function refreshTabs(restoreDraft = false) {
  const revision = ++refreshRevision;
  const requestedWindow = rotationState.isRotating ? rotationState.windowId : windowId;
  if (restoreDraft) draftWindowToRestore = requestedWindow;
  const shouldRestore = draftWindowToRestore === requestedWindow;
  const fresh = (await chrome.tabs.query({ windowId: requestedWindow })).filter(isWebTab);
  const stored = shouldRestore ? await chrome.storage.session.get('framedeck_drafts') : {};
  if (revision !== refreshRevision || requestedWindow !== (rotationState.isRotating ? rotationState.windowId : windowId)) return;
  viewingWindowId = requestedWindow;
  let order = allTabs.map(t => t.id);
  if (rotationState.isRotating) {
    order = rotationState.tabOrder;
    selectedTabIds = new Set(order);
    tabDurations = { ...rotationState.tabDurations };
  } else if (shouldRestore) {
    const draft = stored.framedeck_drafts?.[windowId];
    order = draft?.order || [];
    selectedTabIds = new Set(draft ? draft.selected : fresh.map(t => t.id));
    tabDurations = draft?.tabDurations || {};
  }
  if (shouldRestore) draftWindowToRestore = null;
  const positions = new Map(order.map((id, i) => [id, i]));
  allTabs = fresh.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  selectedTabIds = new Set([...selectedTabIds].filter(id => fresh.some(t => t.id === id)));
  renderTabList();
  updateUI();
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function renderTabList() {
  const list = $('#tabList');
  const scroll = list.scrollTop;
  const focused = document.activeElement?.dataset.focus;
  const editingValue = document.activeElement?.classList.contains('tab-duration') ? document.activeElement.value : null;
  list.replaceChildren();
  if (!allTabs.length) {
    list.append(element('p', 'empty', 'Open two website tabs to build your first deck. Chrome settings and new-tab pages stay out of the rotation.'));
    return;
  }
  allTabs.forEach((tab, index) => {
    const title = tab.title || 'Untitled tab';
    const row = element('div', 'tab-item');
    row.dataset.tabId = tab.id;
    row.setAttribute('role', 'listitem');
    row.draggable = !rotationState.isRotating;
    const label = element('label', 'tab-select');
    const check = element('input');
    check.type = 'checkbox'; check.checked = selectedTabIds.has(tab.id);
    check.disabled = rotationState.isRotating;
    check.dataset.focus = `select-${tab.id}`;
    check.setAttribute('aria-label', `Include ${title}`);
    check.addEventListener('change', () => {
      check.checked ? selectedTabIds.add(tab.id) : selectedTabIds.delete(tab.id);
      updateUI(); saveDraft().catch(error => feedback(error.message, true));
    });
    const copy = element('span', 'tab-copy');
    const name = element('span', 'tab-title', title); name.title = title;
    const site = element('span', 'tab-site', new URL(tab.pendingUrl || tab.url).hostname.replace(/^www\./, ''));
    copy.append(name, site); label.append(check, copy);
    const durationWrap = element('div', 'tab-duration-wrap');
    const duration = element('input', 'tab-duration');
    duration.type = 'number'; duration.min = 5; duration.max = 600; duration.step = 1;
    duration.value = tabDurations[tab.id] || prefs().intervalSeconds;
    duration.classList.toggle('custom', Boolean(tabDurations[tab.id]));
    duration.dataset.focus = `duration-${tab.id}`;
    duration.setAttribute('aria-label', `Seconds for ${title}`);
    duration.title = '5 to 600 seconds. Clear to use the default.';
    duration.addEventListener('change', () => run(async () => {
      const value = duration.value.trim() ? clampSeconds(duration.value) : prefs().intervalSeconds;
      if (value === prefs().intervalSeconds) delete tabDurations[tab.id]; else tabDurations[tab.id] = value;
      duration.value = value;
      duration.classList.toggle('custom', Boolean(tabDurations[tab.id]));
      if (rotationState.isRotating) rotationState = (await msg({ action: 'update-settings', tabDurations })).state;
      else await saveDraft();
      updateUI();
    }, false));
    duration.addEventListener('pointerdown', event => event.stopPropagation());
    durationWrap.append(duration, element('span', '', 's'));
    const reorder = element('div', 'reorder');
    for (const [offset, symbol, direction] of [[-1, '↑', 'up'], [1, '↓', 'down']]) {
      const button = element('button', '', symbol); button.type = 'button';
      button.disabled = rotationState.isRotating || index + offset < 0 || index + offset >= allTabs.length;
      button.setAttribute('aria-label', `Move ${title} ${direction}`);
      button.title = `Move ${direction}`; button.dataset.focus = `${direction}-${tab.id}`;
      button.addEventListener('click', () => moveTab(tab.id, index + offset));
      reorder.append(button);
    }
    row.append(label, durationWrap, reorder);
    row.addEventListener('dragstart', event => {
      if (event.target.closest('input,button') || rotationState.isRotating) { event.preventDefault(); return; }
      dragId = tab.id; row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(tab.id));
    });
    row.addEventListener('dragover', event => {
      if (dragId == null) return;
      event.preventDefault();
      const above = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
      row.classList.toggle('drag-above', above); row.classList.toggle('drag-below', !above);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-above', 'drag-below'));
    row.addEventListener('drop', event => {
      event.preventDefault();
      if (dragId == null || rotationState.isRotating) return;
      const from = allTabs.findIndex(t => t.id === dragId);
      let target = index + (event.clientY >= row.getBoundingClientRect().top + row.offsetHeight / 2 ? 1 : 0);
      if (from < target) target--;
      moveTab(dragId, target); dragId = null;
    });
    row.addEventListener('dragend', () => { dragId = null; list.querySelectorAll('.tab-item').forEach(el => el.classList.remove('dragging', 'drag-above', 'drag-below')); });
    list.append(row);
  });
  list.scrollTop = scroll;
  if (focused) {
    const control = [...list.querySelectorAll('[data-focus]')].find(el => el.dataset.focus === focused);
    if (control && editingValue !== null) control.value = editingValue;
    const nextFocus = control?.disabled ? control.closest('.tab-item')?.querySelector('button:not(:disabled), input:not(:disabled)') : control;
    nextFocus?.focus({ preventScroll: true });
  }
  updateRows();
}
function moveTab(id, target) {
  if (rotationState.isRotating) return;
  const index = allTabs.findIndex(tab => tab.id === id);
  if (index < 0 || index === target) return;
  const before = new Map([...$('#tabList').children].map(el => [el.dataset.tabId, el.getBoundingClientRect().top]));
  const [tab] = allTabs.splice(index, 1); allTabs.splice(target, 0, tab);
  renderTabList();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (const row of $('#tabList').children) {
      const delta = before.get(row.dataset.tabId) - row.getBoundingClientRect().top;
      if (delta) row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 350, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
  }
  saveDraft().catch(error => feedback(error.message, true));
  feedback(`Moved ${tab.title || 'tab'} to position ${target + 1}.`);
}
function updateRows() {
  for (const row of $('#tabList').querySelectorAll('.tab-item')) {
    const id = Number(row.dataset.tabId);
    const current = rotationState.isRotating && rotationState.tabOrder[rotationState.currentIndex] === id;
    row.classList.toggle('excluded', !selectedTabIds.has(id)); row.classList.toggle('current', Boolean(current));
    if (current) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
  }
}
function updateClock() {
  const ms = rotationState.isPaused ? rotationState.remainingMs : Math.max(0, (rotationState.deadline || Date.now()) - Date.now());
  $('#remainingTime').textContent = Math.ceil(ms / 1000);
}
function updateUI() {
  const active = Boolean(rotationState.isRotating), paused = Boolean(rotationState.isPaused);
  document.body.classList.toggle('playing', active);
  document.body.classList.toggle('paused', paused);
  $('#statusBadge').textContent = active ? paused ? 'Paused' : 'Playing' : 'Stopped';
  $('#tabPosition').textContent = active ? `Tab ${rotationState.currentIndex + 1} of ${rotationState.tabOrder.length}${viewingWindowId !== windowId ? ' (Other window)' : ''}` : '';
  const current = allTabs.find(t => t.id === rotationState.tabOrder?.[rotationState.currentIndex]);
  $('#currentTitle').textContent = current?.title || 'Untitled tab';
  $('#currentTitle').title = current?.title || '';
  $('#paceControl').hidden = active; $('#countdown').hidden = !active;
  $('#playbackInfo').hidden = !active; $('#selectionSummary').hidden = active;
  $('#countdownLabel').textContent = paused ? 'Time left' : 'Next tab in';
  $('#startBtn').hidden = active; $('#activeControls').hidden = !active;
  $('#startBtn').disabled = busy || selectedTabIds.size < 2;
  $('#startLabel').textContent = selectedTabIds.size < 2 ? 'Choose at least 2 tabs' : 'Play';
  $('#pauseResumeLabel').textContent = paused ? 'Resume' : 'Pause'; $('#pauseSymbol').textContent = paused ? '▶' : 'Ⅱ';
  for (const id of ['prevBtn', 'nextBtn', 'stopBtn', 'pauseResumeBtn']) $(`#${id}`).disabled = busy;
  for (const id of ['selectAllBtn', 'selectNoneBtn']) $(`#${id}`).hidden = active;
  $('#queueHint').textContent = active ? 'Stop the rotation to change tabs or their order.' : 'Drag to arrange, or use the arrows.';
  const seconds = selectedTabs().reduce((total, t) => total + (tabDurations[t.id] || prefs().intervalSeconds), 0);
  const duration = `${Math.floor(seconds / 60) ? `${Math.floor(seconds / 60)}m ` : ''}${seconds % 60 || !seconds ? `${seconds % 60}s` : ''}`.trim();
  $('#selectedCount').textContent = selectedTabIds.size;
  $('#selectedUnit').textContent = selectedTabIds.size === 1 ? 'tab' : 'tabs';
  $('#loopDuration').textContent = duration;
  $('#loadProfileBtn').disabled = busy || active || !$('#profileSelect').value;
  $('#deleteProfileBtn').disabled = busy || !$('#profileSelect').value;
  $('#saveProfileBtn').disabled = busy || selectedTabIds.size < 2;
  for (const control of document.querySelectorAll('#intervalInput, .tab-duration, .switch')) control.disabled = busy;
  updateRows(); updateClock();
}
function renderProfiles() {
  const selected = $('#profileSelect').value;
  $('#profileSelect').replaceChildren(new Option('Choose a deck', ''));
  profiles.forEach(profile => $('#profileSelect').add(new Option(profile.name, profile.name)));
  $('#profileSelect').value = selected;
  $('#deckCount').textContent = profiles.length ? `${profiles.length} saved` : 'None yet';
  updateUI();
}
async function syncState() {
  const wasActive = rotationState.isRotating;
  rotationState = await msg({ action: 'get-state' });
  if (rotationState.isRotating) applyPrefs(rotationState);
  if (Boolean(wasActive) !== Boolean(rotationState.isRotating) || viewingWindowId !== (rotationState.isRotating ? rotationState.windowId : windowId)) await refreshTabs(!rotationState.isRotating);
  else { if (rotationState.isRotating) { selectedTabIds = new Set(rotationState.tabOrder); tabDurations = { ...rotationState.tabDurations }; } updateUI(); }
}
function showProfileDialog(mode) {
  dialogMode = mode; const deleting = mode === 'delete';
  $('#dialogTitle').textContent = deleting ? 'Delete this deck?' : 'Save your deck';
  $('#dialogHint').textContent = deleting ? `Delete "${$('#profileSelect').value}" from your saved decks? Your tabs will stay open.` : 'Use a name like Morning announcements.';
  $('#profileName').hidden = deleting; $('#nameLabel').hidden = deleting; $('#profileName').required = !deleting;
  $('#profileName').value = deleting ? '' : $('#profileSelect').value;
  $('#dialogError').hidden = true;
  updateSaveLabel(); $('#profileDialog').showModal();
  (deleting ? $('#cancelDialogBtn') : $('#profileName')).focus();
}
function updateSaveLabel() {
  $('#confirmDialogBtn').textContent = dialogMode === 'delete' ? 'Delete deck' : profiles.some(p => p.name === $('#profileName').value.trim()) ? 'Replace deck' : 'Save deck';
}
function setupEvents() {
  $('#startBtn').addEventListener('click', () => run(async () => {
    await saveDraft(); await savePrefs();
    rotationState = (await msg({ action: 'start', tabIds: selectedTabs().map(t => t.id), windowId, tabDurations, ...prefs() })).state;
    await refreshTabs();
  }));
  for (const [id, action] of [['stopBtn', 'stop'], ['prevBtn', 'go-prev'], ['nextBtn', 'go-next'], ['pauseResumeBtn', 'toggle']]) {
    $(`#${id}`).addEventListener('click', () => run(async () => {
      const wasOwnDeck = rotationState.windowId === windowId;
      const stoppedDraft = action === 'stop' && wasOwnDeck ? { order: allTabs.map(t => t.id), selected: [...selectedTabIds], tabDurations: { ...tabDurations } } : null;
      rotationState = (await msg({ action: action === 'toggle' ? rotationState.isPaused ? 'resume' : 'pause' : action })).state;
      if (stoppedDraft) {
        const { framedeck_drafts: drafts = {} } = await chrome.storage.session.get('framedeck_drafts');
        drafts[windowId] = stoppedDraft;
        await chrome.storage.session.set({ framedeck_drafts: drafts });
      }
      await refreshTabs(action === 'stop');
    }));
  }
  for (const [id, all] of [['selectAllBtn', true], ['selectNoneBtn', false]]) {
    $(`#${id}`).addEventListener('click', () => run(async () => { selectedTabIds = new Set(all ? allTabs.map(t => t.id) : []); renderTabList(); await saveDraft(); }));
  }
  $('#intervalInput').addEventListener('change', () => run(async () => {
    $('#intervalInput').value = clampSeconds($('#intervalInput').value); await savePrefs(); renderTabList();
  }, false));
  for (const [id, setting] of [['countdownToggle', 'countdownEnabled'], ['transitionsToggle', 'transitionsEnabled']]) {
    $(`#${id}`).addEventListener('change', event => {
      const enabled = event.target.checked;
      // The request must start directly inside the user gesture, before other awaits.
      const permission = enabled ? chrome.permissions.request(PAGE_ACCESS) : Promise.resolve(true);
      run(async () => {
        try { if (!(await permission)) { event.target.checked = false; feedback('Website access was not enabled. Tab rotation still works.'); } }
        catch (error) { event.target.checked = false; throw error; }
        $('#revokeAccessBtn').hidden = !(await chrome.permissions.contains(PAGE_ACCESS));
        await savePrefs();
        if (rotationState.isRotating) rotationState = (await msg({ action: 'update-settings', [setting]: event.target.checked })).state;
      });
    });
  }
  $('#revokeAccessBtn').addEventListener('click', () => run(async () => {
    if (rotationState.isRotating) rotationState = (await msg({ action: 'update-settings', countdownEnabled: false, transitionsEnabled: false })).state;
    await chrome.permissions.remove(PAGE_ACCESS); $('#countdownToggle').checked = false; $('#transitionsToggle').checked = false;
    $('#revokeAccessBtn').hidden = true; await savePrefs(); feedback('Website access removed.');
  }));
  $('#profileSelect').addEventListener('change', updateUI);
  $('#saveProfileBtn').addEventListener('click', () => showProfileDialog('save'));
  $('#deleteProfileBtn').addEventListener('click', () => showProfileDialog('delete'));
  $('#cancelDialogBtn').addEventListener('click', () => $('#profileDialog').close());
  $('#profileName').addEventListener('input', updateSaveLabel);
  $('#profileForm').addEventListener('submit', async event => {
    event.preventDefault(); if ($('#confirmDialogBtn').disabled) return;
    $('#confirmDialogBtn').disabled = true;
    try {
      const name = dialogMode === 'delete' ? $('#profileSelect').value : $('#profileName').value.trim();
      if (!name) throw new Error('Enter a name for this deck.');
      if (dialogMode === 'delete') await msg({ action: 'delete-profile', name });
      else await msg({ action: 'save-profile', profile: { name, tabs: selectedTabs().map(t => ({ url: t.pendingUrl || t.url, ...(tabDurations[t.id] ? { duration: tabDurations[t.id] } : {}) })), defaultInterval: prefs().intervalSeconds, countdownEnabled: prefs().countdownEnabled, transitionsEnabled: prefs().transitionsEnabled } });
      profiles = await msg({ action: 'get-profiles' }); renderProfiles();
      if (dialogMode !== 'delete') $('#profileSelect').value = name;
      $('#profileDialog').close(); updateUI(); feedback(dialogMode === 'delete' ? 'Deck deleted. Your tabs are still open.' : `Saved "${name}".`);
    } catch (error) { $('#dialogError').textContent = error.message; $('#dialogError').hidden = false; }
    finally { $('#confirmDialogBtn').disabled = false; }
  });
  $('#loadProfileBtn').addEventListener('click', () => run(async () => {
    const result = await msg({ action: 'load-profile', name: $('#profileSelect').value, windowId });
    selectedTabIds = new Set(result.tabIds); tabDurations = result.tabDurations; applyPrefs(result.profile);
    if (!(await chrome.permissions.contains(PAGE_ACCESS))) { $('#countdownToggle').checked = false; $('#transitionsToggle').checked = false; }
    allTabs = result.tabIds.map(id => ({ id }));
    await refreshTabs(); await savePrefs(); await saveDraft();
    feedback(`Loaded "${result.profile.name}". Press Play to start.`);
  }));
  $('#shortcutsBtn').addEventListener('click', () => run(() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.framedeck) syncState().catch(error => feedback(error.message, true));
  });
  const refresh = () => refreshTabs().catch(error => feedback(error.message, true));
  chrome.tabs.onRemoved.addListener(refresh);
  chrome.tabs.onCreated.addListener(refresh);
  chrome.tabs.onAttached.addListener(refresh);
  chrome.tabs.onDetached.addListener(refresh);
  chrome.tabs.onReplaced.addListener(refresh);
  chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (tab.windowId === viewingWindowId && (change.url || change.title)) refresh(); });
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [state, saved, stored, win, allowed] = await Promise.all([msg({ action: 'get-state' }), msg({ action: 'get-profiles' }), chrome.storage.local.get('framedeck_prefs'), chrome.windows.getCurrent(), chrome.permissions.contains(PAGE_ACCESS)]);
    rotationState = state; profiles = saved; windowId = win.id;
    applyPrefs(state.isRotating ? state : stored.framedeck_prefs || {});
    if (!allowed) { $('#countdownToggle').checked = false; $('#transitionsToggle').checked = false; }
    $('#revokeAccessBtn').hidden = !allowed;
    await refreshTabs(true); renderProfiles(); setupEvents();
    setInterval(updateClock, 250);
  } catch (error) { feedback(error.message, true); }
});
