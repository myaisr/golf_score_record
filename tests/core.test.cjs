const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../roundnote-core.js');

const hole = overrides => ({ ...Core.blankHole(), long: 2, short: 1, putts: 2, ...overrides });
const full = overrides => Array.from({ length: 18 }, () => hole(overrides));
const makeDatabase = round => ({ schemaVersion: 2, currentRoundId: round.id, goals: { ...Core.DEFAULT_GOALS }, rounds: [round] });
const round = (options = {}) => Core.newRound({ id: 'round-test', date: '2026-11-01', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...options });

test('removed long goal is ignored in older backups while hole-level shot counts remain intact', () => {
  const old = makeDatabase(round({ holes: full(), finished: true }));
  old.goals.long = 40;
  delete old.rounds[0].courseNames;
  const restored = Core.validateImport(old);
  assert.equal(restored.goals.long, undefined);
  assert.deepEqual(restored.rounds[0].courseNames, ['OUT', 'IN']);
  assert.equal(Core.analyze(restored.rounds[0].holes).long, 36);
  for (const scope of ['all', 'out', 'in']) {
    assert.deepEqual(Core.compare(restored.rounds[0].holes, restored.goals, scope).map(row => row.key), ['score', 'ob', 'approachRate', 'putts', 'bogeyRate']);
  }
});

test('per-round course names preserve playing order, accept repeats, and validate imports', () => {
  for (const names of [['IN', 'OUT'], ['東', '西'], ['同名', '同名']]) {
    const db = makeDatabase(round({ courseNames: names }));
    assert.deepEqual(Core.validateImport(db).rounds[0].courseNames, names);
    assert.equal(Core.hasRoundData(db.rounds[0]), true);
  }
  for (const names of [null, [], ['東'], ['東', 2], ['東', ''], ['a'.repeat(21), '西']]) {
    const db = makeDatabase(round()); db.rounds[0].courseNames = names;
    assert.throws(() => Core.validateImport(db), /コース名/);
  }
});

test('optional tee club round-trips, rejects unknown choices, and keeps pre-club legacy IDs', () => {
  const saved = makeDatabase(round());
  delete saved.rounds[0].holes[0].teeClub;
  assert.equal(Core.validateImport(saved).rounds[0].holes[0].teeClub, null);
  for (const teeClub of Object.keys(Core.CLUBS)) {
    saved.rounds[0].holes[0].teeClub = teeClub;
    assert.equal(Core.validateImport(saved).rounds[0].holes[0].teeClub, teeClub);
  }
  saved.rounds[0].holes[0].teeClub = 'putter';
  assert.throws(() => Core.validateImport(saved), /クラブ/);
  const legacy = { date: '2026-11-01', place: '互換性確認', holes: Array.from({ length: 18 }, () => Core.blankHole()) };
  assert.equal(Core.migrate(legacy).currentRoundId, 'legacy-77ba78fb');
});

test('score is exactly three shot segments and never adds OB a second time', () => {
  const a = Core.analyze([hole({ obTee: 2, obLater: 1 })]);
  assert.equal(a.score, 5);
  assert.equal(a.long + a.short + a.putts, a.score);
  assert.equal(a.obTotal, 3);
});

test('direct ON is excluded from short-game attempts without lowering the failure rate', () => {
  const eligible = [hole({ short: 1 }), hole({ short: 2 })];
  const before = Core.analyze(eligible);
  const after = Core.analyze([...eligible, ...Array.from({ length: 9 }, () => hole({ short: 0, direct: true }))]);
  assert.equal(before.approachRate, 50);
  assert.equal(after.approachRate, 50);
  assert.equal(after.approachAttempts, 2);
  assert.equal(after.approachMisses, 1);
  assert.equal(after.directCount, 9);
  assert.equal(after.directRate, 9 / 11 * 100);
});

test('no eligible approach displays a null rate rather than a fabricated zero percent', () => {
  const a = Core.analyze([hole({ short: 0, direct: true })]);
  assert.equal(a.approachAttempts, 0);
  assert.equal(a.approachRate, null);
  assert.equal(Core.analyze([]).directRate, null);
  assert.equal(Core.analyze([]).bogeyRate, null);
});

