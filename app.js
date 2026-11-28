(() => {
  'use strict';
  const isPreview = new URLSearchParams(location.search).has('preview');
  const Core = RoundnoteCore;
  const Views = RoundnoteViews;
  const { TEE_CLUB_STYLES, esc, fmt, sgn, number, rate, signed, scoreName } = Views;
  const KEY = isPreview ? 'roundnote-golf-ui-preview-v2' : 'roundnote-golf-v2';
  const LEGACY_KEY = isPreview ? 'roundnote-golf-ui-preview-v1' : 'roundnote-golf-v1';
  const { TEE, CLUBS, APPROACH } = Core;
  const FIELDS = ['long', 'short', 'putts', 'obTee', 'obLater', 'bunker'];
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const initial = () => ({ ...Core.newRound(), view: 'input' });
  const count = (n, max = 30) => Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  const { score, bogeyOn, started } = Core;
  const scorecardTone = Core.scorecardTone;
  let database = Core.migrate(null);
  let state = { ...database.rounds[0], view: 'input' };
  let saveStatus = '';
  let storageBlocked = false;
  let unreadableRaw = null;
  const ui = { review: false, holes: false, obHelp: false, goals: false, goalDraft: null, scope: 'all', message: '', teeRoundId: null, teeClubs: Object.keys(CLUBS), reviewRoundId: null, reviewFilter: 'double' };
  try {
    const currentRaw = localStorage.getItem(KEY);
    const raw = currentRaw || localStorage.getItem(LEGACY_KEY);
    if (raw) {
      unreadableRaw = raw;
      database = currentRaw ? Core.validateImport(JSON.parse(raw)) : Core.migrate(JSON.parse(raw));
      state = { ...database.rounds.find(r => r.id === database.currentRoundId), view: 'input' };
      saveStatus = '保存済み';
      unreadableRaw = null;
    }
  } catch { storageBlocked = true; ui.message = '保存データを読み込めません。元の記録は上書きしていません。'; }
  const elem = document.getElementById('app');
  const overlayRoot = document.getElementById('overlay-root');
  function snapshot() {
    const { view, ...round } = state;
    return { ...database, currentRoundId: round.id, rounds: database.rounds.map(r => r.id === round.id ? round : r) };
  }
  function save(touch = true) {
    if (touch) state.updatedAt = new Date(Math.max(Date.now(), (Date.parse(state.updatedAt) || 0) + 1)).toISOString();
    database = snapshot();
    try { if (storageBlocked) throw new Error('read failed'); localStorage.setItem(KEY, JSON.stringify(database)); saveStatus = '保存済み'; }
    catch { saveStatus = '保存できません'; }
    const status = document.getElementById('save-status');
    if (status) { status.textContent = saveStatus; status.className = `save-status${saveStatus === '保存できません' ? ' error' : ''}`; }
  }
  const sums = Core.analyze;
  const courseName = index => Core.normalizeCourseNames(state.courseNames)[index];
  const holeNumber = index => Core.holeNumber(state, index);
  function viewContext() {
    return { state, database: snapshot(), ui, isPreview, saveStatus };
  }
  function render() {
    const courseOpen = elem.querySelector('.course-settings')?.open;
    const focused = document.activeElement;
    const focusData = focused?.tagName === 'BUTTON' && elem.contains(focused) ? JSON.stringify({ ...focused.dataset }) : null;
    if (state.view === 'result' && state.finished) {
      if (ui.reviewRoundId !== state.id) { ui.reviewRoundId = state.id; ui.reviewFilter = 'double'; }
      teeShotData();
    }
    elem.innerHTML = Views.appView(viewContext());
    if (courseOpen && elem.querySelector('.course-settings')) elem.querySelector('.course-settings').open = true;
    if (focusData) [...elem.querySelectorAll('button')].find(b => JSON.stringify({ ...b.dataset }) === focusData)?.focus({ preventScroll: true });
  }
  function shotStats() {
    return sums(state.holes);
  }
  function teeShotData() {
    if (ui.teeRoundId !== state.id) {
      ui.teeRoundId = state.id;
      ui.teeClubs = Object.keys(CLUBS);
    }
    return Core.teeShotBreakdown(state.holes, ui.teeClubs);
  }
  function startNewRound() {
    save(false);
    if (storageBlocked || saveStatus === '保存できません') { ui.message = '保存できないため、新規ラウンドを開始できません。先にJSONを出力してください。'; render(); return; }
    if (!Core.hasRoundData(state)) { state.view = 'input'; render(); return; }
    if (database.rounds.length >= 2000) { ui.message = '保存上限の2000件に達しました。JSONを出力して記録を保管してください。'; render(); return; }
    state = initial(); database.rounds.push(state); database.currentRoundId = state.id;
    Object.assign(ui, { review: false, holes: false, goals: false, scope: 'all', message: '' });
    save(); render(); window.scrollTo(0, 0);
  }
  function finishRound() {
    const done = sums(state.holes).done;
    if (!state.holes.some(started)) return;
    if (done < 18 && !confirm(`${done}/18Hの記録でラウンドを終了しますか？`)) return;
    state.finished = true; state.view = 'result'; ui.scope = 'all'; ui.goals = false;
    save(); render(); window.scrollTo(0, 0);
  }
  function downloadJSON() {
    const payload = { ...snapshot(), exportedAt: new Date().toISOString() };
    const recovering = storageBlocked && unreadableRaw !== null;
    const blob = new Blob([recovering ? unreadableRaw : JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `roundnote-${recovering ? 'recovery' : 'backup'}-${today()}.json`;
    anchor.hidden = true; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (recovering) { ui.message = '読み込めなかった元データを、そのまま救出しました。復元可能なJSONかどうかは未検証です。'; render(); }
  }
  async function importJSON(file) {
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('JSONは15MB以下にしてください。');
      const incoming = Core.validateImport(await file.text());
      const merged = Core.mergeDatabases(snapshot(), incoming);
      // Write before replacing in-memory data, so quota errors cannot destroy the current round.
      localStorage.setItem(KEY, JSON.stringify(merged));
      database = merged; storageBlocked = false; unreadableRaw = null; saveStatus = '保存済み';
      state = { ...database.rounds.find(r => r.id === database.currentRoundId), view: 'history' };
      ui.message = `${incoming.rounds.length}件のJSONを取り込みました。同一IDは新しい更新日時のみ反映します。`;
    } catch (error) { ui.message = `復元できません：${error.message}`; }
    render();
  }
  elem.addEventListener('change', async e => {
    if (e.target.id === 'import-file') await importJSON(e.target.files?.[0]);
    if (['0', '1'].includes(e.target.dataset?.course)) render();
    const h = state.holes[state.active], d = e.target.dataset || {}, stage = e.target.value;
    if (d.onePenalty !== undefined && Object.hasOwn(Core.PENALTY_STAGES, stage) && h.onePenalties[Number(d.onePenalty)]) {
      h.onePenalties[Number(d.onePenalty)].stage = stage; save();
    }
    if (d.obStage !== undefined && ['long', 'short'].includes(stage) && h.laterOB[Number(d.obStage)]) {
      h.laterOB[Number(d.obStage)].stage = stage; save();
    }
  });
  function changeVal(field, value) {
    const h = state.holes[state.active];
    h[field] = value === null ? null : Math.max(0, Math.min(field.startsWith('ob') || field === 'bunker' ? 9 : 30, value));
    if (field === 'obLater') h.laterOB = Array.from({ length: h.obLater }, (_, i) => h.laterOB[i] || Core.blankLaterOB());
    if (field === 'short') h.direct = h.short === 0;
    save(); render();
  }
  function goHole(index) {
    state.active = Math.max(0, Math.min(17, index)); state.view = 'input';
    ui.review = false; ui.holes = false; ui.obHelp = false;
    save(); render();
    document.getElementById('hole-editor')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    document.querySelector('[data-action="holes"]')?.focus({ preventScroll: true });
  }
  elem.addEventListener('input', e => {
    if (e.target.id === 'date') { state.date = e.target.value; save(); }
    if (e.target.id === 'place') { state.place = e.target.value; save(); }
    if (['0', '1'].includes(e.target.dataset?.course)) {
      const index = Number(e.target.dataset.course);
      state.courseNames[index] = e.target.value.trim().slice(0, 20) || Core.DEFAULT_COURSE_NAMES[index];
      state.courseStarts = Core.normalizeCourseStarts(state.courseNames, state.courseStarts);
      save();
      document.getElementById('start-settings').innerHTML = Views.startSettingsView(viewContext());
      document.getElementById('course-summary').textContent = `前半 ${courseName(0)} / 後半 ${courseName(1)}`;
      document.getElementById('current-course').textContent = courseName(state.active < 9 ? 0 : 1);
    }
    if (e.target.dataset?.goal && ui.goalDraft && Object.hasOwn(ui.goalDraft, e.target.dataset.goal)) {
      ui.goalDraft[e.target.dataset.goal] = e.target.value === '' ? null : Number(e.target.value);
    }
  });
  function handlePenaltyClick(d, h) {
    if (d.action === 'add-penalty' && h.onePenalties.length < 9) { h.onePenalties.push({ stage: 'long' }); save(); render(); return true; }
    if (d.removePenalty !== undefined && Number.isInteger(Number(d.removePenalty)) && h.onePenalties[Number(d.removePenalty)]) { h.onePenalties.splice(Number(d.removePenalty), 1); save(); render(); return true; }
    return false;
  }
  function handleReviewFilterClick(d, h) {
    if (state.finished && ['all', 'double', 'triple'].includes(d.reviewFilter)) { ui.reviewFilter = d.reviewFilter; ui.reviewRoundId = state.id; render(); return true; }
    return false;
  }
  function handleCourseClick(d, h) {
    if (['0', '1'].includes(d.startHalf) && [1, 10].includes(Number(d.start)) && !Core.automaticStart(courseName(Number(d.startHalf)))) {
      state.courseStarts[Number(d.startHalf)] = Number(d.start); save(); render(); return true;
    }
    return false;
  }
  function handleLaterOBClick(d, h) {
    if (d.laterOb !== undefined) {
      const ob = h.laterOB[Number(d.laterOb)], choices = d.laterField === 'direction' ? Core.OB_DIRECTIONS : d.laterField === 'club' ? Core.LATER_CLUBS : null;
      if (ob && choices && Object.hasOwn(choices, d.laterValue)) { ob[d.laterField] = ob[d.laterField] === d.laterValue ? null : d.laterValue; save(); render(); }
      return true;
    }
    return false;
  }
  function handleTeeFilterClick(d, h) {
    if (state.finished && (d.teeFilter === 'all' || Object.hasOwn(CLUBS, d.teeFilter))) {
      teeShotData();
      ui.teeClubs = d.teeFilter === 'all' ? Object.keys(CLUBS) : ui.teeClubs.includes(d.teeFilter) ? ui.teeClubs.filter(key => key !== d.teeFilter) : [...ui.teeClubs, d.teeFilter];
      render(); return true;
    }
    return false;
  }
  function handleNavigationClick(d, h) {
    if (['input', 'result', 'history'].includes(d.view)) { state.view = d.view; ui.goals = false; ui.message = ''; save(false); render(); window.scrollTo(0, 0); return true; }
    if (d.round) {
      const round = snapshot().rounds.find(r => r.id === d.round);
      if (round) { save(false); state = { ...round, view: round.finished ? 'result' : 'input' }; ui.scope = 'all'; ui.goals = false; ui.message = ''; save(false); render(); window.scrollTo(0, 0); }
      return true;
    }
    if (['all', 'out', 'in'].includes(d.scope) && state.finished) { ui.scope = d.scope; render(); return true; }
    if (d.hole !== undefined) { goHole(Number(d.hole)); return true; }
    return false;
  }
  function handleStrokeClick(d, h) {
    if (d.par && [3, 4, 5].includes(Number(d.par))) { h.par = Number(d.par); save(); render(); return true; }
    if (FIELDS.includes(d.field)) {
      if (d.setval !== undefined && count(Number(d.setval)) !== null) { changeVal(d.field, h[d.field] === Number(d.setval) ? null : Number(d.setval)); return true; }
      if (d.step === '1' || d.step === '-1') { changeVal(d.field, (h[d.field] ?? 0) + Number(d.step)); return true; }
    }
    return false;
  }
  function handleShotReviewClick(d, h) {
    if (Object.hasOwn(TEE, d.tee)) { h.tee = h.tee === d.tee ? null : d.tee; if (h.teeShort === null) h.teeShort = false; save(); render(); return true; }
    if (d.teeShort !== undefined) { h.teeShort = !h.teeShort; save(); render(); return true; }
    if (Object.hasOwn(CLUBS, d.teeClub)) { h.teeClub = h.teeClub === d.teeClub ? null : d.teeClub; save(); render(); return true; }
    if (d.approach && !h.direct) {
      if (d.approach === 'none') h.approach = h.approach?.length === 0 ? null : [];
      else if (Object.hasOwn(APPROACH, d.approach)) {
        const selected = h.approach || [];
        const next = selected.includes(d.approach) ? selected.filter(k => k !== d.approach) : [...selected, d.approach];
        h.approach = next.length ? next : null;
      }
      save(); render(); return true;
    }
    return false;
  }
  const clickActions = {
    holes() { ui.holes = !ui.holes; render(); },
    review() { ui.review = !ui.review; render(); },
    'ob-help'() { ui.obHelp = !ui.obHelp; render(); },
    'clear-review'(h) {
      h.tee = null; h.teeShort = false; h.approach = null; h.teeClub = null;
      save(); render(); document.querySelector('[data-action="review"]')?.focus({ preventScroll: true });
    },
    direct(h) { changeVal('short', h.direct ? null : 0); },
    prev() { goHole(state.active - 1); },
    next() { if (state.active === 17) finishRound(); else goHole(state.active + 1); },
    finish: finishRound,
    resume() {
      state.finished = false; state.view = 'input'; ui.goals = false; ui.scope = 'all';
      save(); render(); window.scrollTo(0, 0);
    },
    export() { if (state.finished) exportImage(); },
    goals() {
      if (!state.finished) return;
      ui.goals = !ui.goals; ui.goalDraft = { ...database.goals }; ui.message = ''; render();
    },
    'save-goals'() {
      if (!state.finished || !ui.goalDraft) return;
      const normalized = Core.normalizeGoals(ui.goalDraft);
      if (Object.keys(normalized).some(key => normalized[key] !== ui.goalDraft[key])) {
        ui.message = '目標値の範囲・入力形式を確認してください。'; render(); return;
      }
      database.goals = normalized; ui.goals = false; ui.message = ''; save(false); render();
    },
    'export-json': downloadJSON,
    'import-json'() { document.getElementById('import-file')?.click(); },
    sample() {
      if (isPreview && ((!state.place && !state.holes.some(started)) || confirm('サンプルに置き換えますか？'))) loadSample();
    },
    'new-round': startNewRound,
    reset: startNewRound,
  };
  const clickHandlers = [handlePenaltyClick, handleReviewFilterClick, handleCourseClick, handleLaterOBClick,
    handleTeeFilterClick, handleNavigationClick, handleStrokeClick, handleShotReviewClick];
  elem.addEventListener('click', e => {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;
    const d = button.dataset, h = state.holes[state.active];
    if (clickHandlers.some(handle => handle(d, h))) return;
    if (Object.hasOwn(clickActions, d.action)) clickActions[d.action](h);
  });
  function loadSample() {
    const sample = initial(); sample.place = 'サンプルゴルフクラブ';
    const six = [ { long: 3, short: 1, putts: 2, obTee: 1, tee: 'right', teeShort: true, approach: ['short', 'fat'] },
      { long: 2, short: 0, putts: 2, direct: true, tee: 'straight' },
      { par: 5, long: 3, short: 2, putts: 1, obLater: 1, tee: 'left', approach: ['over', 'right'] },
      { long: 2, short: 1, putts: 2, tee: 'straight', approach: [] },
      { par: 3, long: 1, short: 1, putts: 3, tee: 'right', approach: ['short'] },
      { long: 2, short: 1, putts: 2, tee: 'straight', approach: [] }
    ];
    sample.holes = sample.holes.map((h, i) => Core.normalizeHole({ ...h, ...JSON.parse(JSON.stringify(six[i % 6])) }));
    sample.finished = true; sample.view = 'result';
    database.rounds = database.rounds.filter(r => r.id !== state.id); database.rounds.push(sample); state = sample;
    ui.review = false; ui.holes = false; ui.scope = 'all'; save(); render(); window.scrollTo(0, 0);
  }
  let exportFocus, previousOverflow, exportPages = [];
  function closeExport() {
    exportPages = [];
    overlayRoot.replaceChildren(); elem.inert = false;
    document.body.style.overflow = previousOverflow;
    exportFocus?.focus({ preventScroll: true });
  }
  function exportImage() {
    if (!state.finished) return;
    const stamp = (state.date || today()).replace(/[^\d-]/g, '');
    const pages = [['analysis', '分析'], ['scorecard', 'スコアカード']].map(([key, label]) => {
      const data = makeImage(key), filename = `golf-round-${stamp}-${key}.png`;
      // Prepare the file before the save button is tapped. Safari requires the
      // native menu to open directly from that tap, without an async conversion.
      let file = null;
      try {
        if (typeof File === 'function') file = new File([Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0))], filename, { type: 'image/png' });
      } catch { /* The image preview and download remain usable without file sharing. */ }
      return { key, label, data, filename, file, shareable: canSaveImage(file) };
    });
    exportPages = pages;
    exportFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    const help = pages.some(page => page.shareable) ? 'iPhoneでは「保存メニューを開く」→「画像を保存」で写真アプリに保存できます。' : 'iPhoneでは画像を長押しして「写真に保存」または「画像を保存」を選んでください。PNGダウンロードはファイルとして保存します。';
    overlayRoot.innerHTML = `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="image-title"><div class="overlay-inner"><div class="overlay-head"><h2 id="image-title">結果画像</h2><button id="close-modal">閉じる</button></div><p class="export-help">${help}</p>${pages.map((page, i) => `<section class="export-page"><h3>${page.label}</h3><img src="${page.data}" alt="ラウンドの${page.label}"><div class="overlay-footer">${page.shareable ? `<button data-save-image="${i}" aria-label="${page.label}の保存メニューを開く">保存メニューを開く</button>` : ''}<p class="export-status" id="image-save-status-${i}" role="status" aria-live="polite"></p><a class="${page.shareable ? 'download-link' : ''}" href="${page.data}" download="${page.filename}">PNGをダウンロード</a></div></section>`).join('')}</div></div>`;
    elem.inert = true; document.body.style.overflow = 'hidden';
    document.getElementById('close-modal').addEventListener('click', closeExport);
    document.getElementById('close-modal').focus();
    overlayRoot.querySelector('.overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeExport(); });
  }
  function canSaveImage(file) {
    try { return !!file && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); }
    catch { return false; }
  }
  async function saveImage(index) {
    const pages = exportPages, page = pages[index];
    if (!page) return;
    const status = document.getElementById(`image-save-status-${index}`);
    const fallback = '保存メニューを開けませんでした。画像を長押しして保存するか、PNGをダウンロードしてください。';
    if (!canSaveImage(page.file)) { if (status) status.textContent = fallback; return; }
    if (status) status.textContent = '';
    try {
      // Send only the PNG: adding a URL or text can change the iOS menu targets.
      // Resolving the menu does not confirm that Photos was the selected target.
      await navigator.share({ files: [page.file] });
    } catch (error) {
      if (exportPages === pages && status && error?.name !== 'AbortError') status.textContent = fallback;
    }
  }
  overlayRoot.addEventListener('click', e => {
    const button = e.target.closest('[data-save-image]');
    if (button) return saveImage(Number(button.dataset.saveImage));
  });
  overlayRoot.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeExport();
    if (e.key === 'Tab') {
      const controls = overlayRoot.querySelectorAll('button, a[href]'), first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  function makeImage(kind) {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1600;
    const g = canvas.getContext('2d'), ink = '#193e2b', muted = '#6b7e6c', green = '#256344';
    g.fillStyle = '#f3f6f0'; g.fillRect(0, 0, 1200, 1600);
    function rect(x, y, w, h, fill) { g.beginPath(); g.roundRect(x, y, w, h, 18); g.fillStyle = fill; g.fill(); }
    function text(value, x, y, size = 24, color = ink, weight = 600, align = 'left', maxWidth) {
      g.fillStyle = color; g.font = `${Math.round(weight / 100) * 100} ${size}px -apple-system, BlinkMacSystemFont, "Yu Gothic", sans-serif`;
      g.textAlign = align; g.textBaseline = 'alphabetic';
      if (maxWidth) g.fillText(String(value), x, y, maxWidth); else g.fillText(String(value), x, y);
    }
    const t = sums(state.holes);
    rect(36, 36, 1128, 250, ink);
    text('ROUNDNOTE', 72, 87, 23, '#c9dfc8', 800); text(state.date, 1125, 87, 23, '#c9dfc8', 500, 'right');
    if (state.place) text(state.place, 72, 140, 29, '#fff', 600, 'left', 1020);
    text(t.done ? t.score : '—', 72, 250, 96, '#fff', 800, 'left', 230); text('打', 325, 248, 24, '#c9dfc8');
    text(t.done ? sgn(t.score - t.par) : '—', 1125, 210, 34, '#fff', 750, 'right');
    text(`${t.done}/18H  ·  PAR ${t.done ? t.par : '—'}${state.holes.some(h => h.onePenalties.length) ? `  ·  ワンペナ ${state.holes.reduce((n, h) => n + h.onePenalties.length, 0)}回` : ''}`, 1125, 258, 22, '#c9dfc8', 500, 'right');
    const out = sums(state.holes.slice(0, 9)), inside = sums(state.holes.slice(9));
    text(`${courseName(0)} ${out.done ? out.score : '—'} (${out.done}/9H)`, 66, 328, 25, ink, 700, 'left', 500);
    text(`${courseName(1)} ${inside.done ? inside.score : '—'} (${inside.done}/9H)`, 1134, 328, 25, ink, 700, 'right', 500);
    if (kind === 'analysis') {
      text('目標と実績 · 18H', 60, 380, 29, ink, 800);
      rect(36, 398, 1128, 370, '#fff');
      text('指標', 60, 437, 22, muted); text('実績', 660, 437, 22, muted, 600, 'right'); text('目標', 905, 437, 22, muted, 600, 'right'); text('差分', 1130, 437, 22, muted, 600, 'right');
      Core.compare(state.holes, database.goals).forEach((row, i) => {
        const y = 485 + i * 49;
        text(row.label, 60, y, 23, ink, 600, 'left', 435);
        text(row.actual === null ? '対象なし' : `${number(row.actual)}${row.unit}`, 660, y, 23, ink, 650, 'right');
        text(`${number(row.target)}${row.unit}${row.highIsGood ? '以上' : '以下'}`, 905, y, 22, muted, 600, 'right');
        text(row.diff === null ? row.actual === null ? '—' : '入力不足' : `${signed(row.diff)}${row.diffUnit}`, 1130, y, 24, row.good === null ? muted : row.good ? green : '#a25c36', 750, 'right');
      });
      rect(36, 792, 552, 246, '#fff'); rect(612, 792, 552, 246, '#fff');
      text('OBの内訳', 60, 835, 26, ink, 800); text(`ティーショット  ${t.teeOB}回`, 60, 885, 25); text(`2打目以降  ${t.lateOB}回`, 60, 930, 25);
      text(`ティーOB：左${t.teeOBDirection.left} / 右${t.teeOBDirection.right} / その他${t.teeOBDirection.other}`, 60, 980, 21, muted);
      text('ホールの記録方向で分類', 60, 1015, 20, muted, 500);
      text('50y以内からの2打以上率', 636, 835, 25, ink, 800); text(rate(t.approachRate), 636, 901, 48, green, 800);
      text(`ミス${t.approachMisses}回 / 対象${t.approachAttempts}回`, 636, 949, 24, muted);
      text(`直接ON ${t.directCount}回（${rate(t.directRate)}）`, 636, 1009, 23, muted);
      rect(36, 1060, 1128, 448, '#fff'); text('前半 / 後半 · 実績（目標差）', 60, 1108, 26, ink, 800);
      text(courseName(0), 760, 1151, 23, muted, 700, 'right', 320); text(courseName(1), 1130, 1151, 23, muted, 700, 'right', 320);
      const outRows = Core.compare(state.holes, database.goals, 'out'), inRows = Core.compare(state.holes, database.goals, 'in');
      outRows.forEach((row, i) => {
        const y = 1200 + i * 49;
        text(row.label, 60, y, 22, ink, 600, 'left', 410);
        [row, inRows[i]].forEach((half, j) => text(half.actual === null ? '対象なし' : `${number(half.actual)}${half.unit} (${half.diff === null ? '—' : signed(half.diff) + half.diffUnit})`, j ? 1130 : 760, y, 22, half.good === null ? muted : half.good ? green : '#a25c36', 650, 'right'));
      });
      if (t.done < 18) text('途中終了：打数・OBの目標差分は9H/18Hが揃うまで対象外', 60, 1550, 21, muted, 500);
      return canvas.toDataURL('image/png');
    }
    function matrix(start, y) {
      const holes = state.holes.slice(start, start + 9), total = sums(holes);
      rect(36, y, 1128, 454, '#fff'); text(courseName(start === 0 ? 0 : 1), 66, y + 46, 28, ink, 800, 'left', 700);
      text(`${total.done ? total.score : '—'} 打  ·  ${total.done}/9H`, 1126, y + 46, 25, green, 700, 'right');
      const rows = [['H', holes.map((_, i) => holeNumber(start + i))], ['PAR', holes.map(h => h.par)], ['50yまで', holes.map(h => fmt(h.long)), 'long'], ['50y→ON', holes.map(h => fmt(h.short)), 'short'], ['パット', holes.map(h => fmt(h.putts)), 'putts'], ['スコア', holes.map(h => fmt(score(h))), 'score'], ['OB', holes.map(h => h.obTee + h.obLater), 'ob'], ['B-on', holes.map(h => bogeyOn(h) === null ? '—' : bogeyOn(h) ? '○' : '−')], ['ティー方向', holes.map(h => h.tee ? TEE[h.tee] : '—')], ['ティー短', holes.map(h => h.teeShort ? 'ショート' : '—')], ['使用クラブ', holes.map(h => ({driver:'1W',wood_ut:'W/UT',iron:'I',wedge:'WG'})[h.teeClub] || '—')], ['バンカー', holes.map(h => fmt(h.bunker))]];
      rows.forEach(([label, values, field], ri) => {
        const yy = y + 70 + ri * 32;
        rect(60, yy, 1080, 30, ri === 5 ? '#e3efdf' : ri % 2 === 0 ? '#f3f7ee' : '#fff');
        text(label, 73, yy + 24, 20, muted, 600);
        values.forEach((value, i) => {
          const tone = scorecardTone(holes[i], field);
          if (tone) rect(211 + i * 98, yy, 92, 30, tone === 'triple' ? '#eee6f7' : '#f9eee2');
          text(value, 257 + i * 98, yy + 24, 20, tone === 'triple' ? '#70419a' : tone === 'bad' ? '#946238' : ri === 5 ? green : ink, ri === 5 ? 800 : 600, 'center', 90);
        });
      });
    }
    matrix(0, 350); matrix(9, 820);
    const stats = shotStats();
    function trend(x, title, total, labels, counts) {
      rect(x, 1290, 552, 280, '#fff'); text(title, x + 24, 1328, 23, ink, 800); text(`記録 ${total}H`, x + 524, 1361, 20, muted, 500, 'right');
      if (!total) { text('—', x + 24, 1400, 24, muted); return; }
      Object.entries(labels).forEach(([key, label], i) => { text(label, x + 24, 1391 + i * 26, 21, muted); text(`${counts[key]}H`, x + 524, 1391 + i * 26, 21, green, 750, 'right'); });
    }
    const tee = teeShotData();
    rect(36, 1290, 552, 280, '#fff');
    text('ティーショットの方向', 60, 1323, 23, ink, 800);
    text(`対象 ${tee.total}H`, 564, 1323, 20, muted, 500, 'right');
    Object.keys(CLUBS).forEach((key, i) => {
      const style = TEE_CLUB_STYLES[key], selected = ui.teeClubs.includes(key);
      const x = 60 + i % 2 * 248, y = 1352 + Math.floor(i / 2) * 26;
      g.fillStyle = selected ? style.color : '#e4e9e1'; g.fillRect(x, y - 15, 14, 14);
      text(style.label, x + 23, y, 20, selected ? ink : muted, 500, 'left', 219);
    });
    text(tee.unknownClub ? `クラブ未記録${tee.unknownClub}H${ui.teeClubs.length === 4 ? 'は灰色' : 'は対象外'}` : `横軸 0〜${tee.axisMax}H`, 60, 1405, 20, muted, 500, 'left', 330);
    text(`全体ショート ${stats.teeShortCount}H`, 564, 1405, 20, green, 600, 'right');
    if (tee.total) {
      Object.entries(TEE).forEach(([direction, label], i) => {
        const y = 1424 + i * 38, n = tee.directions[direction];
        text(label, 60, y + 17, 20, muted, 600, 'left', 84);
        let x = 152;
        tee.series.forEach(series => {
          const style = TEE_CLUB_STYLES[series.key];
          ['safe', 'ob'].forEach(kind => {
            const count = series.counts[direction][kind];
            if (!count) return;
            const width = count / tee.axisMax * 316;
            g.fillStyle = style.color; g.fillRect(x, y, width, 22);
            if (kind === 'ob') {
              g.save(); g.beginPath(); g.rect(x, y, width, 22); g.clip();
              g.strokeStyle = '#ffffffa6'; g.lineWidth = 3;
              for (let offset = -22; offset < width; offset += 10) {
                g.beginPath(); g.moveTo(x + offset, y + 22); g.lineTo(x + offset + 22, y); g.stroke();
              }
              g.restore();
            }
            text(count, x + width / 2, y + 18, 20, style.ink, 700, 'center', width);
            x += width;
          });
        });
        text(`${n.total}H`, 564, y + 17, 20, ink, 700, 'right');
        text(`OB ${n.ob}H`, 564, y + 36, 20, n.ob ? '#a16132' : muted, 500, 'right');
      });
    } else {
      text(ui.teeClubs.length ? '方向の記録なし' : 'クラブの選択なし', 60, 1460, 23, muted);
    }
    text(`斜線=OBあり / 方向未記録${tee.missingDirection}H`, 60, 1558, 20, muted, 500, 'left', 500);
    trend(612, '50y以内の記録（複数選択）', stats.approachRecorded, { none: 'ミスなし', ...APPROACH }, stats.approachNotes);
    return canvas.toDataURL('image/png');
  }
  render();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
