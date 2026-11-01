const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const Core = require('../roundnote-core.js');

const normalKey = 'roundnote-golf-v2';
const previewKey = 'roundnote-golf-ui-preview-v2';
const legacyKey = 'roundnote-golf-v1';
const legacyPreviewKey = 'roundnote-golf-ui-preview-v1';
const stamp = '2026-11-01T00:00:00.000Z';
const hole = overrides => ({ ...Core.blankHole(), long: 2, short: 1, putts: 2, ...overrides });
const round = options => Core.newRound({ id: 'round-test', date: '2026-11-01', createdAt: stamp, updatedAt: stamp, ...options });
const completeRound = options => round({ holes: Array.from({ length: 18 }, () => hole()), ...options });
const database = (current, other = [], goals = {}) => ({ schemaVersion: 2, currentRoundId: current.id, goals: { ...Core.DEFAULT_GOALS, ...goals }, rounds: [current, ...other] });
const stored = (value, preview = true) => new Map([[preview ? previewKey : normalKey, JSON.stringify(value)]]);

// Run the real browser handlers and persisted schema, with only the browser surface stubbed.
function openApp({ preview = true, storage = new Map(), storageFails = false, confirmResult = true, navigator: browserNavigator = {}, fileConstructor = require('node:buffer').File } = {}) {
  const handlers = {}, overlayHandlers = {}, nodes = new Map(), canvases = [], downloads = [], blobs = new Map(), prompts = [];
  let document;
  function node(id = '') {
    return { id, innerHTML: '', textContent: '', style: {}, className: '', dataset: {}, value: '', files: [],
      addEventListener(type, listener) { (this.handlers ||= {})[type] = listener; },
      focus() { document.activeElement = this; }, scrollIntoView() {}, contains() { return false; },
      querySelector() { return fallback; }, querySelectorAll() { return []; },
      replaceChildren() { this.innerHTML = ''; }, appendChild() {}, remove() {},
      click() { if (this.tagName === 'A') downloads.push({ href: this.href, filename: this.download }); },
      checkValidity() { return true; }, reportValidity() { return true; },
    };
  }
  const fallback = node();
  const app = node('app'), overlay = node('overlay-root');
  app.addEventListener = (type, listener) => { handlers[type] = listener; };
  overlay.addEventListener = (type, listener) => { overlayHandlers[type] = listener; };
  function makeCanvas() {
    const canvas = { width: 0, height: 0, text: [], draws: [], fills: [] };
    let rectangle;
    const context2d = new Proxy({
      fillText(value, x, y, maxWidth) { canvas.text.push(String(value)); canvas.draws.push({ value: String(value), x, y, maxWidth, font: context2d.font, color: context2d.fillStyle }); },
      fillRect(x, y, width, height) { canvas.fills.push({ x, y, width, height, color: context2d.fillStyle }); },
      beginPath() { rectangle = null; },
      roundRect(x, y, width, height) { rectangle = { x, y, width, height }; },
      fill() { if (rectangle) canvas.fills.push({ ...rectangle, color: context2d.fillStyle }); },
      measureText(value) { const size = Number(String(context2d.font).match(/(\d+)px/)?.[1] || 20); return { width: String(value).length * size * .55 }; },
    }, { get: (target, key) => target[key] || (() => {}) });
    canvas.getContext = () => context2d;
    canvas.toDataURL = () => `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, canvases.indexOf(canvas)]).toString('base64')}`;
    canvases.push(canvas);
    return canvas;
  }
  document = {
    activeElement: null, body: { style: { overflow: '' }, appendChild() {} },
    getElementById(id) { if (id === 'app') return app; if (id === 'overlay-root') return overlay; if (!nodes.has(id)) nodes.set(id, node(id)); return nodes.get(id); },
    querySelector() { return fallback; }, querySelectorAll() { return []; },
    createElement(tag) { if (tag === 'canvas') return makeCanvas(); const created = node(); created.tagName = tag.toUpperCase(); return created; },
  };
  class TestURL extends URL {
    static createObjectURL(blob) { const key = `blob:roundnote-${blobs.size}`; blobs.set(key, blob); return key; }
    static revokeObjectURL() {}
  }
  const context = {
    document, RoundnoteCore: Core,
    localStorage: { getItem: key => storage.get(key), setItem(key, value) { if (storageFails) throw new Error('Quota exceeded'); storage.set(key, value); } },
    location: { search: preview ? '?preview=1' : '', protocol: 'http:' },
    URLSearchParams, URL: TestURL, Blob, File: fileConstructor, atob: value => Buffer.from(value, 'base64').toString('binary'), navigator: browserNavigator, window: { scrollTo() {} },
    confirm(message) { prompts.push(message); return confirmResult; },
    alert(message) { prompts.push(message); },
    setTimeout: fn => { fn(); return 1; }, clearTimeout() {},
  };
  vm.runInNewContext(readFileSync(join(__dirname, '../app.js'), 'utf8'), context);
  function persisted() { const value = storage.get(preview ? previewKey : normalKey); return value ? JSON.parse(value) : null; }
  return {
    click: dataset => handlers.click({ target: { closest: () => ({ dataset }) }, preventDefault() {} }),
    overlayClick: dataset => overlayHandlers.click?.({ target: { closest: () => ({ dataset }) } }),
    input: target => handlers.input({ target }),
    change: target => handlers.change?.({ target }),
    async import(value, size) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return handlers.change?.({ target: { id: 'import-file', value: 'backup.json', files: [{ size: size ?? Buffer.byteLength(text), text: async () => text }] } });
    },
    markup: () => app.innerHTML, overlayMarkup: () => overlay.innerHTML,
    database: persisted,
    state() { const db = persisted(); return db?.rounds.find(r => r.id === db.currentRoundId); },
    downloadedText: async () => blobs.get(downloads.at(-1)?.href).text(),
    downloadedJSON: async () => JSON.parse(await blobs.get(downloads.at(-1)?.href).text()),
    canvases, downloads, prompts, storage, nodes, document,
  };
}
function selectScore(app, values = { long: 2, short: 1, putts: 2 }) {
  for (const [field, value] of Object.entries(values)) app.click({ field, setval: String(value) });
}
function assertNoRoundTotals(markup) {
  assert.doesNotMatch(markup, /class="result-hero"|class="result-score"|class="half-head"|class="comparison-table"/);
  assert.doesNotMatch(markup, /100切りまで|トータル|総スコア<\/|目標と実績/);
}