test('unfinished holes never enter score components or performance denominators', () => {
  const a = Core.analyze([hole(), hole({ short: 4, putts: null }), hole({ long: null, short: 2 })]);
  assert.equal(a.done, 1);
  assert.equal(a.score, 5);
  assert.equal(a.long, 2);
  assert.equal(a.short, 1);
  assert.equal(a.putts, 2);
  assert.equal(a.approachAttempts, 1);
  assert.equal(a.approachMisses, 0);
  assert.equal(a.approachRate, 0);
  assert.equal(a.bogeyRate, 100);
});

test('null and zero stay distinct through normalization and legacy migration', () => {
  const blank = Core.normalizeHole(Core.blankHole());
  assert.equal(blank.short, null);
  assert.equal(Core.score(blank), null);
  const completed = Core.normalizeHole(hole({ short: 0, direct: true, putts: 0 }));
  assert.equal(completed.short, 0);
  assert.equal(completed.putts, 0);
  assert.equal(Core.score(completed), 2);
  const conflict = Core.normalizeHole(hole({ short: 3, direct: true }));
  assert.equal(conflict.short, 3);
  assert.equal(conflict.direct, false);
});

test('tee direction is a single value and short is independently preserved', () => {
  const leftShort = Core.normalizeHole(hole({ tee: 'left', teeShort: true }));
  const straightShort = Core.normalizeHole(hole({ tee: 'straight', teeShort: true }));
  const onlyShort = Core.normalizeHole(hole({ tee: null, teeShort: true }));
  assert.equal(leftShort.tee, 'left');
  assert.equal(leftShort.teeShort, true);
  assert.equal(straightShort.tee, 'straight');
  assert.equal(straightShort.teeShort, true);
  assert.equal(onlyShort.tee, null);
  assert.equal(onlyShort.teeShort, true);
  const a = Core.analyze([leftShort, straightShort, onlyShort, hole()]);
  assert.equal(a.teeRecorded, 3);
  assert.equal(a.teeShortRecorded, 3);
  assert.equal(a.teeShortCount, 3);
  assert.equal(a.teeShortRate, 100);
  assert.equal(a.teeDirectionRecorded, 2);
  assert.deepEqual(a.teeDirection, { straight: 1, left: 1, right: 0 });
  assert.deepEqual(a.teeDirectionRates, { straight: 50, left: 50, right: 0 });
});

test('direction does not imply OB and OB directions weight the recorded OB counts', () => {
  const a = Core.analyze([
    hole({ tee: 'left', obTee: 2 }), hole({ tee: 'right', obTee: 1 }),
    hole({ tee: 'left' }), hole({ tee: 'straight', obTee: 1 }),
    hole({ tee: null, teeShort: true, obTee: 2, obLater: 3 }),
  ]);
  assert.equal(a.teeOB, 6);
  assert.equal(a.lateOB, 3);
  assert.deepEqual(a.teeOBDirection, { left: 2, right: 1, other: 3 });
  assert.equal(Object.values(a.teeOBDirection).reduce((n, value) => n + value, 0), a.teeOB);
});

test('goals compare low-is-good and high-is-good with opposite polarity', () => {
  const rows = Core.compare(full(), { ...Core.DEFAULT_GOALS, score: 99, long: 40, ob: 0, approachRate: 30, putts: 35, bogeyOnHoles: 12 });
  const byKey = Object.fromEntries(rows.map(row => [row.key, row]));
  assert.equal(byKey.score.actual, 90);
  assert.equal(byKey.score.diff, -9);
  assert.equal(byKey.score.good, true);
  assert.equal(byKey.putts.diff, 1);
  assert.equal(byKey.putts.good, false);
  assert.equal(byKey.bogeyRate.actual, 100);
  assert.ok(byKey.bogeyRate.diff > 0);
  assert.equal(byKey.bogeyRate.good, true);
  assert.equal(byKey.approachRate.diff, -30);
  assert.equal(byKey.approachRate.good, true);
});

