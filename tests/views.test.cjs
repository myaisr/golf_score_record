const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../roundnote-core.js');
const Views = require('../roundnote-views.js');

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

test('screen renderers accept immutable data and never change saved rounds or UI filters', () => {
  const round = Core.newRound({ id: 'round-render', date: '2026-11-28', place: '<script>course</script>',
    courseNames: ['IN', 'OUT'], finished: true, holes: Array.from({ length: 18 }, (_, i) => ({
      ...Core.blankHole(), long: 2, short: 1, putts: 2, tee: 'left', teeClub: 'iron',
      ...(i === 0 ? { long: 3, onePenalties: [{ stage: 'tee' }] } : {}),
    })) });
  const database = { schemaVersion: 2, currentRoundId: round.id, goals: { ...Core.DEFAULT_GOALS }, rounds: [round] };
  const ui = { review: true, holes: true, obHelp: true, goals: true, goalDraft: { ...Core.DEFAULT_GOALS },
    scope: 'out', message: '<b>message</b>', teeRoundId: round.id, teeClubs: ['iron'], reviewRoundId: round.id, reviewFilter: 'all' };
  for (const view of ['input', 'result', 'history']) {
    const ctx = freeze({ state: { ...round, view }, database, ui, isPreview: true, saveStatus: '保存済み' });
    const before = JSON.stringify(ctx);
    const markup = Views.appView(ctx);
    assert.equal(Views.appView(ctx), markup);
    assert.equal(JSON.stringify(ctx), before);
    assert.ok(markup.includes('&lt;b&gt;message&lt;/b&gt;'));
    assert.ok(markup.includes('&lt;script&gt;course&lt;/script&gt;'));
    assert.ok(!markup.includes('<script>course</script>'));
    if (view === 'input') {
      assert.ok(markup.includes('バンカー回数'));
      assert.ok(markup.includes('data-par="3"'));
    }
    if (view === 'result') {
      assert.ok(markup.includes('対象 18H'));
      assert.ok(markup.includes('data-tee-filter="iron" aria-pressed="true"'));
    }
  }
});
