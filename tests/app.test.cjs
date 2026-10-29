const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const script = readFileSync(join(__dirname, '../app.js'), 'utf8');
const normalKey = 'roundnote-golf-v1';
const previewKey = 'roundnote-golf-ui-preview-v1';

// Exercise the real app's event handlers and storage without third-party dependencies.
function openApp({ preview = true, storage = new Map(), storageFails = false } = {}) {
  const handlers = {};
  const text = [];
  const draws = [];
  const context2d = new Proxy({ fillText: (value, x, y) => { text.push(String(value)); draws.push({ x, y, font: context2d.font }); } }, {
    get: (target, key) => target[key] || (() => {}),
  });
  const canvas = { getContext: () => context2d, toDataURL: () => 'data:image/png;base64,preview' };
  const node = { innerHTML: '', addEventListener() {}, focus() {}, scrollIntoView() {}, replaceChildren() {} };
  node.querySelector = () => node;
  const app = { ...node, addEventListener: (type, fn) => { handlers[type] = fn; } };
  const overlay = { ...node };
  const document = {
    activeElement: null,
    body: { style: { overflow: '' } },
    getElementById: id => id === 'app' ? app : id === 'overlay-root' ? overlay : node,
    querySelector: () => node,
    createElement: () => canvas,
  };
  vm.runInNewContext(script, {
    document, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => { if (storageFails) throw new Error('Quota exceeded'); storage.set(key, value); } },
    location: { search: preview ? '?preview=1' : '', protocol: 'http:' },
    URLSearchParams, navigator: {}, window: { scrollTo() {} }, confirm: () => true,
  });
  return {
    click: dataset => handlers.click({ target: { closest: () => ({ dataset }) } }),
    markup: () => app.innerHTML,
    state: () => JSON.parse(storage.get(preview ? previewKey : normalKey)),
    canvas, text, draws, storage,
  };
}

test('OB counts remain separate from strokes and use two explicit labels', () => {
  const app = openApp();
  app.click({ field: 'long', setval: '2' });
  app.click({ field: 'short', setval: '1' });
  app.click({ field: 'putts', setval: '2' });
  app.click({ field: 'obTee', step: '1' });
  app.click({ field: 'obLater', step: '1' });
  const h = app.state().holes[0];
  assert.equal(h.long + h.short + h.putts, 5);
  assert.equal(h.obTee + h.obLater, 2);
  assert.match(app.markup(), /<strong>5 <small>打<\/small><\/strong>/);
  assert.match(app.markup(), /class="ob-row"><span>ティーショット/);
  assert.match(app.markup(), /class="ob-row"><span>2打目以降/);
});

test('optional notes toggle, allow multiple misses, and survive reload', () => {
  const app = openApp();
  app.click({ action: 'review' });
  app.click({ tee: 'right' });
  app.click({ approach: 'short' });
  app.click({ approach: 'over' });
  assert.deepEqual(app.state().holes[0].approach, ['short', 'over']);
  assert.match(app.markup(), /aria-expanded="true"/);
  const reloaded = openApp({ storage: app.storage });
  assert.match(reloaded.markup(), /ティー：右 \/ 50y：ショート・オーバー/);
  assert.match(reloaded.markup(), /aria-expanded="false"/);
  reloaded.click({ approach: 'none' });
  assert.deepEqual(reloaded.state().holes[0].approach, []);
  reloaded.click({ approach: 'none' });
  assert.equal(reloaded.state().holes[0].approach, null);
  reloaded.click({ tee: 'right' });
  assert.equal(reloaded.state().holes[0].tee, null);
});

test('sample trends exclude unrecorded holes and direct-ON approach notes', () => {
  const app = openApp();
  app.click({ action: 'sample' });
  app.click({ view: 'result' });
  assert.match(app.markup(), />31<span class="unit"/);
  assert.match(app.markup(), /記録 6H/);
  assert.match(app.markup(), /複数選択 · 記録 5H/);
  assert.match(app.markup(), /3パット以上<\/span><b>1<small>\/ 6H/);
  assert.equal(app.state().holes.filter(h => h.tee === null).length, 12);
  app.click({ view: 'input' });
  app.click({ action: 'direct' });
  app.click({ view: 'result' });
  assert.match(app.markup(), /複数選択 · 記録 4H/);
});

test('legacy data is retained and the preview uses separate storage', () => {
  const holes = Array.from({ length: 18 }, () => ({ par: 4, long: null, short: null, putts: null, obTee: 0, obLater: 0, direct: false }));
  holes[0] = { ...holes[0], long: 2, short: 1, putts: 2 };
  const old = JSON.stringify({ date: '2026-10-28', place: '既存の記録', active: 0, holes });
  const storage = new Map([[normalKey, old]]);
  const preview = openApp({ storage });
  preview.click({ action: 'sample' });
  assert.equal(storage.get(normalKey), old);
  const normal = openApp({ preview: false, storage });
  assert.match(normal.markup(), /既存の記録/);
  normal.click({ tee: 'left' });
  assert.equal(normal.state().holes[0].long, 2);
  assert.equal(normal.state().holes[0].approach, null);
  assert.equal(normal.state().holes[0].tee, 'left');
});