function teeChartRound() {
  const clubs = [['driver', [[1, 1], [4, 0], [1, 2]]], ['wood_ut', [[1, 0], [2, 0], [0, 1]]],
    ['iron', [[0, 0], [3, 0], [1, 0]]], ['wedge', [[0, 0], [1, 0], [0, 0]]]];
  const holes = [];
  for (const [teeClub, directions] of clubs) directions.forEach((counts, i) => counts.forEach((n, ob) => {
    for (let j = 0; j < n; j++) holes.push(hole({ teeClub, tee: ['left', 'straight', 'right'][i], obTee: ob ? 2 : 0 }));
  }));
  return completeRound({ finished: true, holes });
}

test('tee club filters update one chart with a fixed scale without editing the saved round', () => {
  const app = openApp({ storage: stored(database(teeChartRound())) }); app.click({ view: 'result' });
  const original = app.storage.get(previewKey);
  assert.match(app.markup(), /対象 18H/); assert.match(app.markup(), /data-axis-max="10"/);
  for (const key of ['wood_ut', 'iron', 'wedge']) app.click({ teeFilter: key });
  assert.match(app.markup(), /対象 9H/); assert.match(app.markup(), /data-axis-max="10"/);
  assert.doesNotMatch(app.markup(), /data-tee-segment="(?:wood_ut|iron|wedge)"/);
  assert.match(app.markup(), /data-tee-filter="driver" aria-pressed="true"/);
  assert.match(app.markup(), /data-tee-filter="wood_ut" aria-pressed="false"/);
  assert.equal((app.markup().match(/id="tee-chart-title"/g) || []).length, 1);
  app.click({ teeFilter: 'wood_ut' }); assert.match(app.markup(), /対象 13H/);
  app.click({ teeFilter: 'all' }); assert.match(app.markup(), /対象 18H/);
  for (const key of Object.keys(Core.CLUBS)) app.click({ teeFilter: key });
  assert.match(app.markup(), /表示するクラブを選択してください/);
  assert.doesNotMatch(app.markup(), /data-tee-segment=/);
  assert.equal(app.storage.get(previewKey), original);
  app.click({ teeFilter: 'all' }); assert.match(app.markup(), /対象 18H/);
});

test('tee filters persist across result scope changes and reset when switching rounds', () => {
  const first = teeChartRound(), second = completeRound({ id: 'other-round', finished: true });
  const app = openApp({ storage: stored(database(first, [second])) }); app.click({ view: 'result' });
  for (const key of ['wood_ut', 'iron', 'wedge']) app.click({ teeFilter: key });
  app.click({ scope: 'out' }); assert.match(app.markup(), /対象 9H/);
  app.click({ round: 'other-round' });
  assert.match(app.markup(), /data-tee-filter="all"[^>]*aria-pressed="true"/);
  assert.match(app.markup(), /選択したクラブの方向記録はありません/);
  app.click({ round: first.id }); assert.match(app.markup(), /対象 18H/);
});

test('tee chart keeps unknown clubs visible and explains missing directions', () => {
  const holes = [hole({ tee: 'left', obTee: 2 }), hole({ teeClub: 'driver', tee: 'right', obLater: 2 }),
    hole({ teeClub: 'driver', obTee: 1 }), ...Array.from({ length: 15 }, () => Core.blankHole())];
  const app = openApp({ storage: stored(database(completeRound({ finished: true, holes }))) }); app.click({ view: 'result' });
  assert.match(app.markup(), /data-tee-segment="unknown" data-direction="left" data-ob="true" data-count="1"/);
  assert.match(app.markup(), /data-tee-segment="driver" data-direction="right" data-ob="false" data-count="1"/);
  assert.match(app.markup(), /クラブ未記録 1Hを灰色で表示/);
  assert.match(app.markup(), /方向未記録 1H（うちOBあり1H）/);
  for (const key of ['wood_ut', 'iron', 'wedge']) app.click({ teeFilter: key });
  assert.match(app.markup(), /クラブ未記録 1Hは「すべて」で表示/);
  assert.doesNotMatch(app.markup(), /data-tee-segment="unknown"/);
});

test('scorecard PNG exports the current club filter and the same tee-OB hole totals', () => {
  const app = openApp({ storage: stored(database(teeChartRound())) }); app.click({ view: 'result' });
  for (const key of ['wood_ut', 'iron', 'wedge']) app.click({ teeFilter: key });
  app.click({ action: 'export' });
  const canvas = app.canvases[1];
  const textAt = (x, y) => canvas.draws.find(draw => draw.x === x && draw.y === y)?.value;
  assert.equal(textAt(564, 1323), '対象 9H');
  assert.deepEqual([1441, 1479, 1517].map(y => textAt(564, y)), ['2H', '4H', '3H']);
  assert.deepEqual([1460, 1498, 1536].map(y => textAt(564, y)), ['OB 1H', 'OB 0H', 'OB 2H']);
  const chartFills = canvas.fills.filter(fill => fill.y >= 1424 && fill.y <= 1500 && fill.height === 22);
  assert.ok(chartFills.length > 0); assert.ok(chartFills.every(fill => fill.color === '#2d6950'));
});

