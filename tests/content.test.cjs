const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../extension/content.js'), 'utf8');

// Only the browser boundaries are faked; every assertion drives the real script.
function page({ reduced = false } = {}) {
  let now = 1000, nextTimer = 0, listener;
  const roots = [], pending = [], timers = new Map(), events = {};
  function element() {
    const classes = new Set();
    return {
      style: {}, isConnected: false,
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
      remove() { this.isConnected = false; roots.splice(roots.indexOf(this), 1); },
      attachShadow() {
        const nodes = new Map();
        this.shadowRoot = {
          querySelector(selector) {
            if (!nodes.has(selector)) nodes.set(selector, element());
            return nodes.get(selector);
          },
        };
        return this.shadowRoot;
      },
    };
  }
  const document = {
    hidden: false, createElement: element,
    documentElement: { appendChild(root) { root.isConnected = true; roots.push(root); } },
    addEventListener: (name, fn) => { events[name] = fn; },
  };
  const context = vm.createContext({
    window: { addEventListener: (name, fn) => { events[name] = fn; } }, document,
    matchMedia: () => ({ matches: reduced, addEventListener() {} }),
    Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    chrome: { runtime: {
      onMessage: { addListener: fn => { listener = fn; } },
      sendMessage: () => new Promise(resolve => pending.push(resolve)),
    } },
  });
  vm.runInContext(source, context);
  return {
    roots, pending, events, document,
    node: selector => roots[0]?.shadowRoot.querySelector(selector),
    message(action, fields = {}) { listener({ target: 'content', action, ...fields }, {}, () => {}); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.fn(); }
      }
    },
    reinject() { vm.runInContext(source, context); },
  };
}

const active = { duration: 30, deadline: 21000, paused: false };

test('countdown follows the worker deadline, pause and resume without resetting progress', () => {
  const p = page();
  p.message('start-countdown', active);
  assert.equal(p.node('#time').textContent, 'Next tab in 20s');
  p.advance(5500);
  assert.equal(p.node('#time').textContent, 'Next tab in 15s');
  assert.equal(p.node('#fill').style.transform, `scaleX(${14500 / 30000})`);
  p.message('start-countdown', { ...active, paused: true, remainingMs: 14500 });
  p.advance(5000);
  assert.equal(p.node('#time').textContent, 'Paused · 15s');
  p.message('start-countdown', { ...active, deadline: 26000 });
  p.advance(1000);
  assert.equal(p.node('#time').textContent, 'Next tab in 14s');
});

test('repeat start/stop removes both markup and styles; duplicate injection is harmless', () => {
  const p = page();
  for (let i = 0; i < 3; i++) {
    p.message('start-countdown', active);
    assert.equal(p.roots.length, 1);
    assert.match(p.roots[0].shadowRoot.innerHTML, /<style>/);
    p.message('stop-countdown');
    assert.equal(p.roots.length, 0);
  }
  p.reinject();
  assert.equal(p.pending.length, 1);
});

test('fade clears when hidden and also if a tab switch fails', () => {
  const p = page();
  p.message('fade-out');
  assert.equal(p.node('#veil').classList.contains('out'), true);
  p.document.hidden = true;
  p.events.visibilitychange();
  assert.equal(p.roots.length, 0);
  p.document.hidden = false;
  p.message('fade-out');
  p.advance(700);
  assert.equal(p.roots.length, 0);
});

test('reduced motion skips fades', () => {
  const p = page({ reduced: true });
  p.message('fade-out');
  p.message('fade-in');
  assert.equal(p.roots.length, 0);
});

test('reload restores a countdown, but a stale ready response cannot undo a stop', async () => {
  const p = page();
  p.pending.shift()({ countdown: active });
  await new Promise(setImmediate);
  assert.equal(p.node('#time').textContent, 'Next tab in 20s');
  p.events.pageshow();
  p.message('stop-countdown');
  p.pending.shift()({ countdown: active });
  await new Promise(setImmediate);
  assert.equal(p.roots.length, 0);
});
