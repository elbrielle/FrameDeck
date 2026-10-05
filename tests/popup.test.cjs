const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../extension/popup.js'), 'utf8');
const tabs = [1, 2].map(id => ({ id, windowId: 1, title: `Tab ${id}`, url: `https://tab${id}.test/` }));
const flush = () => new Promise(setImmediate);

function popup({ deferDraft = false } = {}) {
  const queries = [], drafts = [], nodes = new Map();
  const document = { activeElement: null, addEventListener() {} };
  function element(tag = 'div') {
    const el = {
      tag, children: [], dataset: {}, className: '', disabled: false, scrollTop: 0,
      append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); },
      replaceChildren(...children) { document.activeElement = null; this.children = []; this.append(...children); },
      setAttribute() {}, removeAttribute() {}, addEventListener() {},
      getBoundingClientRect: () => ({ top: 0 }),
      focus() { if (!this.disabled) document.activeElement = this; },
      querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
        return descendants.filter(child => selector === '*' || selector.split(',').some(part => {
          const s = part.trim();
          if (s === '[data-focus]') return Boolean(child.dataset.focus);
          if (s.startsWith('.')) return child.classList.contains(s.slice(1));
          return child.tag === s.split(':')[0] && (!s.includes(':not(:disabled)') || !child.disabled);
        }));
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      closest(selector) { return this.classList.contains(selector.slice(1)) ? this : this.parent?.closest(selector); },
    };
    el.classList = {
      contains: name => el.className.split(/\s+/).includes(name),
      toggle(name, enabled) {
        const classes = new Set(el.className.split(/\s+/).filter(Boolean));
        enabled ? classes.add(name) : classes.delete(name); el.className = [...classes].join(' ');
      },
    };
    let value = '';
    Object.defineProperty(el, 'value', { get: () => value, set: v => { value = String(v); } });
    return el;
  }
  document.createElement = element;
  document.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  document.querySelector('#intervalInput').value = 30;
  const context = vm.createContext({
    document, URL, matchMedia: () => ({ matches: true }),
    chrome: {
      tabs: { query: args => new Promise(resolve => queries.push({ args, resolve })) },
      storage: { session: {
        get: () => deferDraft ? new Promise(resolve => drafts.push(resolve)) : Promise.resolve({}),
        set: async () => {},
      } },
    },
  });
  const run = script => vm.runInContext(script, context);
  run(source);
  run(`updateUI=()=>{}; windowId=1; viewingWindowId=1; rotationState={isRotating:false};
    allTabs=${JSON.stringify(tabs)}; selectedTabIds=new Set([1,2]);`);
  return {
    run, document, queries, drafts,
    control: key => document.querySelector('#tabList').querySelectorAll('[data-focus]').find(el => el.dataset.focus === key),
    selected: () => JSON.parse(run('JSON.stringify([...selectedTabIds])')),
  };
}

test('late tab query cannot erase newer selected tabs', async () => {
  const p = popup();
  const old = p.run('refreshTabs()'), current = p.run('refreshTabs()');
  p.queries[1].resolve(tabs); await current;
  p.queries[0].resolve(tabs.slice(0, 1)); await old;
  assert.deepEqual(p.selected(), [1, 2]);
  assert.equal(p.run('allTabs.length'), 2);
});

test('new refresh retains pending draft restoration and rejects stale storage', async () => {
  const p = popup({ deferDraft: true });
  const old = p.run('refreshTabs(true)');
  p.queries[0].resolve(tabs); await flush();
  const current = p.run('refreshTabs()');
  p.queries[1].resolve(tabs); await flush();
  assert.equal(p.drafts.length, 2, 'tab events must retain the requested draft restoration');
  p.drafts[1]({ framedeck_drafts: { 1: { order: [2, 1], selected: [1, 2], tabDurations: { 2: 45 } } } });
  await current;
  p.drafts[0]({ framedeck_drafts: { 1: { order: [1], selected: [1], tabDurations: {} } } });
  await old;
  assert.deepEqual(p.selected(), [1, 2]);
  assert.equal(p.run('allTabs[0].id'), 2);
  assert.equal(p.run('tabDurations[2]'), 45);
});

test('a refresh for the previous window cannot replace the current deck', async () => {
  const p = popup();
  const old = p.run('refreshTabs()');
  p.run('rotationState={isRotating:true,windowId:2,tabOrder:[3,4],tabDurations:{}}');
  p.queries[0].resolve(tabs.slice(0, 1)); await old;
  assert.deepEqual(p.selected(), [1, 2]);
  assert.equal(p.run('allTabs.length'), 2);
});

test('rerender preserves an unfinished duration and boundary reorder keeps keyboard focus', () => {
  const p = popup();
  p.run('renderTabList()');
  p.control('duration-2').focus(); p.document.activeElement.value = '45';
  p.run('allTabs[0].title="Updated title"; renderTabList()');
  assert.equal(p.document.activeElement.dataset.focus, 'duration-2');
  assert.equal(p.document.activeElement.value, '45');
  assert.equal(p.run('tabDurations[2]'), undefined, 'typing is not committed by a background refresh');
  p.control('up-2').focus(); p.run('moveTab(2,0)');
  assert.equal(p.control('up-2').disabled, true);
  assert.equal(p.document.activeElement.disabled, false);
  assert.equal(p.document.activeElement.closest('.tab-item').dataset.tabId, 2);
});