// Input rules and corrections.
test('course labels persist per round, safely render across results and PNGs, and restore from JSON', async () => {
  const app = openApp({ storage: stored(database(completeRound())) });
  app.input({ dataset: { course: '0' }, value: 'IN' });
  app.input({ dataset: { course: '1' }, value: 'OUT' });
  assert.deepEqual(app.state().courseNames, ['IN', 'OUT']);
  app.input({ dataset: { course: '0' }, value: '東 <&>' });
  app.input({ dataset: { course: '1' }, value: '西' });
  assert.equal(app.nodes.get('current-course').textContent, '東 <&>');
  const reloaded = openApp({ storage: app.storage });
  assert.match(reloaded.markup(), /東 &lt;&amp;&gt;/);
  reloaded.click({ hole: '9' }); assert.match(reloaded.markup(), /id="current-course">西</);
  reloaded.click({ action: 'finish' });
  for (const scope of ['all', 'out', 'in']) {
    reloaded.click({ scope });
    assert.match(reloaded.markup(), /data-scope="out"[^>]*>東 &lt;&amp;&gt;</);
    assert.match(reloaded.markup(), /data-scope="in"[^>]*>西</);
    assert.doesNotMatch(reloaded.markup(), /data-metric="long"/);
  }
  reloaded.click({ action: 'export' });
  for (const canvas of reloaded.canvases) {
    assert.ok(canvas.text.some(value => value.includes('東 <&>')));
    assert.ok(canvas.text.some(value => value.includes('西')));
  }
  assert.ok(!reloaded.canvases[0].text.includes('50yまでの打数'));
  reloaded.click({ action: 'export-json' });
  const backup = await reloaded.downloadedJSON();
  const restored = openApp(); await restored.import(backup);
  assert.deepEqual(restored.state().courseNames, ['東 <&>', '西']);
  reloaded.click({ action: 'new-round' });
  assert.deepEqual(reloaded.state().courseNames, ['OUT', 'IN']);
  assert.deepEqual(reloaded.database().rounds.find(r => r.id === backup.currentRoundId).courseNames, ['東 <&>', '西']);
});

test('results explain full-history JSON backups and export all rounds from the result screen', async () => {
  const older = completeRound({ id: 'round-older', finished: true });
  const app = openApp({ storage: stored(database(completeRound({ finished: true }), [older], { long: 40 })) });
  app.click({ view: 'result' });
  assert.match(app.markup(), /記録のバックアップ/);
  assert.match(app.markup(), /全ラウンドと目標設定/);
  assert.match(app.markup(), /最新版1つ/);
  app.click({ action: 'export-json' });
  assert.equal((await app.downloadedJSON()).rounds.length, 2);
  app.click({ action: 'goals' });
  assert.doesNotMatch(app.markup(), /data-goal="long"|data-metric="long"/);
  assert.match(app.markup(), /matrix-label">50yまで/);
  app.click({ action: 'resume' });
  assertNoRoundTotals(app.markup());
  assert.doesNotMatch(app.markup(), /result-backup/);
});

test('tee directions render left-straight-right and a single optional club survives reload and JSON', async () => {
  const app = openApp();
  app.click({ action: 'review' });
  const markup = app.markup();
  assert.ok(markup.indexOf('data-tee="left"') < markup.indexOf('data-tee="straight"'));
  assert.ok(markup.indexOf('data-tee="straight"') < markup.indexOf('data-tee="right"'));
  for (const teeClub of ['driver', 'wood_ut', 'iron', 'wedge']) {
    app.click({ teeClub });
    assert.equal(app.state().holes[0].teeClub, teeClub);
  }
  app.click({ tee: 'left' }); app.click({ teeShort: '' });
  const reloaded = openApp({ storage: app.storage });
  assert.equal(reloaded.state().holes[0].teeClub, 'wedge');
  assert.match(reloaded.markup(), /ウェッジ/);
  reloaded.click({ action: 'export-json' });
  assert.equal((await reloaded.downloadedJSON()).rounds[0].holes[0].teeClub, 'wedge');
  reloaded.click({ teeClub: 'wedge' });
  assert.equal(reloaded.state().holes[0].teeClub, null);
  assert.equal(reloaded.state().holes[0].tee, 'left');
  assert.equal(reloaded.state().holes[0].teeShort, true);
  reloaded.click({ teeClub: 'driver' }); reloaded.click({ action: 'clear-review' });
  assert.equal(reloaded.state().holes[0].teeClub, null);
});
test('tee directions are exclusive while short is independent, including short by itself', () => {
  const app = openApp();
  app.click({ teeShort: '' });
  assert.equal(app.state().holes[0].teeShort, true);
  assert.equal(app.state().holes[0].tee, null);
  app.click({ tee: 'left' });
  assert.equal(app.state().holes[0].tee, 'left');
  assert.equal(app.state().holes[0].teeShort, true);
  app.click({ tee: 'straight' });
  assert.equal(app.state().holes[0].tee, 'straight');
  assert.equal(app.state().holes[0].teeShort, true);
  app.click({ tee: 'right' });
  assert.equal(app.state().holes[0].tee, 'right');
  app.click({ tee: 'right' });
  assert.equal(app.state().holes[0].tee, null);
  assert.equal(app.state().holes[0].teeShort, true);
  app.click({ teeShort: '' });
  assert.equal(app.state().holes[0].teeShort, false);
});

test('tee short, direction, and approach notes survive reload without becoming OB', () => {
  const app = openApp();
  app.click({ tee: 'left' }); app.click({ teeShort: '' });
  app.click({ approach: 'short' }); app.click({ approach: 'fat' });
  const reloaded = openApp({ storage: app.storage });
  reloaded.click({ action: 'review' });
  assert.equal(reloaded.state().holes[0].tee, 'left');
  assert.equal(reloaded.state().holes[0].teeShort, true);
  assert.deepEqual(reloaded.state().holes[0].approach, ['short', 'fat']);
  assert.equal(reloaded.state().holes[0].obTee, 0);
  assert.match(reloaded.markup(), /まっすぐ/);
  assert.doesNotMatch(reloaded.markup(), /狙いどおり|ドクロ/);
});

test('OB counts remain separate from strokes and keep the two existing labels', () => {
  const app = openApp(); selectScore(app);
  app.click({ field: 'obTee', step: '1' }); app.click({ field: 'obLater', step: '1' });
  const h = app.state().holes[0];
  assert.equal(Core.score(h), 5);
  assert.equal(h.obTee + h.obLater, 2);
  assert.match(app.markup(), /class="ob-row"><span>ティーショット/);
  assert.match(app.markup(), /class="ob-row"><span>2打目以降/);
  assertNoRoundTotals(app.markup());
});

test('selected strokes can be cleared and direct ON can be corrected without unlocking a disabled field', () => {
  const app = openApp();
  app.click({ field: 'long', setval: '2' }); app.click({ field: 'long', setval: '2' });
  assert.equal(app.state().holes[0].long, null);
  app.click({ action: 'direct' });
  assert.equal(app.state().holes[0].short, 0);
  assert.equal(app.state().holes[0].direct, true);
  app.click({ field: 'short', setval: '1' });
  assert.equal(app.state().holes[0].short, 1);
  assert.equal(app.state().holes[0].direct, false);
});

// No accidental aggregate score exposure before an explicit round-end action.
test('even 18 complete holes stay hidden until the user explicitly ends the round', () => {
  const fixture = completeRound({ finished: false });
  const app = openApp({ storage: stored(database(fixture)) });
  assertNoRoundTotals(app.markup());
  app.click({ view: 'result' });
  assertNoRoundTotals(app.markup());
  assert.match(app.markup(), /ラウンド.*終了|終了.*集計/);
  app.click({ action: 'export' });
  assert.equal(app.canvases.length, 0);
  app.click({ action: 'finish' });
  assert.equal(app.state().finished, true);
  assert.match(app.markup(), /class="result-hero"/);
  assert.match(app.markup(), />90<span class="unit"/);
});

test('reload, the hole picker, history, and the result gate do not leak a playing round total', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: false }))) });
  for (const action of [{ action: 'holes' }, { view: 'history' }, { view: 'input' }, { view: 'result' }]) {
    app.click(action); assertNoRoundTotals(app.markup());
  }
  const reloaded = openApp({ storage: app.storage });
  assertNoRoundTotals(reloaded.markup());
  reloaded.click({ action: 'goals' });
  assertNoRoundTotals(reloaded.markup());
});