test('notes stay with their hole and reset clears them', () => {
  const app = openApp();
  app.click({ action: 'review' });
  app.click({ tee: 'left' });
  app.click({ approach: 'short' });
  app.click({ action: 'next' });
  assert.equal(app.state().active, 1);
  assert.match(app.markup(), /aria-expanded="false"/);
  app.click({ tee: 'good' });
  app.click({ hole: '0' });
  assert.match(app.markup(), /ティー：左 \/ 50y：ショート/);
  app.click({ action: 'reset' });
  assert.equal(app.state().holes[0].tee, null);
  assert.equal(app.state().holes[1].tee, null);
  assert.equal(app.state().holes[0].approach, null);
});

test('PNG export includes the new trends and stays inside the canvas', () => {
  const app = openApp();
  app.click({ action: 'sample' });
  app.click({ action: 'export' });
  assert.equal(app.canvas.width, 1200);
  assert.equal(app.canvas.height, 1950);
  assert.ok(app.text.includes('ティーショット'));
  assert.ok(app.text.includes('50y以内（複数選択）'));
  assert.ok(app.text.includes('記録 5H'));
  assert.ok(!app.text.some(value => /100切り|目安|スコア＝/.test(value)));
  assert.ok(app.draws.every(({ x, y, font }) => x >= 0 && x <= app.canvas.width && y - Number(font.match(/(\d+)px/)[1]) >= 0 && y + Number(font.match(/(\d+)px/)[1]) * .3 <= app.canvas.height));
});

test('summary stroke components exclude incomplete holes and share the score denominator', () => {
  const app = openApp();
  app.click({ field: 'long', setval: '2' });
  app.click({ field: 'short', setval: '1' });
  app.click({ field: 'putts', setval: '2' });
  app.click({ action: 'next' });
  app.click({ field: 'long', setval: '5' });
  app.click({ view: 'result' });
  assert.match(app.markup(), />5<span class="unit"/);
  assert.match(app.markup(), /50yまで<\/span><b>2<\/b>/);
  assert.match(app.markup(), /50y → ON<\/span><b>1<\/b>/);
  assert.match(app.markup(), /パット<\/span><b>2<\/b>/);
  assert.match(app.markup(), /ボギーオン以内<\/span><b>1<small>\/ 1H/);
});

test('stroke selection can be cleared and zero approach can be corrected directly', () => {
  const app = openApp();
  app.click({ field: 'long', setval: '2' });
  app.click({ field: 'long', setval: '2' });
  assert.equal(app.state().holes[0].long, null);
  app.click({ action: 'direct' });
  assert.equal(app.state().holes[0].short, 0);
  assert.equal(app.state().holes[0].direct, true);
  app.click({ field: 'short', setval: '1' });
  assert.equal(app.state().holes[0].short, 1);
  assert.equal(app.state().holes[0].direct, false);
});

test('contact misses can be combined with direction without inflating recorded-hole counts', () => {
  const app = openApp();
  app.click({ approach: 'fat' });
  app.click({ approach: 'short' });
  assert.deepEqual(app.state().holes[0].approach, ['fat', 'short']);
  app.click({ view: 'result' });
  assert.match(app.markup(), /複数選択 · 記録 1H/);
  const reloaded = openApp({ storage: app.storage });
  assert.match(reloaded.markup(), /50y：ダフリ・ショート/);
});

test('broken individual hole values are sanitized without dropping the round', () => {
  const storage = new Map();
  const app = openApp({ storage });
  app.click({ action: 'sample' });
  const saved = app.state();
  saved.holes[2] = null;
  saved.holes[3].long = -5;
  saved.holes[4].putts = 2.5;
  saved.holes[4].approach = ['unknown'];
  storage.set(previewKey, JSON.stringify(saved));
  const reloaded = openApp({ storage });
  reloaded.click({ tee: 'good' });
  assert.equal(reloaded.state().place, 'サンプルゴルフクラブ');
  assert.equal(reloaded.state().holes[2].long, null);
  assert.equal(reloaded.state().holes[3].long, null);
  assert.equal(reloaded.state().holes[4].putts, null);
  assert.equal(reloaded.state().holes[4].approach, null);
});

test('storage failure is visible instead of claiming the input was saved', () => {
  const app = openApp({ storageFails: true });
  app.click({ field: 'long', setval: '2' });
  assert.match(app.markup(), /save-status error/);
  assert.match(app.markup(), /保存できません/);
});
