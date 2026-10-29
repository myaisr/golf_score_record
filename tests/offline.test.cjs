const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const source = readFileSync(join(__dirname, '../sw.js'), 'utf8');

function worker() {
  const handlers = {}, installed = [], deleted = [];
  vm.runInNewContext(source, {
    self: { location: { origin: 'http://localhost:8000' }, addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    caches: {
      open: async () => ({ addAll: async paths => installed.push(...paths) }),
      keys: async () => ['another-app-cache', 'roundnote-v1', 'roundnote-v3-focused-ui'],
      delete: async name => deleted.push(name),
      match: async request => request === './index.html' ? new Response('offline app') : undefined,
    },
    fetch: async () => { throw new Error('offline'); }, URL, Response,
  });
  return { handlers, installed, deleted };
}

test('all install assets exist, including the separated JavaScript and CSS', async () => {
  const w = worker();
  let finished;
  w.handlers.install({ waitUntil: promise => { finished = promise; } });
  await finished;
  assert.ok(w.installed.includes('./app.js'));
  assert.ok(w.installed.includes('./app.css'));
  for (const file of w.installed) assert.ok(existsSync(join(__dirname, '..', file)));
});

test('offline preview navigation falls back to the cached application', async () => {
  const w = worker();
  let response;
  w.handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: 'http://localhost:8000/?preview=1' }, respondWith: promise => { response = promise; } });
  assert.equal(await (await response).text(), 'offline app');
});

test('activation only removes caches owned by ROUNDNOTE', async () => {
  const w = worker();
  let finished;
  w.handlers.activate({ waitUntil: promise => { finished = promise; } });
  await finished;
  assert.deepEqual(w.deleted, ['roundnote-v1']);
});