test('resuming a finished round hides its aggregate score again', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))) });
  app.click({ view: 'result' });
  assert.match(app.markup(), /class="result-hero"/);
  app.click({ action: 'resume' });
  assert.equal(app.state().finished, false);
  assertNoRoundTotals(app.markup());
  app.click({ view: 'result' });
  assertNoRoundTotals(app.markup());
});

test('the last-hole next button explicitly finishes the round instead of revealing totals earlier', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: false, active: 17 }))) });
  assertNoRoundTotals(app.markup());
  app.click({ action: 'next' });
  assert.equal(app.state().finished, true);
  assert.match(app.markup(), /class="result-hero"/);
});

test('partial round completion requires confirmation and leaves absolute goal differences ineligible', () => {
  const partial = round({ holes: [hole(), ...Array.from({ length: 17 }, Core.blankHole)] });
  const cancelled = openApp({ storage: stored(database(partial)), confirmResult: false });
  cancelled.click({ action: 'finish' });
  assert.equal(cancelled.state().finished, false);
  assertNoRoundTotals(cancelled.markup());
  const app = openApp({ storage: stored(database(partial)) });
  app.click({ action: 'finish' });
  assert.equal(app.state().finished, true);
  assert.ok(app.prompts.some(p => /未入力|18H|18ホール|1\/18/.test(p)));
  assert.match(app.markup(), /入力不足|対象外|比較なし|未完了/);
});

// Analysis denominators and saved target settings.
test('direct ON is excluded from approach failure attempts and all-direct rounds say no eligible attempts', () => {
  const allDirect = completeRound({ finished: true, holes: Array.from({ length: 18 }, () => hole({ short: 0, direct: true })) });
  const app = openApp({ storage: stored(database(allDirect)) }); app.click({ view: 'result' });
  assert.match(app.markup(), /対象なし/);
  assert.match(app.markup(), /直接ON/);
  const mixed = completeRound({ finished: true, holes: [hole({ short: 2 }), hole({ short: 1 }), ...Array.from({ length: 16 }, () => hole({ short: 0, direct: true }))] });
  const other = openApp({ storage: stored(database(mixed)) }); other.click({ view: 'result' });
  assert.match(other.markup(), /ミス\s*1回\s*\/\s*対象\s*2回/);
  assert.match(other.markup(), /50(?:\.0)?%/);
});

test('target settings persist independently and zero is accepted as a target', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))) }); app.click({ view: 'result' });
  app.click({ action: 'goals' });
  for (const [goal, value] of Object.entries({ score: 95, ob: 0, approachRate: 25, putts: 34, bogeyOnHoles: 14 })) app.input({ dataset: { goal }, value: String(value), valueAsNumber: value });
  app.click({ action: 'save-goals' });
  assert.deepEqual(app.database().goals, { score: 95, ob: 0, approachRate: 25, putts: 34, bogeyOnHoles: 14 });
  const reloaded = openApp({ storage: app.storage }); reloaded.click({ view: 'result' });
  assert.match(reloaded.markup(), /95打|95<\/|95 <\/|95.*以下/);
  assert.equal(reloaded.database().goals.ob, 0);
});