test('OUT and IN targets add to the independent total target', () => {
  const out = Core.compare(full(), Core.DEFAULT_GOALS, 'out');
  const inn = Core.compare(full(), Core.DEFAULT_GOALS, 'in');
  assert.equal(out.find(row => row.key === 'score').target, 50);
  assert.equal(inn.find(row => row.key === 'score').target, 49);
  assert.equal(out.some(row => row.key === 'long'), false);
  assert.equal(inn.find(row => row.key === 'ob').target, 1);
  assert.equal(out.find(row => row.key === 'approachRate').target, 30);
  assert.equal(out.find(row => row.key === 'bogeyRate').target, 12 / 18 * 100);
});

test('incomplete count targets are not judged against an 18-hole target', () => {
  const holes = [...Array.from({ length: 9 }, () => hole()), ...Array.from({ length: 9 }, Core.blankHole)];
  const total = Core.compare(holes, Core.DEFAULT_GOALS);
  assert.equal(total.find(row => row.key === 'score').actual, 45);
  assert.equal(total.find(row => row.key === 'score').diff, null);
  assert.equal(total.find(row => row.key === 'score').good, null);
  assert.equal(Core.compare(holes, Core.DEFAULT_GOALS, 'out').find(row => row.key === 'score').diff, -5);
  assert.equal(total.find(row => row.key === 'approachRate').eligible, true);
});

test('legacy migration keeps data and produces stable IDs independent of view/active', () => {
  const legacy = { date: '2026-11-01', place: '東京ゴルフ場', active: 2, view: 'result', holes: full({ tee: 'good' }) };
  const migrated = Core.migrate(legacy);
  const again = Core.migrate({ ...legacy, active: 12, view: 'input' });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.rounds[0].finished, true);
  assert.equal(migrated.rounds[0].holes[0].tee, 'straight');
  assert.equal(migrated.rounds[0].holes[0].teeShort, false);
  assert.equal(migrated.rounds[0].id, again.rounds[0].id);
  assert.equal(migrated.rounds[0].createdAt, '2026-11-01T00:00:00.000Z');
  assert.equal(Core.analyze(migrated.rounds[0].holes).score, 90);
});

test('legacy missing short flags remain unknown instead of reducing the observed short rate', () => {
  const oldHoles = full({ tee: 'good' });
  for (const h of oldHoles) delete h.teeShort;
  const migrated = Core.migrate({ date: '2026-11-01', place: '', holes: oldHoles });
  assert.equal(migrated.rounds[0].holes[0].teeShort, null);
  assert.equal(Core.validateImport(migrated).rounds[0].holes[0].teeShort, null);
  const legacyStats = Core.analyze(migrated.rounds[0].holes);
  assert.equal(legacyStats.teeRecorded, 18);
  assert.equal(legacyStats.teeShortRecorded, 0);
  assert.equal(legacyStats.teeShortRate, null);
  const combined = Core.analyze([...migrated.rounds[0].holes, hole({ tee: 'left', teeShort: true }), hole({ tee: 'right', teeShort: false }), hole({ tee: null, teeShort: true })]);
  assert.equal(combined.teeRecorded, 21);
  assert.equal(combined.teeShortRecorded, 3);
  assert.equal(combined.teeShortCount, 2);
  assert.equal(combined.teeShortRate, 2 / 3 * 100);
  assert.equal(Core.blankHole().teeShort, false);
});

test('valid versioned JSON round-trips and legacy imports remain supported', () => {
  const database = makeDatabase(round({ holes: full(), finished: true }));
  assert.deepEqual(Core.validateImport(JSON.stringify(database)), database);
  const legacy = { date: '2026-11-01', place: '', holes: full({ tee: 'good' }) };
  assert.equal(Core.validateImport(legacy).rounds[0].holes[0].tee, 'straight');
});

