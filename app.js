(() => {
  'use strict';
  const isPreview = new URLSearchParams(location.search).has('preview');
  const KEY = isPreview ? 'roundnote-golf-ui-preview-v1' : 'roundnote-golf-v1';
  const TEE = { left: '左', good: '狙いどおり', right: '右' };
  const APPROACH = { short: 'ショート', over: 'オーバー', left: '左', right: '右', fat: 'ダフリ', thin: 'トップ' };
  const FIELDS = ['long', 'short', 'putts', 'obTee', 'obLater'];
  const blank = () => ({ par: 4, long: null, short: null, putts: null, obTee: 0, obLater: 0, direct: false, tee: null, approach: null });
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const initial = () => ({ date: today(), place: '', holes: Array.from({ length: 18 }, blank), active: 0, view: 'input' });
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const count = (n, max = 30) => Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => finite(n) ? String(n) : '—';
  const sgn = n => n > 0 ? `+${n}` : String(n);
  const score = h => [h.long, h.short, h.putts].every(finite) ? h.long + h.short + h.putts : null;
  const onCount = h => [h.long, h.short].every(finite) ? h.long + h.short : null;
  const bogeyOn = h => onCount(h) === null ? null : onCount(h) <= h.par - 1;
  const started = h => [h.long, h.short, h.putts].some(finite) || h.tee !== null || h.approach !== null || h.obTee > 0 || h.obLater > 0;
  const scoreName = h => {
    if (score(h) === null) return '';
    const relative = score(h) - h.par;
    return ({ '-3': 'アルバトロス', '-2': 'イーグル', '-1': 'バーディ', 0: 'パー', 1: 'ボギー', 2: 'ダブルボギー', 3: 'トリプルボギー' })[relative] || sgn(relative);
  };
  function restoreHole(value) {
    const h = value && typeof value === 'object' ? value : {};
    const approach = Array.isArray(h.approach) ? [...new Set(h.approach.filter(k => Object.hasOwn(APPROACH, k)))] : null;
    return { ...blank(), par: [3, 4, 5].includes(h.par) ? h.par : 4,
      long: count(h.long), short: h.direct ? 0 : count(h.short), putts: count(h.putts),
      obTee: count(h.obTee, 9) ?? 0, obLater: count(h.obLater, 9) ?? 0,
      direct: !!h.direct, tee: Object.hasOwn(TEE, h.tee) ? h.tee : null,
      approach: approach && h.approach.length && !approach.length ? null : approach };
  }
  let state = initial();
  let saveStatus = '';
  const ui = { review: false, holes: false, obHelp: false };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.holes) && saved.holes.length === 18) {
      state = { ...initial(), date: typeof saved.date === 'string' ? saved.date : today(),
        place: typeof saved.place === 'string' ? saved.place.slice(0, 100) : '',
        active: Number.isInteger(saved.active) ? Math.max(0, Math.min(17, saved.active)) : 0,
        holes: saved.holes.map(restoreHole) };
      saveStatus = '保存済み';
    }
  } catch { /* Keep the app usable when storage is unavailable. */ }
  const elem = document.getElementById('app');
  const overlayRoot = document.getElementById('overlay-root');
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ...state, view: 'input' })); saveStatus = '保存済み'; }
    catch { saveStatus = '保存できません'; }
    const status = document.getElementById('save-status');
    if (status) { status.textContent = saveStatus; status.className = `save-status${saveStatus === '保存できません' ? ' error' : ''}`; }
  }
  function sums(holes) {
    const complete = holes.filter(h => score(h) !== null);
    const sum = field => complete.reduce((n, h) => n + h[field], 0);
    return { done: complete.length, score: complete.reduce((n, h) => n + score(h), 0),
      long: sum('long'), short: sum('short'), putts: sum('putts'), par: sum('par'),
      teeOB: holes.reduce((n, h) => n + h.obTee, 0), lateOB: holes.reduce((n, h) => n + h.obLater, 0),
      bon: complete.filter(h => bogeyOn(h)).length, threePutts: complete.filter(h => h.putts >= 3).length };
  }
  function render() {
    const focused = document.activeElement;
    const focusData = focused?.tagName === 'BUTTON' && elem.contains(focused) ? JSON.stringify({ ...focused.dataset }) : null;
    elem.innerHTML = `<header class="masthead"><div class="shell ${state.view === 'result' ? 'result-shell' : ''}"><span class="brand">ROUNDNOTE</span><span class="save-status${saveStatus === '保存できません' ? ' error' : ''}" id="save-status" role="status">${saveStatus}</span></div></header>
      <main class="shell ${state.view === 'result' ? 'result-shell' : ''}">
        ${isPreview ? '<aside class="preview-note"><span>プレビュー</span><button class="text-button" data-action="sample">サンプル</button></aside>' : ''}
        <nav class="tabs" aria-label="画面切替"><button class="tab ${state.view === 'input' ? 'active' : ''}" data-view="input" ${state.view === 'input' ? 'aria-current="page"' : ''}>記録</button><button class="tab ${state.view === 'result' ? 'active' : ''}" data-view="result" ${state.view === 'result' ? 'aria-current="page"' : ''}>集計</button></nav>
        ${state.view === 'input' ? inputView() : resultView()}
        <footer class="footer-row"><details class="help"><summary>入力について</summary><p>スコア＝50y以内まで＋50y以内からON＋パット。罰打は各打数に含めます。OB欄は回数のみ。振り返りは任意です。</p></details><button class="text-button" data-action="reset">新規ラウンド</button></footer>
      </main>`;
    if (focusData) [...elem.querySelectorAll('button')].find(b => JSON.stringify({ ...b.dataset }) === focusData)?.focus({ preventScroll: true });
  }
  function inputView() {
    const h = state.holes[state.active], t = sums(state.holes);
    return `<section class="round-meta"><input id="date" type="date" aria-label="日付" value="${esc(state.date)}"><input id="place" aria-label="ゴルフ場" placeholder="ゴルフ場" maxlength="100" value="${esc(state.place)}"></section>
      <div class="round-status"><span>${t.done}/18H</span><span>合計 <strong>${t.done ? t.score : '—'} <small>打</small></strong></span></div>
      <section class="surface" id="hole-editor" aria-label="${state.active + 1}ホール目の記録">
        <div class="hole-heading"><button class="arrow" data-action="prev" aria-label="前のホール" ${state.active === 0 ? 'disabled' : ''}>‹</button><h1><button class="hole-select" data-action="holes" aria-expanded="${ui.holes}" aria-controls="hole-picker">${state.active + 1}H <span class="chevron" aria-hidden="true">⌄</span></button></h1><div class="hole-score" aria-live="polite"><strong>${fmt(score(h))}</strong><small>${scoreName(h) || '打'}</small></div><button class="arrow" data-action="next" aria-label="${state.active === 17 ? '集計を見る' : '次のホール'}">›</button></div>
        <div class="hole-picker" id="hole-picker" ${ui.holes ? '' : 'hidden'}>${state.holes.map((hole, i) => `<button data-hole="${i}" class="hole-tile ${score(hole) !== null ? 'done' : started(hole) ? 'started' : ''} ${state.active === i ? 'current' : ''}" aria-label="${i + 1}H${score(hole) !== null ? ' 記録済' : started(hole) ? ' 入力途中' : ''}" ${state.active === i ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div>
        <div class="hole-tools"><div class="par-group" role="group" aria-label="PAR"><span class="par-label">PAR</span>${[3, 4, 5].map(p => `<button class="par-button ${h.par === p ? 'active' : ''}" data-par="${p}" aria-label="PAR ${p}" aria-pressed="${h.par === p}">${p}</button>`).join('')}</div><span class="hole-progress">${state.active < 9 ? 'OUT' : 'IN'}</span></div>
        ${counter('long', '50y以内まで(50y以上からonした場合はグリーンonまで)', h.long, [1, 2, 3, 4, 5])}
        ${counter('short', '50y以内 → ON', h.short, [0, 1, 2, 3, 4], h)}
        ${counter('putts', 'パット', h.putts, [0, 1, 2, 3, 4])}
        <section class="ob-section" aria-label="OB回数"><div class="section-line"><h2>OB</h2><button class="info-button" data-action="ob-help" aria-label="OB入力の説明" aria-expanded="${ui.obHelp}" aria-controls="ob-help">ⓘ</button></div><p class="ob-help" id="ob-help" ${ui.obHelp ? '' : 'hidden'}>罰打は上の打数に含めます。ここでは回数だけを記録します。 <a href="https://www.randa.org/rog/the-rules-of-golf/rule-18" target="_blank" rel="noopener noreferrer">規則18</a></p>${obRow('obTee', 'ティーショット', h.obTee)}${obRow('obLater', '2打目以降', h.obLater)}</section>
        ${shotReview(h)}
      </section><div class="input-actions"><button class="primary" data-action="next">${state.active === 17 ? '集計を見る' : '次のホール →'}</button></div>`;
  }
  function counter(field, label, value, quick, hole) {
    return `<section class="counter"><div class="counter-heading"><h2>${label}</h2><div class="value-control"><button data-field="${field}" data-step="-1" aria-label="${label}を1減らす" ${!finite(value) || value === 0 ? 'disabled' : ''}>−</button><strong aria-live="polite">${fmt(value)}</strong><button data-field="${field}" data-step="1" aria-label="${label}を1増やす" ${value === 30 ? 'disabled' : ''}>＋</button></div></div><div class="quick-values" role="group" aria-label="${label}">${quick.map(n => `<button data-field="${field}" data-setval="${n}" class="${value === n ? 'active' : ''}" aria-pressed="${value === n}" aria-label="${label} ${n}打">${n}</button>`).join('')}</div>${hole ? `<button class="direct-toggle ${hole.direct ? 'active' : ''}" data-action="direct" aria-pressed="${hole.direct}"><span class="check" aria-hidden="true">✓</span>50y超からON</button>` : ''}</section>`;
  }
  function obRow(field, label, value) {
    return `<div class="ob-row"><span>${label}</span><div class="ob-stepper"><button data-field="${field}" data-step="-1" aria-label="${label}のOBを減らす" ${value === 0 ? 'disabled' : ''}>−</button><b aria-live="polite">${value}</b><button data-field="${field}" data-step="1" aria-label="${label}のOBを増やす" ${value === 9 ? 'disabled' : ''}>＋</button></div></div>`;
  }
  function reviewSummary(h) {
    const parts = [];
    if (h.tee) parts.push(`ティー：${TEE[h.tee]}`);
    if (!h.direct && h.approach !== null) parts.push(`50y：${h.approach.length ? h.approach.map(k => APPROACH[k]).join('・') : 'ミスなし'}`);
    return parts.join(' / ');
  }
  function shotReview(h) {
    const summary = reviewSummary(h);
    const missButton = (key, label) => `<button class="shot-choice ${key === 'none' ? h.approach?.length === 0 ? 'active' : '' : h.approach?.includes(key) ? 'active' : ''}" data-approach="${key}" aria-pressed="${key === 'none' ? h.approach?.length === 0 : h.approach?.includes(key) || false}" style="grid-area:${key === 'none' ? 'center' : key}">${label}</button>`;
    return `<section class="shot-review"><button class="review-toggle" data-action="review" aria-expanded="${ui.review}" aria-controls="review-body"><span><span class="review-title">振り返り <span class="badge">任意</span></span>${summary ? `<span class="review-summary">${summary}</span>` : ''}</span><span class="chevron" aria-hidden="true">${ui.review ? '⌃' : '⌄'}</span></button>
      <div class="review-body" id="review-body" ${ui.review ? '' : 'hidden'}><div class="review-group"><h3>ティーショット</h3><div class="tee-choices" role="group" aria-label="ティーショットの方向">${Object.entries(TEE).map(([key, label], i) => `<button class="shot-choice ${h.tee === key ? 'active' : ''}" data-tee="${key}" aria-pressed="${h.tee === key}"><span class="direction" aria-hidden="true">${['↖', '↑', '↗'][i]}</span>${label}</button>`).join('')}</div></div>
      ${!h.direct ? `<div class="review-group"><h3>50y以内 <span class="badge">複数選択</span></h3><div class="approach-map" role="group" aria-label="50y以内の方向">${missButton('over', 'オーバー')}${missButton('left', '左')}${missButton('none', 'ミスなし')}${missButton('right', '右')}${missButton('short', 'ショート')}</div><div class="contact-choices" role="group" aria-label="50y以内の当たり">${['fat', 'thin'].map(key => `<button class="shot-choice ${h.approach?.includes(key) ? 'active' : ''}" data-approach="${key}" aria-pressed="${h.approach?.includes(key) || false}">${APPROACH[key]}</button>`).join('')}</div></div>` : ''}
      ${h.tee !== null || (!h.direct && h.approach !== null) ? '<button class="text-button review-clear" data-action="clear-review">クリア</button>' : ''}</div></section>`;
  }
  function kpi(label, value, detail = '') {
    return `<div class="kpi"><span>${label}</span><b>${value}</b>${detail ? `<small>${detail}</small>` : ''}</div>`;
  }
  function resultView() {
    const t = sums(state.holes);
    return `<section class="result-hero"><div class="result-meta"><h1>${esc(state.date)}</h1><span>${t.done}/18H</span></div><div class="result-score"><div class="big">${t.done ? t.score : '—'}<span class="unit">打</span></div><div class="result-relative"><strong>${t.done ? sgn(t.score - t.par) : '—'}</strong><span>PAR ${t.done ? t.par : '—'}</span></div></div>${state.place ? `<p class="result-place">${esc(state.place)}</p>` : ''}</section>
      <div class="kpi-grid">${kpi('50yまで', t.done ? t.long : '—')}${kpi('50y → ON', t.done ? t.short : '—')}${kpi('パット', t.done ? t.putts : '—')}${kpi('OB', t.teeOB + t.lateOB, `ティー ${t.teeOB}<br>2打目以降 ${t.lateOB}`)}</div>
      <div class="performance">${kpi('ボギーオン以内', t.done ? `${t.bon}<small>/ ${t.done}H</small>` : '—')}${kpi('3パット以上', t.done ? `${t.threePutts}<small>/ ${t.done}H</small>` : '—')}</div>
      ${trendView()}
      <div class="section-heading"><h2>スコアカード</h2></div>${halfMatrix(0)}${halfMatrix(9)}
      <div class="result-actions"><button class="primary" data-action="export">画像を保存</button><button class="secondary" data-view="input">記録に戻る</button></div>`;
  }
  function halfMatrix(start) {
    const holes = state.holes.slice(start, start + 9), t = sums(holes);
    const rows = [['H', holes.map((_, i) => start + i + 1), 'head'], ['PAR', holes.map(h => h.par)], ['50yまで', holes.map(h => fmt(h.long))], ['50y→ON', holes.map(h => fmt(h.short))], ['パット', holes.map(h => fmt(h.putts))], ['スコア', holes.map(h => fmt(score(h))), 'score'], ['OB', holes.map(h => h.obTee + h.obLater)]];
    return `<section class="surface half-section"><div class="half-head"><h3>${start === 0 ? 'OUT' : 'IN'}</h3><strong>${t.done ? t.score : '—'}<small>${t.done}/9H</small></strong></div><div class="matrix">${rows.map(([label, values, kind]) => `<div class="matrix-label">${label}</div>${values.map((value, i) => kind === 'head' ? `<button class="matrix-cell" data-hole="${start + i}" aria-label="${start + i + 1}Hを編集">${value}</button>` : `<div class="matrix-cell ${kind || ''} ${kind === 'score' && score(holes[i]) > holes[i].par + 1 ? 'bad' : ''} ${value === '—' ? 'muted' : ''}">${value}</div>`).join('')}`).join('')}</div></section>`;
  }
  function shotStats() {
    const tee = state.holes.filter(h => h.tee !== null);
    const approach = state.holes.filter(h => !h.direct && h.approach !== null);
    return { teeTotal: tee.length, approachTotal: approach.length,
      tee: Object.fromEntries(Object.keys(TEE).map(k => [k, tee.filter(h => h.tee === k).length])),
      approach: { none: approach.filter(h => h.approach.length === 0).length, ...Object.fromEntries(Object.keys(APPROACH).map(k => [k, approach.filter(h => h.approach.includes(k)).length])) } };
  }
  function trendView() {
    const stats = shotStats();
    const card = (title, total, labels, counts, multi = false) => `<article class="surface trend-card"><h3>${title}<small>${multi ? '複数選択 · ' : ''}記録 ${total}H</small></h3>${total ? Object.entries(labels).map(([key, label]) => `<div class="trend-row ${key === 'none' || key === 'good' ? 'good' : ''}"><span>${label}</span><span class="trend-track"><i style="width:${counts[key] / total * 100}%"></i></span><b>${counts[key]}H</b></div>`).join('') : '<div class="trend-empty">—</div>'}</article>`;
    return `<section><div class="section-heading"><h2>ショットの傾向</h2></div><div class="trend-grid">${card('ティーショット', stats.teeTotal, TEE, stats.tee)}${card('50y以内', stats.approachTotal, { none: 'ミスなし', ...APPROACH }, stats.approach, true)}</div></section>`;
  }
  function changeVal(field, value) {
    const h = state.holes[state.active];
    h[field] = value === null ? null : Math.max(0, Math.min(field.startsWith('ob') ? 9 : 30, value));
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
  });
  elem.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button || button.disabled) return;
    const d = button.dataset, h = state.holes[state.active];
    if (d.view === 'input' || d.view === 'result') { state.view = d.view; save(); render(); window.scrollTo(0, 0); return; }
    if (d.hole !== undefined) { goHole(Number(d.hole)); return; }
    if (d.par && [3, 4, 5].includes(Number(d.par))) { h.par = Number(d.par); save(); render(); return; }
    if (FIELDS.includes(d.field)) {
      if (d.setval !== undefined && count(Number(d.setval)) !== null) { changeVal(d.field, h[d.field] === Number(d.setval) ? null : Number(d.setval)); return; }
      if (d.step === '1' || d.step === '-1') { changeVal(d.field, (h[d.field] ?? 0) + Number(d.step)); return; }
    }
    if (Object.hasOwn(TEE, d.tee)) { h.tee = h.tee === d.tee ? null : d.tee; save(); render(); return; }
    if (d.approach && !h.direct) {
      if (d.approach === 'none') h.approach = h.approach?.length === 0 ? null : [];
      else if (Object.hasOwn(APPROACH, d.approach)) {
        const selected = h.approach || [];
        const next = selected.includes(d.approach) ? selected.filter(k => k !== d.approach) : [...selected, d.approach];
        h.approach = next.length ? next : null;
      }
      save(); render(); return;
    }
    if (d.action === 'holes') { ui.holes = !ui.holes; render(); return; }
    if (d.action === 'review') { ui.review = !ui.review; render(); return; }
    if (d.action === 'ob-help') { ui.obHelp = !ui.obHelp; render(); return; }
    if (d.action === 'clear-review') { h.tee = null; h.approach = null; save(); render(); document.querySelector('[data-action="review"]')?.focus({ preventScroll: true }); return; }
    if (d.action === 'direct') { changeVal('short', h.direct ? null : 0); return; }
    if (d.action === 'prev') { goHole(state.active - 1); return; }
    if (d.action === 'next') {
      if (state.active === 17) { state.view = 'result'; save(); render(); window.scrollTo(0, 0); }
      else goHole(state.active + 1);
      return;
    }
    if (d.action === 'export') { exportImage(); return; }
    if (d.action === 'sample' && isPreview) {
      if ((!state.place && !state.holes.some(started)) || confirm('サンプルに置き換えますか？')) loadSample();
      return;
    }
    if (d.action === 'reset' && confirm('現在のラウンドを消去して、新しく始めますか？')) {
      state = initial(); ui.review = false; ui.holes = false; ui.obHelp = false; save(); render(); window.scrollTo(0, 0);
    }
  });
  function loadSample() {
    state = initial(); state.place = 'サンプルゴルフクラブ';
    [ { long: 3, short: 1, putts: 2, obTee: 1, tee: 'right', approach: ['short', 'fat'] },
      { long: 2, short: 0, putts: 2, direct: true, tee: 'good' },
      { par: 5, long: 3, short: 2, putts: 1, obLater: 1, tee: 'left', approach: ['over', 'right'] },
      { long: 2, short: 1, putts: 2, tee: 'good', approach: [] },
      { par: 3, long: 1, short: 1, putts: 3, tee: 'right', approach: ['short'] },
      { long: 2, short: 1, putts: 2, tee: 'good', approach: [] }
    ].forEach((h, i) => Object.assign(state.holes[i], h));
    ui.review = false; ui.holes = false; save(); render(); window.scrollTo(0, 0);
  }
  let exportFocus, previousOverflow;
  function closeExport() {
    overlayRoot.replaceChildren(); elem.inert = false;
    document.body.style.overflow = previousOverflow;
    exportFocus?.focus({ preventScroll: true });
  }
  function exportImage() {
    const data = makeImage(), stamp = (state.date || today()).replace(/[^\d-]/g, '');
    exportFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    overlayRoot.innerHTML = `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="image-title"><div class="overlay-inner"><div class="overlay-head"><h2 id="image-title">スコアカード</h2><button id="close-modal">閉じる</button></div><img src="${data}" alt="ラウンドのスコアカードとショットの傾向"><div class="overlay-footer"><a href="${data}" download="golf-round-${stamp}.png">PNGを保存</a></div></div></div>`;
    elem.inert = true; document.body.style.overflow = 'hidden';
    document.getElementById('close-modal').addEventListener('click', closeExport);
    document.getElementById('close-modal').focus();
    overlayRoot.querySelector('.overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeExport(); });
  }
  overlayRoot.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeExport();
    if (e.key === 'Tab') {
      const controls = overlayRoot.querySelectorAll('button, a[href]'), first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  function makeImage() {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1950;
    const g = canvas.getContext('2d'), ink = '#193e2b', muted = '#6b7e6c', green = '#256344';
    g.fillStyle = '#f3f6f0'; g.fillRect(0, 0, 1200, 1950);
    function rect(x, y, w, h, fill) { g.beginPath(); g.roundRect(x, y, w, h, 18); g.fillStyle = fill; g.fill(); }
    function text(value, x, y, size = 24, color = ink, weight = 600, align = 'left', maxWidth) {
      g.fillStyle = color; g.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Yu Gothic", sans-serif`;
      g.textAlign = align; g.textBaseline = 'alphabetic';
      if (maxWidth) g.fillText(String(value), x, y, maxWidth); else g.fillText(String(value), x, y);
    }
    const t = sums(state.holes);
    rect(36, 36, 1128, 270, ink);
    text('ROUNDNOTE', 72, 87, 23, '#c9dfc8', 800); text(state.date, 1125, 87, 23, '#c9dfc8', 500, 'right');
    if (state.place) text(state.place, 72, 140, 29, '#fff', 600, 'left', 1020);
    text(t.done ? t.score : '—', 72, 273, 100, '#fff', 800); text('打', 285, 270, 24, '#c9dfc8');
    text(t.done ? sgn(t.score - t.par) : '—', 1125, 232, 36, '#fff', 750, 'right');
    text(`${t.done}/18H  ·  PAR ${t.done ? t.par : '—'}`, 1125, 276, 22, '#c9dfc8', 500, 'right');
    [['50yまで', t.long], ['50y → ON', t.short], ['パット', t.putts], ['OB', t.teeOB + t.lateOB]].forEach(([label, value], i) => {
      const x = 36 + i * 286; rect(x, 328, 270, 116, '#fff'); text(label, x + 20, 365, 22, muted); text(t.done || i === 3 ? value : '—', x + 20, 422, 43, ink, 800);
    });
    [['ボギーオン以内', t.bon], ['3パット以上', t.threePutts]].forEach(([label, value], i) => {
      const x = 36 + i * 576; rect(x, 463, 552, 100, '#fff'); text(label, x + 20, 502, 23, muted); text(t.done ? `${value} / ${t.done}H` : '—', x + 520, 538, 32, ink, 750, 'right');
    });
    function matrix(start, y) {
      const holes = state.holes.slice(start, start + 9), total = sums(holes);
      rect(36, y, 1128, 430, '#fff'); text(start === 0 ? 'OUT' : 'IN', 66, y + 46, 28, ink, 800);
      text(`${total.done ? total.score : '—'} 打  ·  ${total.done}/9H`, 1126, y + 46, 25, green, 700, 'right');
      const rows = [['H', holes.map((_, i) => start + i + 1)], ['PAR', holes.map(h => h.par)], ['50yまで', holes.map(h => fmt(h.long))], ['50y→ON', holes.map(h => fmt(h.short))], ['パット', holes.map(h => fmt(h.putts))], ['スコア', holes.map(h => fmt(score(h)))], ['OB', holes.map(h => h.obTee + h.obLater)], ['B-on', holes.map(h => bogeyOn(h) === null ? '—' : bogeyOn(h) ? '○' : '−')]];
      rows.forEach(([label, values], ri) => {
        const yy = y + 70 + ri * 41;
        rect(60, yy, 1080, 38, ri === 5 ? '#e3efdf' : ri % 2 === 0 ? '#f3f7ee' : '#fff');
        text(label, 73, yy + 27, 21, muted, 600);
        values.forEach((value, i) => text(value, 257 + i * 98, yy + 27, 23, ri === 5 ? green : ink, ri === 5 ? 800 : 600, 'center'));
      });
    }
    matrix(0, 586); matrix(9, 1036);
    const stats = shotStats();
    function trend(x, title, total, labels, counts) {
      rect(x, 1490, 552, 424, '#fff'); text(title, x + 24, 1538, 25, ink, 800); text(`記録 ${total}H`, x + 524, 1574, 20, muted, 500, 'right');
      if (!total) { text('—', x + 24, 1630, 26, muted); return; }
      Object.entries(labels).forEach(([key, label], i) => { text(label, x + 24, 1620 + i * 42, 22, muted); text(`${counts[key]}H`, x + 524, 1620 + i * 42, 24, green, 750, 'right'); });
    }
    trend(36, 'ティーショット', stats.teeTotal, TEE, stats.tee);
    trend(612, '50y以内（複数選択）', stats.approachTotal, { none: 'ミスなし', ...APPROACH }, stats.approach);
    return canvas.toDataURL('image/png');
  }
  render();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