test('invalid target input is rejected instead of silently resetting another saved target', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: true }), [], { score: 95 })) });
  app.click({ view: 'result' }); app.click({ action: 'goals' });
  app.input({ dataset: { goal: 'approachRate' }, value: '120', valueAsNumber: 120 });
  app.click({ action: 'save-goals' });
  assert.equal(app.database().goals.score, 95);
  assert.equal(app.database().goals.approachRate, 30);
  assert.match(app.markup(), /目標.*確認|不正|0.*100|範囲/);
});

test('OUT and IN comparisons can be switched without changing the current score or target settings', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))) }); app.click({ view: 'result' });
  const before = app.database();
  app.click({ scope: 'out' }); assert.match(app.markup(), /OUT/);
  app.click({ scope: 'in' }); assert.match(app.markup(), /IN/);
  app.click({ scope: 'all' });
  assert.deepEqual(app.database().goals, before.goals);
  assert.deepEqual(app.state().holes, before.rounds[0].holes);
});

test('comparison colors reverse correctly for bogey-on rate while lower totals and failure rates stay favorable', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))) });
  app.click({ view: 'result' });
  const row = key => app.markup().match(new RegExp(`<tr data-metric="${key}">([\\s\\S]*?)<\\/tr>`))?.[1];
  assert.match(row('score'), /class="good">-9打/);
  assert.match(row('approachRate'), /class="good">-30pt/);
  assert.match(row('bogeyRate'), /class="good">\+33\.3pt/);
  const poor = completeRound({ finished: true, holes: Array.from({ length: 18 }, () => hole({ long: 3, short: 2, putts: 3 })) });
  const other = openApp({ storage: stored(database(poor)) }); other.click({ view: 'result' });
  for (const key of ['score', 'approachRate', 'bogeyRate']) {
    const actual = other.markup().match(new RegExp(`<tr data-metric="${key}">([\\s\\S]*?)<\\/tr>`))?.[1];
    assert.match(actual, /class="bad"/);
  }
});

test('independent component goals never recalculate the total score target', () => {
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))) });
  app.click({ view: 'result' }); app.click({ action: 'goals' });
  app.input({ dataset: { goal: 'long' }, value: '50', valueAsNumber: 50 });
  app.input({ dataset: { goal: 'putts' }, value: '50', valueAsNumber: 50 });
  app.click({ action: 'save-goals' });
  assert.equal(app.database().goals.score, 99);
  assert.equal(app.database().goals.long, undefined);
  assert.equal(app.database().goals.putts, 50);
});

// History and backup round trips.
test('starting another round archives prior details and stable IDs without erasing them', () => {
  const app = openApp(); selectScore(app); app.click({ tee: 'left' }); app.click({ teeShort: '' });
  const old = app.state();
  app.click({ action: 'new-round' });
  assert.equal(app.database().rounds.length, 2);
  assert.notEqual(app.state().id, old.id);
  const archived = app.database().rounds.find(r => r.id === old.id);
  assert.deepEqual(archived.holes, old.holes);
  assert.equal(app.state().holes[0].long, null);
  app.click({ view: 'history' });
  assertNoRoundTotals(app.markup());
  app.click({ round: old.id });
  assert.equal(app.state().id, old.id);
  assert.equal(app.state().holes[0].teeShort, true);
  assertNoRoundTotals(app.markup());
});

test('legacy records migrate without rewriting the original key or mixing preview and real data', () => {
  const legacy = { date: '2026-10-28', place: '以前の記録', active: 0, holes: Array.from({ length: 18 }, Core.blankHole) };
  legacy.holes[0] = { ...hole(), tee: 'good' }; delete legacy.holes[0].teeShort;
  const original = JSON.stringify(legacy), storage = new Map([[legacyKey, original]]);
  const preview = openApp({ storage }); preview.click({ tee: 'right' });
  assert.equal(storage.get(legacyKey), original);
  assert.equal(storage.has(normalKey), false);
  const app = openApp({ preview: false, storage }); app.click({ action: 'review' }); app.click({ teeShort: '' });
  assert.equal(app.state().holes[0].tee, 'straight');
  assert.equal(app.state().holes[0].long, 2);
  assert.equal(app.state().place, '以前の記録');
  assert.equal(storage.get(legacyKey), original);
});

test('JSON backup contains the schema, every round, goals, and individual zero versus null values', async () => {
  const app = openApp(); selectScore(app, { long: 1, short: 0, putts: 0 });
  app.click({ action: 'new-round' }); app.click({ action: 'export-json' });
  assert.equal(app.downloads.length, 1);
  assert.match(app.downloads[0].filename, /\.json$/);
  const exported = await app.downloadedJSON();
  assert.equal(exported.schemaVersion, 2);
  assert.equal(exported.rounds.length, 2);
  assert.equal(exported.rounds[0].holes[0].short, 0);
  assert.equal(exported.rounds[0].holes[0].putts, 0);
  assert.equal(exported.rounds[1].holes[0].short, null);
  assert.equal(exported.goals.score, 99);
  assert.doesNotThrow(() => Core.validateImport(exported));
});

test('JSON restore adds missing round IDs and updates newer records once, preserving active user data and goals', async () => {
  const current = round({ id: 'round-local', place: 'ローカル', holes: [hole(), ...Array.from({ length: 17 }, Core.blankHole)] });
  const incoming = completeRound({ id: 'round-imported', finished: true, place: '取込先', updatedAt: '2099-01-01T00:00:00.000Z' });
  const app = openApp({ storage: stored(database(current, [], { score: 95 })) });
  await app.import(database(incoming, [], { score: 90 }));
  assert.equal(app.database().rounds.length, 2);
  assert.equal(app.state().id, current.id);
  assert.equal(app.database().goals.score, 95);
  incoming.place = '更新後'; incoming.updatedAt = '2099-02-01T00:00:00.000Z';
  await app.import(database(incoming)); await app.import(database(incoming));
  assert.equal(app.database().rounds.length, 2);
  assert.equal(app.database().rounds.find(r => r.id === incoming.id).place, '更新後');
});