test('blank editable dates remain portable while timestamps require an unambiguous instant', () => {
  const database = makeDatabase(round({ date: '', holes: full() }));
  assert.equal(Core.validateImport(database).rounds[0].date, '');
  const offset = structuredClone(database); offset.rounds[0].updatedAt = '2026-11-01T09:00:00+09:00';
  assert.equal(Core.validateImport(offset).rounds[0].updatedAt, '2026-11-01T09:00:00+09:00');
  for (const updatedAt of ['1', '2026-11-01', '2026-11-01T00:00:00', '2026-02-30T00:00:00Z', '2026-11-01T24:00:00Z']) {
    const invalid = structuredClone(database); invalid.rounds[0].updatedAt = updatedAt;
    assert.throws(() => Core.validateImport(invalid), /更新日時/);
  }
});

test('import rejects future versions, broken rounds, invalid values, and duplicate IDs', () => {
  const database = makeDatabase(round({ holes: full() }));
  assert.throws(() => Core.validateImport({ ...database, schemaVersion: 99 }), /スキーマ/);
  assert.throws(() => Core.validateImport({ ...database, rounds: [{ ...database.rounds[0], holes: [] }] }), /18ホール/);
  assert.throws(() => Core.validateImport({ ...database, rounds: [database.rounds[0], database.rounds[0]] }), /重複/);
  for (const patch of [{ long: -1 }, { putts: 2.5 }, { obTee: 10 }, { direct: true, short: 2 }, { tee: 'bad' }, { teeShort: 1 }]) {
    const edited = structuredClone(database); Object.assign(edited.rounds[0].holes[0], patch);
    assert.throws(() => Core.validateImport(edited));
  }
  const invalidDate = structuredClone(database); invalidDate.rounds[0].date = '2026-02-30';
  assert.throws(() => Core.validateImport(invalidDate), /日付/);
});

test('same round import upserts newer changes once while preserving current selection and goals', () => {
  const original = round({ holes: full(), place: '元のコース' });
  const existing = makeDatabase(original);
  existing.goals.score = 95;
  const updated = round({ holes: full({ putts: 3 }), place: '更新コース', updatedAt: '2026-11-02T00:00:00.000Z' });
  const imported = makeDatabase(updated); imported.goals.score = 90;
  const merged = Core.mergeDatabases(existing, imported);
  assert.equal(merged.rounds.length, 1);
  assert.equal(merged.rounds[0].place, '更新コース');
  assert.equal(merged.goals.score, 95);
  assert.equal(merged.currentRoundId, original.id);
  assert.equal(Core.mergeDatabases(merged, imported).rounds.length, 1);
  assert.equal(Core.mergeDatabases(merged, existing).rounds[0].place, '更新コース');
  assert.equal(existing.rounds[0].place, '元のコース');
});

test('equal update timestamps retain the existing round consistently', () => {
  const existing = makeDatabase(round({ holes: full(), place: '保持するコース' }));
  const incoming = makeDatabase(round({ holes: full({ putts: 3 }), place: '同日時の別内容' }));
  assert.equal(Core.mergeDatabases(existing, incoming).rounds[0].place, '保持するコース');
});

test('fresh blank database imports history without leaving a placeholder round', () => {
  const existing = makeDatabase(round({ id: 'blank-placeholder' }));
  const incoming = makeDatabase(round({ id: 'real-round', holes: full(), finished: true }));
  incoming.goals.score = 96;
  const merged = Core.mergeDatabases(existing, incoming);
  assert.equal(merged.rounds.length, 1);
  assert.equal(merged.currentRoundId, 'real-round');
  assert.equal(merged.goals.score, 96);
});

test('merged histories are capped before returning data that could not be reloaded', () => {
  const existing = makeDatabase(round({ place: '記録あり' }));
  for (let i = 1; i < 2000; i++) existing.rounds.push(round({ id: `round-${i}`, place: '履歴' }));
  const incoming = makeDatabase(round({ id: 'round-over-limit', holes: full(), finished: true }));
  assert.throws(() => Core.mergeDatabases(existing, incoming), /2000件/);
  assert.equal(existing.rounds.length, 2000);
  const update = makeDatabase(round({ id: 'round-1', place: '更新', updatedAt: '2026-11-02T00:00:00.000Z' }));
  const merged = Core.mergeDatabases(existing, update);
  assert.equal(merged.rounds.length, 2000);
  assert.equal(merged.rounds.find(r => r.id === 'round-1').place, '更新');
});
