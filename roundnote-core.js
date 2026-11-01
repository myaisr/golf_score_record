(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.RoundnoteCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const DEFAULT_GOALS = Object.freeze({ score: 99, ob: 2, approachRate: 30, putts: 36, bogeyOnHoles: 12 });
  const DEFAULT_COURSE_NAMES = Object.freeze(['OUT', 'IN']);
  const normalizeCourseNames = value => DEFAULT_COURSE_NAMES.map((fallback, i) => typeof value?.[i] === 'string' && value[i].trim() ? value[i].trim().slice(0, 20) : fallback);
  const TEE = Object.freeze({ left: '左', straight: 'まっすぐ', right: '右' });
  const CLUBS = Object.freeze({ driver: 'ドライバー', wood_ut: 'ウッド・ユーティリティ', iron: 'アイアン', wedge: 'ウェッジ' });
  const APPROACH = Object.freeze({ short: 'ショート', over: 'オーバー', left: '左', right: '右', fat: 'ダフリ', thin: 'トップ' });
  const DIRECTION_KEYS = Object.keys(TEE);
  const NOTE_KEYS = Object.keys(APPROACH);
  const GOAL_LIMITS = { score: [1, 1620], ob: [0, 162], approachRate: [0, 100], putts: [0, 540], bogeyOnHoles: [0, 18] };
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const validCount = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
  const blankHole = () => ({ par: 4, long: null, short: null, putts: null, obTee: 0, obLater: 0, direct: false, tee: null, teeShort: false, approach: null, teeClub: null });
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const score = h => [h.long, h.short, h.putts].every(finite) ? h.long + h.short + h.putts : null;
  const onCount = h => [h.long, h.short].every(finite) ? h.long + h.short : null;
  const bogeyOn = h => onCount(h) === null ? null : onCount(h) <= h.par - 1;
  const started = h => [h.long, h.short, h.putts].some(finite) || h.obTee > 0 || h.obLater > 0 || h.tee !== null || h.teeShort === true || h.approach !== null || h.par !== 4 || !!h.teeClub;
  const percent = (numerator, denominator) => denominator ? numerator / denominator * 100 : null;
  const copy = value => JSON.parse(JSON.stringify(value));

  function normalizeHole(value) {
    const h = isObject(value) ? value : {};
    let short = validCount(h.short, 30) ? h.short : null;
    // Legacy direct=true sometimes accompanied null short. Never discard a positive shot count.
    if (h.direct === true && short === null) short = 0;
    const direct = h.direct === true && short === 0;
    const notes = Array.isArray(h.approach) ? [...new Set(h.approach.filter(key => NOTE_KEYS.includes(key)))] : null;
    return { ...blankHole(), par: [3, 4, 5].includes(h.par) ? h.par : 4,
      long: validCount(h.long, 30) ? h.long : null, short,
      putts: validCount(h.putts, 30) ? h.putts : null,
      obTee: validCount(h.obTee, 9) ? h.obTee : 0,
      obLater: validCount(h.obLater, 9) ? h.obLater : 0,
      direct, tee: h.tee === 'good' ? 'straight' : DIRECTION_KEYS.includes(h.tee) ? h.tee : null,
      // Absence in historical records is unknown, rather than an observed non-short.
      teeShort: typeof h.teeShort === 'boolean' ? h.teeShort : null,
      teeClub: Object.hasOwn(CLUBS, h.teeClub) ? h.teeClub : null,
      approach: notes && h.approach.length > 0 && !notes.length ? null : notes };
  }

  function normalizeGoals(value) {
    const goals = isObject(value) ? value : {};
    return Object.fromEntries(Object.entries(GOAL_LIMITS).map(([key, [min, max]]) => {
      const n = goals[key];
      const valid = finite(n) && n >= min && n <= max && (key === 'approachRate' || Number.isInteger(n));
      return [key, valid ? n : DEFAULT_GOALS[key]];
    }));
  }

  function makeId() {
    const uuid = typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return `round-${uuid}`;
  }

  function newRound(options = {}) {
    const now = new Date().toISOString();
    return { id: options.id || makeId(), date: typeof options.date === 'string' ? options.date : today(),
      place: typeof options.place === 'string' ? options.place.slice(0, 100) : '',
      courseNames: normalizeCourseNames(options.courseNames),
      holes: Array.isArray(options.holes) && options.holes.length === 18 ? options.holes.map(normalizeHole) : Array.from({ length: 18 }, blankHole),
      active: validCount(options.active, 17) ? options.active : 0,
      finished: options.finished === true, createdAt: options.createdAt || now, updatedAt: options.updatedAt || now };
  }

  function stableLegacyId(raw) {
    const content = JSON.stringify({ date: raw.date || '', place: raw.place || '', holes: raw.holes.map(h => { const { teeClub, ...legacyHole } = normalizeHole(h); return legacyHole; }) });
    let hash = 2166136261;
    for (let i = 0; i < content.length; i++) hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
    return `legacy-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function normalizeRound(raw, legacy = false) {
    const stableDate = typeof raw.date === 'string' ? raw.date : today();
    const legacyStamp = /^\d{4}-\d{2}-\d{2}$/.test(stableDate) && Number.isFinite(Date.parse(stableDate)) ? `${stableDate}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z';
    return newRound({ ...raw, date: stableDate,
      id: typeof raw.id === 'string' && raw.id ? raw.id : stableLegacyId(raw),
      finished: raw.finished === true || (legacy && raw.holes.every(h => score(normalizeHole(h)) !== null)),
      createdAt: typeof raw.createdAt === 'string' && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : legacyStamp,
      updatedAt: typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : legacyStamp });
  }

  function migrate(raw) {
    if (typeof raw === 'string') raw = JSON.parse(raw);
    if (!raw) {
      const round = newRound();
      return { schemaVersion: SCHEMA_VERSION, currentRoundId: round.id, goals: { ...DEFAULT_GOALS }, rounds: [round] };
    }
    if (!isObject(raw)) throw new Error('ROUNDNOTEの記録形式ではありません。');
    if (raw.schemaVersion !== undefined && (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1 || raw.schemaVersion > SCHEMA_VERSION)) throw new Error('対応していないデータ形式です。');
    if (Array.isArray(raw.holes) && raw.holes.length === 18) {
      const round = normalizeRound(raw, true);
      return { schemaVersion: SCHEMA_VERSION, currentRoundId: round.id, goals: normalizeGoals(raw.goals), rounds: [round] };
    }
    if (!Array.isArray(raw.rounds) || !raw.rounds.length) throw new Error('ラウンド記録がありません。');
    const rounds = raw.rounds.filter(r => isObject(r) && Array.isArray(r.holes) && r.holes.length === 18).map(r => normalizeRound(r, raw.schemaVersion !== SCHEMA_VERSION));
    if (!rounds.length) throw new Error('読み込めるラウンド記録がありません。');
    if (new Set(rounds.map(r => r.id)).size !== rounds.length) throw new Error('同じラウンドIDが重複しています。');
    return { schemaVersion: SCHEMA_VERSION, currentRoundId: rounds.some(r => r.id === raw.currentRoundId) ? raw.currentRoundId : rounds[0].id,
      goals: normalizeGoals(raw.goals), rounds };
  }

  function assert(condition, message) { if (!condition) throw new Error(message); }
  function assertDate(value, message) {
    // The editable date input may be intentionally blank, including in saved drafts.
    if (value === '') return;
    assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000-'), message);
    const stamp = new Date(`${value}T00:00:00.000Z`);
    assert(Number.isFinite(stamp.getTime()) && stamp.toISOString().slice(0, 10) === value, message);
  }
  function assertTimestamp(value, message) {
    // Date.parse also accepts ambiguous forms such as "1" and timezone-free local dates.
    // Versioned imports need a portable instant so browser/Excel upsert ordering agrees.
    assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value), message);
    assertDate(value.slice(0, 10), message);
    assert(Number.isFinite(Date.parse(value)), message);
  }
  function validateHole(h, context, legacy) {
    assert(isObject(h), `${context}のホール形式が不正です。`);
    assert([3, 4, 5].includes(h.par), `${context}のPARが不正です。`);
    for (const key of ['long', 'short', 'putts']) assert(h[key] === null || validCount(h[key], 30), `${context}の打数が不正です。`);
    for (const key of ['obTee', 'obLater']) assert(validCount(h[key], 9), `${context}のOB回数が不正です。`);
    assert(typeof h.direct === 'boolean', `${context}の直接ON記録が不正です。`);
    if (!legacy) {
      assert(!h.direct || h.short === 0, `${context}の直接ONと50y以内の打数が一致しません。`);
      assert(h.teeShort === null || typeof h.teeShort === 'boolean', `${context}のティーショット・ショート記録が不正です。`);
    }
    assert(h.tee === null || DIRECTION_KEYS.includes(h.tee) || (legacy && h.tee === 'good') || (legacy && h.tee === undefined), `${context}のティーショット方向が不正です。`);
    assert(h.teeClub === undefined || h.teeClub === null || Object.hasOwn(CLUBS, h.teeClub), `${context}のティーショットのクラブが不正です。`);
    assert(h.approach === null || (legacy && h.approach === undefined) || (Array.isArray(h.approach) && h.approach.every(key => NOTE_KEYS.includes(key)) && new Set(h.approach).size === h.approach.length), `${context}のアプローチ記録が不正です。`);
  }

  function validateImport(raw) {
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { throw new Error('JSONを読み取れません。'); }
    }
    assert(isObject(raw), 'ROUNDNOTEのJSONを選んでください。');
    assert(raw.schemaVersion === undefined || (Number.isInteger(raw.schemaVersion) && raw.schemaVersion >= 1 && raw.schemaVersion <= SCHEMA_VERSION), '対応していないスキーマバージョンです。');
    const legacy = raw.schemaVersion !== SCHEMA_VERSION;
    const rounds = Array.isArray(raw.rounds) ? raw.rounds : Array.isArray(raw.holes) ? [raw] : null;
    assert(rounds && rounds.length > 0 && rounds.length <= 2000, 'ラウンド数が不正です。');
    if (!legacy) {
      assert(Array.isArray(raw.rounds), 'ラウンド一覧がありません。');
      assert(typeof raw.currentRoundId === 'string', '現在のラウンドIDがありません。');
      assert(isObject(raw.goals), '目標設定がありません。');
    }
    if (raw.goals !== undefined) {
      assert(isObject(raw.goals), '目標設定が不正です。');
      for (const [key, [min, max]] of Object.entries(GOAL_LIMITS)) {
        if (legacy && raw.goals[key] === undefined) continue;
        assert(finite(raw.goals[key]) && raw.goals[key] >= min && raw.goals[key] <= max && (key === 'approachRate' || Number.isInteger(raw.goals[key])), `${key}の目標値が不正です。`);
      }
    }
    const ids = new Set();
    rounds.forEach((round, index) => {
      const context = `${index + 1}ラウンド目`;
      assert(isObject(round), `${context}の形式が不正です。`);
      assertDate(round.date, `${context}の日付が不正です。`);
      assert(typeof round.place === 'string' && round.place.length <= 100, `${context}のゴルフ場名が不正です。`);
      assert(round.courseNames === undefined || (Array.isArray(round.courseNames) && round.courseNames.length === 2 && round.courseNames.every(name => typeof name === 'string' && name.length <= 20 && name.trim().length > 0)), `${context}の前後半のコース名が不正です。`);
      assert(Array.isArray(round.holes) && round.holes.length === 18, `${context}は18ホール必要です。`);
      if (!legacy || round.id !== undefined) {
        assert(typeof round.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(round.id), `${context}のIDが不正です。`);
        assert(!ids.has(round.id), '同じラウンドIDが重複しています。'); ids.add(round.id);
      }
      if (!legacy || round.active !== undefined) assert(validCount(round.active, 17), `${context}の選択ホールが不正です。`);
      if (!legacy || round.finished !== undefined) assert(typeof round.finished === 'boolean', `${context}の完了状態が不正です。`);
      for (const key of ['createdAt', 'updatedAt']) {
        if (!legacy || round[key] !== undefined) assertTimestamp(round[key], `${context}の更新日時が不正です。`);
      }
      round.holes.forEach((h, holeIndex) => validateHole(h, `${context} ${holeIndex + 1}H`, legacy));
    });
    if (!legacy) assert(ids.has(raw.currentRoundId), '現在のラウンドIDが一覧にありません。');
    return migrate(raw);
  }

  function hasRoundData(round) { return !!round.place || round.finished || round.courseNames.some((name, i) => name !== DEFAULT_COURSE_NAMES[i]) || round.holes.some(started); }
  function mergeDatabases(current, incoming) {
    const existing = migrate(current), imported = validateImport(incoming);
    const hadData = existing.rounds.some(hasRoundData);
    const byId = new Map(existing.rounds.filter(round => hadData || hasRoundData(round)).map(round => [round.id, copy(round)]));
    imported.rounds.forEach(round => {
      const old = byId.get(round.id);
      if (!old || Date.parse(round.updatedAt) > Date.parse(old.updatedAt)) byId.set(round.id, copy(round));
    });
    const rounds = [...byId.values()];
    assert(rounds.length <= 2000, 'ラウンド履歴は2000件までです。取り込み前に履歴を整理してください。');
    const currentRoundId = hadData && rounds.some(round => round.id === existing.currentRoundId) ? existing.currentRoundId : imported.currentRoundId;
    return { schemaVersion: SCHEMA_VERSION, currentRoundId, goals: { ...(hadData ? existing.goals : imported.goals) }, rounds };
  }

  function analyze(values) {
    const holes = (Array.isArray(values) ? values : []).map(normalizeHole);
    const complete = holes.filter(h => score(h) !== null);
    const sum = field => complete.reduce((n, h) => n + h[field], 0);
    const teeHoles = holes.filter(h => h.tee !== null || h.teeShort);
    const teeShortHoles = teeHoles.filter(h => h.teeShort !== null);
    const directionHoles = holes.filter(h => h.tee !== null);
    const approachHoles = complete.filter(h => !h.direct && h.short >= 1);
    const approachNotesHoles = holes.filter(h => !h.direct && h.approach !== null);
    const teeDirection = Object.fromEntries(DIRECTION_KEYS.map(key => [key, directionHoles.filter(h => h.tee === key).length]));
    const teeOBDirection = { left: 0, right: 0, other: 0 };
    holes.forEach(h => { teeOBDirection[h.tee === 'left' || h.tee === 'right' ? h.tee : 'other'] += h.obTee; });
    const bon = complete.filter(h => bogeyOn(h)).length;
    const approachMisses = approachHoles.filter(h => h.short >= 2).length;
    const directCount = complete.filter(h => h.direct).length;
    const teeShortCount = teeHoles.filter(h => h.teeShort).length;
    const teeOB = holes.reduce((n, h) => n + h.obTee, 0), lateOB = holes.reduce((n, h) => n + h.obLater, 0);
    return { done: complete.length, score: complete.reduce((n, h) => n + score(h), 0), par: sum('par'),
      long: sum('long'), short: sum('short'), putts: sum('putts'), teeOB, lateOB, obTotal: teeOB + lateOB,
      bon, bogeyRate: percent(bon, complete.length), threePutts: complete.filter(h => h.putts >= 3).length,
      approachAttempts: approachHoles.length, approachMisses, approachRate: percent(approachMisses, approachHoles.length),
      directCount, directRate: percent(directCount, complete.length),
      teeRecorded: teeHoles.length, teeShortRecorded: teeShortHoles.length, teeShortCount, teeShortRate: percent(teeShortCount, teeShortHoles.length),
      teeDirectionRecorded: directionHoles.length, teeDirection,
      teeDirectionRates: Object.fromEntries(DIRECTION_KEYS.map(key => [key, percent(teeDirection[key], directionHoles.length)])),
      teeOBDirection, approachRecorded: approachNotesHoles.length,
      approachNotes: { none: approachNotesHoles.filter(h => h.approach.length === 0).length, ...Object.fromEntries(NOTE_KEYS.map(key => [key, approachNotesHoles.filter(h => h.approach.includes(key)).length])) } };
  }

  function compare(holes, goals, scope = 'all') {
    const g = normalizeGoals(goals), selected = scope === 'out' ? holes.slice(0, 9) : scope === 'in' ? holes.slice(9, 18) : holes;
    const a = analyze(selected), expected = scope === 'all' ? 18 : 9, half = scope !== 'all';
    const scoreTarget = half ? scope === 'out' ? Math.ceil(g.score / 2) : Math.floor(g.score / 2) : g.score;
    const rows = [
      ['score', '総スコア', a.done ? a.score : null, scoreTarget, '打', false, a.done === expected],
      ['ob', 'OB回数', a.obTotal, g.ob / (half ? 2 : 1), '回', false, a.done === expected],
      ['approachRate', '50y以内からの2打以上率', a.approachRate, g.approachRate, '%', false, a.approachRate !== null],
      ['putts', 'パット数', a.done ? a.putts : null, g.putts / (half ? 2 : 1), '打', false, a.done === expected],
      ['bogeyRate', 'ボギーオン以内率', a.bogeyRate, g.bogeyOnHoles / 18 * 100, '%', true, a.bogeyRate !== null],
    ];
    return rows.map(([key, label, actual, target, unit, highIsGood, eligible]) => {
      let diff = eligible && actual !== null ? actual - target : null;
      if (diff !== null && Math.abs(diff) < 1e-10) diff = 0;
      return { key, label, actual, target, diff, unit, diffUnit: unit === '%' ? 'pt' : unit,
        good: diff === null ? null : highIsGood ? diff >= 0 : diff <= 0, eligible, highIsGood };
    });
  }

  return Object.freeze({ SCHEMA_VERSION, DEFAULT_GOALS, DEFAULT_COURSE_NAMES, normalizeCourseNames, TEE, CLUBS, APPROACH, blankHole, newRound, normalizeHole, normalizeGoals,
    migrate, validateImport, mergeDatabases, analyze, compare, score, onCount, bogeyOn, started, hasRoundData });
});