test('equal update instants retain existing round contents even when the timestamp text uses another timezone', async () => {
  const current = completeRound({ finished: true, place: '保持するコース', updatedAt: '2026-11-01T00:00:00.000Z' });
  const incoming = completeRound({ finished: true, place: '同日時の別内容', updatedAt: '2026-11-01T09:00:00+09:00', holes: Array.from({ length: 18 }, () => hole({ putts: 3 })) });
  const app = openApp({ storage: stored(database(current, [], { score: 95 })) });
  await app.import(database(incoming, [], { score: 90 }));
  assert.equal(app.database().rounds.length, 1);
  assert.equal(app.state().place, '保持するコース');
  assert.equal(app.state().holes[0].putts, 2);
  assert.equal(app.database().goals.score, 95);
  await app.import(database(incoming));
  assert.equal(app.database().rounds.length, 1);
  assert.equal(app.state().place, '保持するコース');
});

test('malformed, future, and oversized imports leave persisted records unchanged', async () => {
  const db = database(round({ place: '保持する記録' }));
  const app = openApp({ storage: stored(db) });
  const original = JSON.stringify(app.database());
  for (const [input, size] of [['{bad'], [{ ...db, schemaVersion: 999 }], [JSON.stringify(db), 30 * 1024 * 1024]]) {
    await app.import(input, size);
    assert.equal(JSON.stringify(app.database()), original);
    assert.match(app.markup(), /JSON|形式|バージョン|大き|サイズ|MB|読み込|読込/);
  }
});

test('a storage-full restore does not replace the in-memory current round', async () => {
  const current = round({ id: 'round-still-here', place: '保持する記録' });
  const app = openApp({ storage: stored(database(current)), storageFails: true });
  await app.import(database(completeRound({ id: 'round-incoming', finished: true })));
  assert.equal(app.state().id, current.id);
  assert.equal(app.database().rounds.length, 1);
  assert.match(app.markup(), /保存できません|保存.*失敗|復元できません|容量/);
  assert.match(app.markup(), /保持する記録/);
});

test('unreadable existing v2 storage is never silently filtered or overwritten and can be backed up byte for byte', async () => {
  const malformed = database(completeRound({ finished: true }), [round({ id: 'round-broken', holes: [] })]);
  malformed.rounds[1].holes = [];
  const future = { ...database(round({ place: '将来バージョンの記録' })), schemaVersion: 999 };
  const originals = [' \n' + JSON.stringify(malformed, null, 2) + '\n', JSON.stringify(future), '{"schemaVersion":2,"rounds":['];
  for (const original of originals) {
    const storage = new Map([[previewKey, original]]);
    const app = openApp({ storage });
    assert.match(app.markup(), /読み込めません|読込.*失敗|元の記録|上書き/);
    assert.equal(storage.get(previewKey), original);
    app.click({ field: 'long', setval: '3' });
    app.click({ action: 'new-round' });
    assert.equal(storage.get(previewKey), original);
    assert.match(app.markup(), /保存できません|開始できません/);
    app.click({ action: 'export-json' });
    assert.match(app.downloads.at(-1).filename, /recovery.*\.json$/);
    assert.equal(await app.downloadedText(), original);
    assert.match(app.markup(), /未検証|検証していない|復旧用|元データ/);
    assert.equal(storage.get(previewKey), original);
  }
});

test('save failure is visible instead of claiming the newest edit was persisted', () => {
  const app = openApp({ storageFails: true });
  app.click({ field: 'long', setval: '2' });
  assert.match(app.markup(), /保存できません|保存.*失敗/);
});

test('a failed save blocks starting a new round and JSON can still preserve the unsaved edit', async () => {
  const current = round({ place: '保存容量のテスト' });
  const app = openApp({ storage: stored(database(current)), storageFails: true });
  app.click({ field: 'long', setval: '3' });
  app.click({ action: 'new-round' });
  assert.equal(app.database().rounds.length, 1);
  assert.equal(app.state().id, current.id);
  assert.match(app.markup(), /開始できません|保存できません/);
  app.click({ action: 'export-json' });
  assert.equal((await app.downloadedJSON()).rounds[0].holes[0].long, 3);
});

test('successive edits advance a future update timestamp and remain newer across JSON backup and restore', async () => {
  const future = '2099-01-01T00:00:00.000Z';
  const original = database(round({ id: 'round-future-clock', place: '時計のずれ', updatedAt: future }));
  const app = openApp({ storage: stored(original) });
  app.click({ field: 'long', setval: '1' });
  const first = app.state().updatedAt;
  app.click({ field: 'long', setval: '2' });
  const second = app.state().updatedAt;
  assert.ok(Date.parse(first) > Date.parse(future));
  assert.ok(Date.parse(second) > Date.parse(first));
  app.click({ action: 'export-json' });
  const backup = await app.downloadedJSON();
  assert.equal(backup.rounds[0].updatedAt, second);
  const restored = openApp({ storage: stored(original) });
  await restored.import(backup);
  assert.equal(restored.database().rounds.length, 1);
  assert.equal(restored.state().holes[0].long, 2);
  assert.equal(restored.state().updatedAt, second);
  await restored.import(original);
  assert.equal(restored.database().rounds.length, 1);
  assert.equal(restored.state().holes[0].long, 2);
  assert.equal(restored.state().updatedAt, second);
});

test('the 2000-round limit blocks a new round without changing the current selection or existing records', () => {
  const current = round({ id: 'round-cap-current', place: '上限でも保持する記録' });
  const others = Array.from({ length: 1999 }, (_, i) => round({ id: `round-cap-${i}` }));
  const original = database(current, others);
  const app = openApp({ storage: stored(original) });
  app.click({ action: 'new-round' });
  assert.equal(app.database().rounds.length, 2000);
  assert.equal(app.state().id, current.id);
  assert.equal(app.state().place, current.place);
  assert.deepEqual(app.state().holes, current.holes);
  assert.deepEqual(app.database().rounds.map(r => r.id), original.rounds.map(r => r.id));
  assert.match(app.markup(), /2000件|保存上限/);
});

// Keep two readable PNG pages, rather than squeezing analysis into the original scorecard.
test('scorecard process highlights agree on screen and PNG at scoring and OB-adjusted boundaries', () => {
  const cases = [
    [hole(), []],
    [hole({ long: 3 }), ['long', 'score']],
    [hole({ short: 2 }), ['short', 'score']],
    [hole({ putts: 3 }), ['putts', 'score']],
    [hole({ long: 4, obTee: 1 }), ['ob', 'score']],
    [hole({ long: 5, obLater: 1 }), ['long', 'ob', 'score']],
    [hole({ long: 6, obTee: 1, obLater: 1 }), ['ob', 'score']],
    [hole({ long: 7, obTee: 1, obLater: 1 }), ['long', 'ob', 'score']],
    [hole({ par: 3, long: 1 }), []],
    [hole({ par: 3, long: 2 }), ['long', 'score']],
    [hole({ par: 5, long: 3 }), []],
    [hole({ par: 5, long: 4 }), ['long', 'score']],
    [hole({ direct: true, long: 3, short: 0 }), []],
    [hole({ direct: true, long: 4, short: 0 }), ['long', 'score']],
    [Core.blankHole(), []],
    [hole({ long: null, short: 2, putts: 3, obLater: 1 }), ['short', 'putts', 'ob']],
    [hole({ long: 0, short: 0, putts: 0 }), []],
    [hole({ par: 3, direct: true, long: 3, short: 0, putts: 0 }), ['long']],
  ];
  const fixture = completeRound({ finished: true, holes: cases.map(([h]) => h) });
  const app = openApp({ storage: stored(database(fixture)) });
  app.click({ view: 'result' });
  const halves = app.markup().split('<div class="matrix">').slice(1);
  app.click({ action: 'export' });
  const png = app.canvases[1];
  const fields = [['long', '50yまで', 2], ['short', '50y→ON', 3], ['putts', 'パット', 4], ['score', 'スコア', 5], ['ob', 'OB', 6]];
  fields.forEach(([field, label, rowIndex]) => {
    const screenCells = halves.flatMap(half => {
      const row = half.split(`<div class="matrix-label">${label}</div>`)[1].split('<div class="matrix-label">')[0];
      return [...row.matchAll(/<div class="matrix-cell ([^"]*)">([^<]*)<\/div>/g)];
    });
    assert.equal(screenCells.length, 18);
    cases.forEach(([h, warnings], i) => {
      const expected = warnings.includes(field);
      const triple = field === 'score' && expected && h.long + h.short + h.putts >= h.par + 3;
      const classes = screenCells[i][1].split(/\s+/);
      assert.equal(classes.includes('bad'), expected && !triple, `${i + 1}H ${label} screen orange`);
      assert.equal(classes.includes('triple'), triple, `${i + 1}H ${label} screen purple`);
      const x = 257 + (i % 9) * 98, y = (i < 9 ? 350 : 820) + 70 + rowIndex * 32 + 24;
      const draw = png.draws.find(draw => draw.x === x && draw.y === y);
      assert.ok(draw, `${i + 1}H ${label} PNG cell exists`);
      assert.equal(draw.value, screenCells[i][2], `${i + 1}H ${label} value unchanged`);
      assert.equal(draw.color === '#946238', expected && !triple, `${i + 1}H ${label} PNG orange text`);
      assert.equal(draw.color === '#70419a', triple, `${i + 1}H ${label} PNG purple text`);
      const background = png.fills.find(fill => fill.x === x - 46 && fill.y === y - 24 && ['#f9eee2', '#eee6f7'].includes(fill.color));
      assert.equal(!!background, expected, `${i + 1}H ${label} PNG background`);
      if (expected) assert.equal(background.color, triple ? '#eee6f7' : '#f9eee2');
    });
  });
  assert.deepEqual(app.state().holes, fixture.holes);
});

test('scores use orange for double bogey and purple for triple or worse across Par 3, 4 and 5', () => {
  const cases = [3, 4, 5].flatMap(par => [0, 1, 2, 3, 4, null].map(relative => ({
    h: hole({ par, long: par - 1, short: 1, putts: relative }),
    tone: relative === null || relative <= 1 ? '' : relative === 2 ? 'bad' : 'triple',
  })));
  const fixture = completeRound({ finished: true, holes: cases.map(({ h }) => h) });
  const app = openApp({ storage: stored(database(fixture)) });
  app.click({ view: 'result' });
  const cells = [...app.markup().matchAll(/<div class="matrix-cell score ([^"]*)">([^<]*)<\/div>/g)];
  assert.equal(cells.length, 18);
  app.click({ action: 'export' });
  const png = app.canvases[1];
  cases.forEach(({ h, tone }, i) => {
    const classes = cells[i][1].split(/\s+/);
    assert.equal(classes.includes('bad'), tone === 'bad', `${i + 1}H double bogey`);
    assert.equal(classes.includes('triple'), tone === 'triple', `${i + 1}H triple or worse`);
    const draw = png.draws.find(draw => draw.x === 257 + (i % 9) * 98 && draw.y === (i < 9 ? 350 : 820) + 254);
    assert.equal(draw.color, tone === 'triple' ? '#70419a' : tone === 'bad' ? '#946238' : '#256344');
    assert.equal(draw.value, h.putts === null ? '—' : String(h.par + h.putts));
  });
});

test('native image save passes a prepared PNG file directly from the tap, with no URL or text', async () => {
  const shared = [];
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))), navigator: {
    canShare: ({ files }) => files.length === 1 && files[0].type === 'image/png',
    share: data => { shared.push(data); return Promise.resolve(); },
  } });
  app.click({ view: 'result' }); app.click({ action: 'export' });
  assert.equal(shared.length, 0, 'preview opening does not send anything');
  assert.match(app.overlayMarkup(), /保存メニューを開く/);
  assert.match(app.overlayMarkup(), /画像を保存/);
  assert.match(app.overlayMarkup(), /PNGをダウンロード/);
  for (const index of [0, 1]) {
    const pending = app.overlayClick({ saveImage: String(index) });
    assert.equal(shared.length, index + 1, 'share starts synchronously within the tap');
    await pending;
    const data = shared[index], file = data.files[0];
    assert.deepEqual(Object.keys(data), ['files']);
    assert.equal(file.type, 'image/png');
    assert.equal(file.name, `golf-round-2026-11-01-${index ? 'scorecard' : 'analysis'}.png`);
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [137, 80, 78, 71, 13, 10, 26, 10, index]);
    assert.equal(app.nodes.get(`image-save-status-${index}`).textContent, '', 'menu completion is not reported as a photo-save confirmation');
  }
  assert.equal(app.downloads.length, 0);
});

test('unsupported or throwing file-sharing capabilities retain two previews, long-press help, and downloads', () => {
  for (const options of [
    {},
    { navigator: { canShare: () => false, share: () => assert.fail('unsupported share') } },
    { navigator: { canShare: () => { throw new Error('blocked'); }, share: () => assert.fail('blocked share') } },
    { navigator: { share: () => assert.fail('no file support') } },
    { navigator: { canShare: () => true, share: () => assert.fail('File unavailable') }, fileConstructor: null },
  ]) {
    const app = openApp({ storage: stored(database(completeRound({ finished: true }))), ...options });
    app.click({ view: 'result' }); app.click({ action: 'export' });
    assert.doesNotMatch(app.overlayMarkup(), /data-save-image/);
    assert.match(app.overlayMarkup(), /長押し/);
    assert.equal((app.overlayMarkup().match(/<img /g) || []).length, 2);
    assert.equal((app.overlayMarkup().match(/download="golf-round-[^"]+\.png"/g) || []).length, 2);
    assert.equal(app.downloads.length, 0);
  }
});

test('cancelled image saving is silent, failure shows a local fallback, and retry works', async () => {
  let failure = { name: 'AbortError' }, count = 0;
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))), navigator: {
    canShare: () => true,
    share: () => { count++; return failure ? Promise.reject(failure) : Promise.resolve(); },
  } });
  app.click({ view: 'result' }); app.click({ action: 'export' });
  await app.overlayClick({ saveImage: '1' });
  assert.equal(app.nodes.get('image-save-status-1').textContent, '');
  failure = { name: 'NotAllowedError' };
  await app.overlayClick({ saveImage: '1' });
  assert.match(app.nodes.get('image-save-status-1').textContent, /長押し.*PNGをダウンロード/);
  failure = null;
  await app.overlayClick({ saveImage: '1' });
  assert.equal(app.nodes.get('image-save-status-1').textContent, '');
  assert.equal(count, 3);
  assert.equal(app.downloads.length, 0, 'cancelling never triggers an unwanted download');
});

test('a late native-menu failure cannot change a reopened preview, and closing clears files', async () => {
  let rejectShare, count = 0;
  const app = openApp({ storage: stored(database(completeRound({ finished: true }))), navigator: {
    canShare: () => true,
    share: () => { count++; return new Promise((_, reject) => { rejectShare = reject; }); },
  } });
  app.click({ view: 'result' }); app.click({ action: 'export' });
  const pending = app.overlayClick({ saveImage: '0' });
  app.nodes.get('close-modal').handlers.click();
  await app.overlayClick({ saveImage: '0' });
  assert.equal(count, 1);
  app.click({ action: 'export' });
  rejectShare({ name: 'NotAllowedError' });
  await pending;
  assert.equal(app.nodes.get('image-save-status-0').textContent, '');
  assert.match(app.overlayMarkup(), /data-save-image="0"/);
});

test('completed-round PNG export preserves scorecard detail and adds target analysis in two bounded images', () => {
  const fixture = completeRound({ finished: true, holes: Array.from({ length: 18 }, (_, i) => hole({ tee: i % 2 ? 'right' : 'left', teeShort: i % 3 === 0, obTee: i === 0 ? 1 : 0, short: i % 4 === 0 ? 2 : 1 })) });
  const app = openApp({ storage: stored(database(fixture)) }); app.click({ view: 'result' }); app.click({ action: 'export' });
  assert.equal(app.canvases.length, 2);
  assert.ok(app.canvases.every(c => c.width === 1200 && c.height === 1600));
  const text = app.canvases.flatMap(c => c.text).join('\n');
  assert.match(text, /目標|比較/); assert.match(text, /OUT/); assert.match(text, /IN/); assert.match(text, /OB/); assert.match(text, /2打以上|ミス/);
  for (const canvas of app.canvases) for (const draw of canvas.draws) {
    const size = Number(String(draw.font).match(/(\d+)px/)?.[1]);
    assert.ok(size >= 20, `readable text size: ${draw.value}`);
    assert.ok(draw.x >= 0 && draw.x <= canvas.width && draw.y - size >= 0 && draw.y + size * .3 <= canvas.height, `text inside canvas: ${draw.value}`);
  }
  assert.match(app.overlayMarkup(), /PNG|保存/);
});
