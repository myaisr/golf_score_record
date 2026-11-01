(() => {
  'use strict';
  const isPreview = new URLSearchParams(location.search).has('preview');
  const Core = RoundnoteCore;
  const KEY = isPreview ? 'roundnote-golf-ui-preview-v2' : 'roundnote-golf-v2';
  const LEGACY_KEY = isPreview ? 'roundnote-golf-ui-preview-v1' : 'roundnote-golf-v1';
  const { TEE, CLUBS, APPROACH } = Core;
  const FIELDS = ['long', 'short', 'putts', 'obTee', 'obLater'];
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const initial = () => ({ ...Core.newRound(), view: 'input' });
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const count = (n, max = 30) => Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => finite(n) ? String(n) : '—';
  const sgn = n => n > 0 ? `+${n}` : String(n);
  const { score, bogeyOn, started } = Core;
  const number = n => finite(n) ? Number(n.toFixed(1)).toString() : '—';
  const rate = n => finite(n) ? `${number(n)}%` : '対象なし';
  const signed = n => n > 0 ? `+${number(n)}` : number(n);
  const scoreName = h => {
    if (score(h) === null) return '';
    const relative = score(h) - h.par;
    return ({ '-3': 'アルバトロス', '-2': 'イーグル', '-1': 'バーディ', 0: 'パー', 1: 'ボギー', 2: 'ダブルボギー', 3: 'トリプルボギー' })[relative] || sgn(relative);
  };
  function scorecardWarning(h, field) {
    switch (field) {
      // Judge the long game with one approach stroke (none for direct ON),
      // removing the lost stroke and penalty for each recorded OB.
      case 'long': return finite(h.long) && h.long - 2 * (h.obTee + h.obLater) + (h.direct ? 0 : 1) > h.par - 1;
      case 'short': return finite(h.short) && h.short >= 2;
      case 'putts': return finite(h.putts) && h.putts >= 3;
      case 'ob': return h.obTee + h.obLater > 0;
      case 'score': return score(h) !== null && score(h) > h.par + 1;
      default: return false;
    }
  }
  const scorecardTone = (h, field) => field === 'score' && score(h) !== null && score(h) >= h.par + 3 ? 'triple' : scorecardWarning(h, field) ? 'bad' : '';
  let database = Core.migrate(null);
  let state = { ...database.rounds[0], view: 'input' };
  let saveStatus = '';
  let storageBlocked = false;
  let unreadableRaw = null;
  const ui = { review: false, holes: false, obHelp: false, goals: false, goalDraft: null, scope: 'all', message: '' };
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
  function courseSettingsView() {
    return `<details class="course-settings"><summary id="course-summary">前半 ${esc(courseName(0))} / 後半 ${esc(courseName(1))}</summary><div class="course-fields">${['前半', '後半'].map((label, i) => `<label>${label}<input data-course="${i}" aria-label="${label}のコース名" maxlength="20" placeholder="${Core.DEFAULT_COURSE_NAMES[i]}" value="${esc(courseName(i))}"></label>`).join('')}</div></details>`;
  }
  function backupView() {
    return `<section class="surface result-backup"><h2>記録のバックアップ</h2><p>JSONには全ラウンドと目標設定をまとめて保存します。機種変更時は「履歴」の「JSON復元」から戻せます。全履歴を残していれば、Excelへの取り込みも最新版1つでOKです。</p><button class="secondary" data-action="export-json">JSONを保存</button></section>`;
  }
  function render() {
    const focused = document.activeElement;
    const focusData = focused?.tagName === 'BUTTON' && elem.contains(focused) ? JSON.stringify({ ...focused.dataset }) : null;
    elem.innerHTML = `<header class="masthead"><div class="shell ${state.view === 'result' ? 'result-shell' : ''}"><span class="brand">ROUNDNOTE</span><span class="save-status${saveStatus === '保存できません' ? ' error' : ''}" id="save-status" role="status">${saveStatus}</span></div></header>
      <main class="shell ${state.view === 'result' ? 'result-shell' : ''}">
        ${isPreview ? '<aside class="preview-note"><span>プレビュー</span><button class="text-button" data-action="sample">サンプル</button></aside>' : ''}
        <nav class="tabs" aria-label="画面切替">${[['input', '記録'], ['result', '集計'], ['history', '履歴']].map(([key, label]) => `<button class="tab ${state.view === key ? 'active' : ''}" data-view="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
        ${ui.message ? `<p class="app-message" role="status">${esc(ui.message)}</p>` : ''}
        ${state.view === 'input' ? inputView() : state.view === 'history' ? historyView() : resultView()}
        <footer class="footer-row"><details class="help"><summary>入力について</summary><p>スコア＝50y以内まで＋50y以内からON＋パット。罰打は各打数に含めます。OB欄は回数のみ。ティーのショートにはチョロ・ダフリなどの飛距離不足も含みます。</p></details><button class="text-button" data-action="new-round">新規ラウンド</button></footer>
      </main>`;
    if (focusData) [...elem.querySelectorAll('button')].find(b => JSON.stringify({ ...b.dataset }) === focusData)?.focus({ preventScroll: true });
  }
  function inputView() {
    const h = state.holes[state.active], t = sums(state.holes);
    return `<section class="round-meta"><input id="date" type="date" aria-label="日付" value="${esc(state.date)}"><input id="place" aria-label="ゴルフ場" placeholder="ゴルフ場" maxlength="100" value="${esc(state.place)}"></section>
      ${courseSettingsView()}<div class="round-status"><span>${t.done}/18H 記録済み</span><span>${state.finished ? '終了済み' : 'ラウンド中'}</span></div>
      <section class="surface" id="hole-editor" aria-label="${state.active + 1}ホール目の記録">
        <div class="hole-heading"><button class="arrow" data-action="prev" aria-label="前のホール" ${state.active === 0 ? 'disabled' : ''}>‹</button><h1><button class="hole-select" data-action="holes" aria-expanded="${ui.holes}" aria-controls="hole-picker">${state.active + 1}H <span class="chevron" aria-hidden="true">⌄</span></button></h1><div class="hole-score" aria-live="polite"><strong>${fmt(score(h))}</strong><small>${scoreName(h) || '打'}</small></div><button class="arrow" data-action="next" aria-label="${state.active === 17 ? 'ラウンド終了' : '次のホール'}">›</button></div>
        <div class="hole-picker" id="hole-picker" ${ui.holes ? '' : 'hidden'}>${state.holes.map((hole, i) => `<button data-hole="${i}" class="hole-tile ${score(hole) !== null ? 'done' : started(hole) ? 'started' : ''} ${state.active === i ? 'current' : ''}" aria-label="${i + 1}H${score(hole) !== null ? ' 記録済' : started(hole) ? ' 入力途中' : ''}" ${state.active === i ? 'aria-current="step"' : ''}>${i + 1}</button>`).join('')}</div>
        <div class="hole-tools"><div class="par-group" role="group" aria-label="PAR"><span class="par-label">PAR</span>${[3, 4, 5].map(p => `<button class="par-button ${h.par === p ? 'active' : ''}" data-par="${p}" aria-label="PAR ${p}" aria-pressed="${h.par === p}">${p}</button>`).join('')}</div><span class="hole-progress" id="current-course">${esc(courseName(state.active < 9 ? 0 : 1))}</span></div>
        ${counter('long', '50y以内まで', h.long, [1, 2, 3, 4, 5])}
        ${counter('short', '50y以内 → ON', h.short, [0, 1, 2, 3, 4], h)}
        ${counter('putts', 'パット', h.putts, [0, 1, 2, 3, 4])}
        <section class="ob-section" aria-label="OB回数"><div class="section-line"><h2>OB</h2><button class="info-button" data-action="ob-help" aria-label="OB入力の説明" aria-expanded="${ui.obHelp}" aria-controls="ob-help">ⓘ</button></div><p class="ob-help" id="ob-help" ${ui.obHelp ? '' : 'hidden'}>罰打は上の打数に含めます。ここでは回数だけを記録します。 <a href="https://www.randa.org/rog/the-rules-of-golf/rule-18" target="_blank" rel="noopener noreferrer">規則18</a></p>${obRow('obTee', 'ティーショット', h.obTee)}${obRow('obLater', '2打目以降', h.obLater)}</section>
        ${shotReview(h)}
      </section><div class="input-actions"><button class="primary" data-action="next">${state.active === 17 ? 'ラウンド終了' : '次のホール →'}</button></div>`;
  }
  function counter(field, label, value, quick, hole) {
    return `<section class="counter"><div class="counter-heading"><h2>${label}</h2><div class="value-control"><button data-field="${field}" data-step="-1" aria-label="${label}を1減らす" ${!finite(value) || value === 0 ? 'disabled' : ''}>−</button><strong aria-live="polite">${fmt(value)}</strong><button data-field="${field}" data-step="1" aria-label="${label}を1増やす" ${value === 30 ? 'disabled' : ''}>＋</button></div></div><div class="quick-values" role="group" aria-label="${label}">${quick.map(n => `<button data-field="${field}" data-setval="${n}" class="${value === n ? 'active' : ''}" aria-pressed="${value === n}" aria-label="${label} ${n}打">${n}</button>`).join('')}</div>${hole ? `<button class="direct-toggle ${hole.direct ? 'active' : ''}" data-action="direct" aria-pressed="${hole.direct}"><span class="check" aria-hidden="true">✓</span>50y超からON</button>` : ''}</section>`;
  }
  function obRow(field, label, value) {
    return `<div class="ob-row"><span>${label}</span><div class="ob-stepper"><button data-field="${field}" data-step="-1" aria-label="${label}のOBを減らす" ${value === 0 ? 'disabled' : ''}>−</button><b aria-live="polite">${value}</b><button data-field="${field}" data-step="1" aria-label="${label}のOBを増やす" ${value === 9 ? 'disabled' : ''}>＋</button></div></div>`;
  }
  function reviewSummary(h) {
    const parts = [];
    if (h.teeClub) parts.push(CLUBS[h.teeClub]);
    if (h.tee) parts.push(`ティー：${TEE[h.tee]}`);
    if (h.teeShort) parts.push('ティー：ショート');
    if (!h.direct && h.approach !== null) parts.push(`50y：${h.approach.length ? h.approach.map(k => APPROACH[k]).join('・') : 'ミスなし'}`);
    return parts.join(' / ');
  }
  function shotReview(h) {
    const summary = reviewSummary(h);
    const missButton = (key, label) => `<button class="shot-choice ${key === 'none' ? h.approach?.length === 0 ? 'active' : '' : h.approach?.includes(key) ? 'active' : ''}" data-approach="${key}" aria-pressed="${key === 'none' ? h.approach?.length === 0 : h.approach?.includes(key) || false}" style="grid-area:${key === 'none' ? 'center' : key}">${label}</button>`;
    return `<section class="shot-review"><button class="review-toggle" data-action="review" aria-expanded="${ui.review}" aria-controls="review-body"><span><span class="review-title">振り返り <span class="badge">任意</span></span>${summary ? `<span class="review-summary">${summary}</span>` : ''}</span><span class="chevron" aria-hidden="true">${ui.review ? '⌃' : '⌄'}</span></button>
      <div class="review-body" id="review-body" ${ui.review ? '' : 'hidden'}><div class="review-group"><h3>使用クラブ</h3><div class="club-choices" role="group" aria-label="ティーショットのクラブ">${Object.entries(CLUBS).map(([key, label]) => `<button class="shot-choice ${h.teeClub === key ? 'active' : ''}" data-tee-club="${key}" aria-pressed="${h.teeClub === key}">${label}</button>`).join('')}</div></div><div class="review-group"><h3>ティーショット</h3><div class="tee-choices" role="group" aria-label="ティーショットの方向">${Object.entries(TEE).map(([key, label]) => `<button class="shot-choice ${h.tee === key ? 'active' : ''}" data-tee="${key}" aria-pressed="${h.tee === key}">${label}</button>`).join('')}</div><button class="shot-choice tee-short ${h.teeShort ? 'active' : ''}" data-tee-short="true" aria-pressed="${h.teeShort === true}">ショート</button></div>
      ${!h.direct ? `<div class="review-group"><h3>50y以内 <span class="badge">複数選択</span></h3><div class="approach-map" role="group" aria-label="50y以内の方向">${missButton('over', 'オーバー')}${missButton('left', '左')}${missButton('none', 'ミスなし')}${missButton('right', '右')}${missButton('short', 'ショート')}</div><div class="contact-choices" role="group" aria-label="50y以内の当たり">${['fat', 'thin'].map(key => `<button class="shot-choice ${h.approach?.includes(key) ? 'active' : ''}" data-approach="${key}" aria-pressed="${h.approach?.includes(key) || false}">${APPROACH[key]}</button>`).join('')}</div></div>` : ''}
      ${h.teeClub || h.tee !== null || h.teeShort || (!h.direct && h.approach !== null) ? '<button class="text-button review-clear" data-action="clear-review">クリア</button>' : ''}</div></section>`;
  }
  function kpi(label, value, detail = '') {
    return `<div class="kpi"><span>${label}</span><b>${value}</b>${detail ? `<small>${detail}</small>` : ''}</div>`;
  }
  function resultView() {
    if (!state.finished) return `<section class="surface finish-gate"><h1>ラウンド記録</h1><p>${sums(state.holes).done}/18H 記録済み</p><button class="primary" data-action="finish" ${!state.holes.some(started) ? 'disabled' : ''}>ラウンドを終了して集計</button><button class="text-button" data-view="input">記録に戻る</button></section>`;
    const t = sums(state.holes);
    const out = sums(state.holes.slice(0, 9)), inside = sums(state.holes.slice(9));
    const scoreDiff = Core.compare(state.holes, database.goals)[0];
    return `<section class="result-hero"><div class="result-meta"><h1>${esc(state.date)}</h1><span>${t.done}/18H</span></div><div class="result-score"><div class="big">${t.done ? t.score : '—'}<span class="unit">打</span></div><div class="result-relative"><strong>${t.done ? sgn(t.score - t.par) : '—'}</strong><span>PAR ${t.done ? t.par : '—'}</span></div></div>${state.place ? `<p class="result-place">${esc(state.place)}</p>` : ''}</section>
      <div class="result-halves"><span><span class="course-label">${esc(courseName(0))}</span> <b>${out.done ? out.score : '—'}</b><small>${out.done}/9H</small></span><span><span class="course-label">${esc(courseName(1))}</span> <b>${inside.done ? inside.score : '—'}</b><small>${inside.done}/9H</small></span></div>
      <div class="goal-gap"><span>目標 ${database.goals.score}打以下</span><strong class="${tone(scoreDiff)}">${scoreDiff.eligible ? `${signed(scoreDiff.diff)}打` : '入力不足'}</strong></div>
      ${comparisonView()}${ui.goals ? goalsView() : ''}
      <section class="surface"><div class="section-heading compact"><h2>OBの内訳</h2></div><div class="ob-summary"><span>ティーショット <b>${t.teeOB}回</b></span><span>2打目以降 <b>${t.lateOB}回</b></span></div><dl class="ob-directions">${[['left', '左'], ['right', '右'], ['other', 'その他']].map(([key, label]) => `<div><dt>${label}</dt><dd>${t.teeOBDirection[key]}回</dd></div>`).join('')}</dl><details class="help"><summary>方向内訳について</summary><p>ティーショットOBを、そのホールで記録した方向に分類します。方向未記録・まっすぐ・ショート単独は「その他」です。同一ホールで複数回OBした場合も、記録方向による分類です。</p></details></section>
      <section class="surface approach-analysis"><h2>50y以内からの2打以上率</h2><strong>${rate(t.approachRate)}</strong><p>ミス${t.approachMisses}回 / 対象${t.approachAttempts}回</p><div class="reference-metrics"><span>50y以上から直接ON <b>${t.directCount}回 / ${rate(t.directRate)}</b></span><span>3パット以上 <b>${t.threePutts}H</b></span></div></section>
      ${trendView()}
      <div class="section-heading"><h2>スコアカード</h2></div>${halfMatrix(0)}${halfMatrix(9)}
      <div class="result-actions"><button class="primary" data-action="export">画像を保存</button><button class="secondary" data-action="resume">記録を再開</button></div>${backupView()}`;
  }
  const tone = row => row.good === null ? 'neutral' : row.good ? 'good' : 'bad';
  function comparisonView() {
    return `<section class="comparison-section"><div class="section-heading"><h2>目標と実績</h2><button class="text-button" data-action="goals">目標設定</button></div><div class="scope-tabs" role="group" aria-label="比較範囲">${[['all', '18H'], ['out', courseName(0)], ['in', courseName(1)]].map(([key, label]) => `<button data-scope="${key}" class="${ui.scope === key ? 'active' : ''}" aria-pressed="${ui.scope === key}">${esc(label)}</button>`).join('')}</div><div class="comparison-wrap"><table class="comparison-table"><thead><tr><th scope="col">指標</th><th scope="col">実績</th><th scope="col">目標</th><th scope="col">差分</th></tr></thead><tbody>${Core.compare(state.holes, database.goals, ui.scope).map(row => `<tr data-metric="${row.key}"><th scope="row">${row.label}</th><td>${row.actual === null ? '対象なし' : `${number(row.actual)}${row.unit}`}</td><td>${number(row.target)}${row.unit}${row.highIsGood ? '以上' : '以下'}</td><td class="${tone(row)}">${row.diff === null ? row.actual === null ? '—' : '入力不足' : `${signed(row.diff)}${row.diffUnit}`}</td></tr>`).join('')}</tbody></table></div><details class="help"><summary>集計条件</summary><p>打数と率は入力完了ホールから計算します。直接ONは50y以内の対象外。途中終了時、打数・OBの目標差分は対象の9H/18Hが揃うまで表示しません。前後半の目標は等分（スコアの端数は前半へ配分）。目標は分析用の目安で、指標同士は合算しません。</p></details></section>`;
  }
  function goalsView() {
    const fields = [['score', '総スコア（打以下）', 1, 1620], ['ob', 'OB（回以下 / 18H）', 0, 162], ['approachRate', '50y以内2打以上率（%以下）', 0, 100], ['putts', 'パット（打以下 / 18H）', 0, 540], ['bogeyOnHoles', 'ボギーオン以内（H以上 / 18H）', 0, 18]];
    return `<section class="surface goals-panel"><h2>目標設定</h2><div class="goals-grid">${fields.map(([key, label, min, max]) => `<label>${label}<input data-goal="${key}" type="number" inputmode="${key === 'approachRate' ? 'decimal' : 'numeric'}" min="${min}" max="${max}" step="${key === 'approachRate' ? '0.1' : '1'}" value="${esc(ui.goalDraft[key])}"></label>`).join('')}</div><div class="result-actions"><button class="primary" data-action="save-goals">保存</button><button class="secondary" data-action="goals">キャンセル</button></div></section>`;
  }
  function halfMatrix(start) {
    const holes = state.holes.slice(start, start + 9), t = sums(holes);
    const rows = [['H', holes.map((_, i) => start + i + 1), 'head'], ['PAR', holes.map(h => h.par)], ['50yまで', holes.map(h => fmt(h.long)), 'long'], ['50y→ON', holes.map(h => fmt(h.short)), 'short'], ['パット', holes.map(h => fmt(h.putts)), 'putts'], ['スコア', holes.map(h => fmt(score(h))), 'score'], ['OB', holes.map(h => h.obTee + h.obLater), 'ob']];
    return `<section class="surface half-section"><div class="half-head"><h3>${esc(courseName(start === 0 ? 0 : 1))}</h3><strong>${t.done ? t.score : '—'}<small>${t.done}/9H</small></strong></div><div class="matrix">${rows.map(([label, values, kind]) => `<div class="matrix-label">${label}</div>${values.map((value, i) => kind === 'head' ? `<button class="matrix-cell" data-hole="${start + i}" aria-label="${start + i + 1}Hを編集">${value}</button>` : `<div class="matrix-cell ${kind === 'score' ? 'score' : ''} ${scorecardTone(holes[i], kind)} ${value === '—' ? 'muted' : ''}">${value}</div>`).join('')}`).join('')}</div></section>`;
  }
  function shotStats() {
    return sums(state.holes);
  }
  function trendView() {
    const stats = shotStats();
    const card = (title, total, labels, counts, multi = false) => `<article class="surface trend-card"><h3>${title}<small>${multi ? '複数選択 · ' : ''}記録 ${total}H</small></h3>${total ? Object.entries(labels).map(([key, label]) => `<div class="trend-row ${key === 'none' || key === 'good' ? 'good' : ''}"><span>${label}</span><span class="trend-track"><i style="width:${counts[key] / total * 100}%"></i></span><b>${counts[key]}H</b></div>`).join('') : '<div class="trend-empty">—</div>'}</article>`;
    return `<section><div class="section-heading"><h2>ショットの傾向</h2></div><div class="trend-grid">${card('ティーショットの方向', stats.teeDirectionRecorded, TEE, stats.teeDirection)}${card('50y以内の記録', stats.approachRecorded, { none: 'ミスなし', ...APPROACH }, stats.approachNotes, true)}</div><p class="reference-line">ティーショットのショート ${stats.teeShortCount}H / 記録${stats.teeShortRecorded}H（${rate(stats.teeShortRate)}）</p></section>`;
  }
  function historyView() {
    const rounds = snapshot().rounds.filter(r => Core.hasRoundData(r)).sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return `<section><div class="section-heading"><h1 class="page-title">ラウンド履歴</h1><span>${rounds.length}件</span></div><div class="backup-actions"><button class="secondary" data-action="export-json">JSON出力</button><button class="secondary" data-action="import-json">JSON復元</button><input id="import-file" type="file" accept=".json,application/json" hidden></div><div class="history-list">${rounds.length ? rounds.map(r => `<button class="history-row" data-round="${esc(r.id)}"><span><strong>${esc(r.date || '日付未設定')}</strong><small>${esc(r.place || 'ゴルフ場未入力')}</small></span><span>${r.finished ? '終了' : '記録中'} · ${sums(r.holes).done}/18H</span></button>`).join('') : '<p class="empty-history">記録はありません</p>'}</div>${state.finished ? growthView(rounds) : ''}</section>`;
  }
  function growthView(rounds) {
    const eligible = rounds.filter(r => r.finished && sums(r.holes).done === 18).sort((a, b) => a.date.localeCompare(b.date) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const latest = eligible.slice(-5), previous = eligible.slice(-10, -5);
    if (!latest.length) return '';
    function metrics(group) {
      if (!group.length) return null;
      const a = sums(group.flatMap(r => r.holes));
      return { score: a.score / group.length, ob: a.obTotal / group.length, putts: a.putts / group.length, teeShortRate: a.teeShortRate, approachRate: a.approachRate, bogeyRate: a.bogeyRate };
    }
    const now = metrics(latest), before = metrics(previous);
    const fields = [['score', 'スコア', '打'], ['ob', 'OB', '回'], ['teeShortRate', 'ティー・ショート率', '%'], ['approachRate', '50y以内2打以上率', '%'], ['putts', 'パット', '打'], ['bogeyRate', 'ボギーオン以内率', '%']];
    return `<section><div class="section-heading"><h2>直近${latest.length}ラウンド</h2><span>終了済み18Hのみ</span></div><div class="comparison-wrap"><table class="comparison-table"><thead><tr><th>指標</th><th>平均</th><th>前${previous.length || 5}R比</th></tr></thead><tbody>${fields.map(([key, label, unit]) => `<tr><th scope="row">${label}</th><td>${finite(now[key]) ? `${number(now[key])}${unit}` : '対象なし'}</td><td>${before && finite(before[key]) && finite(now[key]) ? `${signed(now[key] - before[key])}${unit === '%' ? 'pt' : unit}` : '—'}</td></tr>`).join('')}</tbody></table></div></section>`;
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
  });
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
    if (['0', '1'].includes(e.target.dataset?.course)) {
      const index = Number(e.target.dataset.course);
      state.courseNames[index] = e.target.value.trim().slice(0, 20) || Core.DEFAULT_COURSE_NAMES[index];
      save();
      document.getElementById('course-summary').textContent = `前半 ${courseName(0)} / 後半 ${courseName(1)}`;
      document.getElementById('current-course').textContent = courseName(state.active < 9 ? 0 : 1);
    }
    if (e.target.dataset?.goal && ui.goalDraft && Object.hasOwn(ui.goalDraft, e.target.dataset.goal)) {
      ui.goalDraft[e.target.dataset.goal] = e.target.value === '' ? null : Number(e.target.value);
    }
  });
  elem.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button || button.disabled) return;
    const d = button.dataset, h = state.holes[state.active];
    if (['input', 'result', 'history'].includes(d.view)) { state.view = d.view; ui.goals = false; ui.message = ''; save(false); render(); window.scrollTo(0, 0); return; }
    if (d.round) {
      const round = snapshot().rounds.find(r => r.id === d.round);
      if (round) { save(false); state = { ...round, view: round.finished ? 'result' : 'input' }; ui.scope = 'all'; ui.goals = false; ui.message = ''; save(false); render(); window.scrollTo(0, 0); }
      return;
    }
    if (['all', 'out', 'in'].includes(d.scope) && state.finished) { ui.scope = d.scope; render(); return; }
    if (d.hole !== undefined) { goHole(Number(d.hole)); return; }
    if (d.par && [3, 4, 5].includes(Number(d.par))) { h.par = Number(d.par); save(); render(); return; }
    if (FIELDS.includes(d.field)) {
      if (d.setval !== undefined && count(Number(d.setval)) !== null) { changeVal(d.field, h[d.field] === Number(d.setval) ? null : Number(d.setval)); return; }
      if (d.step === '1' || d.step === '-1') { changeVal(d.field, (h[d.field] ?? 0) + Number(d.step)); return; }
    }
    if (Object.hasOwn(TEE, d.tee)) { h.tee = h.tee === d.tee ? null : d.tee; if (h.teeShort === null) h.teeShort = false; save(); render(); return; }
    if (d.teeShort !== undefined) { h.teeShort = !h.teeShort; save(); render(); return; }
    if (Object.hasOwn(CLUBS, d.teeClub)) { h.teeClub = h.teeClub === d.teeClub ? null : d.teeClub; save(); render(); return; }
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
    if (d.action === 'clear-review') { h.tee = null; h.teeShort = false; h.approach = null; h.teeClub = null; save(); render(); document.querySelector('[data-action="review"]')?.focus({ preventScroll: true }); return; }
    if (d.action === 'direct') { changeVal('short', h.direct ? null : 0); return; }
    if (d.action === 'prev') { goHole(state.active - 1); return; }
    if (d.action === 'next') {
      if (state.active === 17) finishRound();
      else goHole(state.active + 1);
      return;
    }
    if (d.action === 'finish') { finishRound(); return; }
    if (d.action === 'resume') { state.finished = false; state.view = 'input'; ui.goals = false; ui.scope = 'all'; save(); render(); window.scrollTo(0, 0); return; }
    if (d.action === 'export' && state.finished) { exportImage(); return; }
    if (d.action === 'goals' && state.finished) { ui.goals = !ui.goals; ui.goalDraft = { ...database.goals }; ui.message = ''; render(); return; }
    if (d.action === 'save-goals' && state.finished && ui.goalDraft) {
      const normalized = Core.normalizeGoals(ui.goalDraft);
      if (Object.keys(normalized).some(key => normalized[key] !== ui.goalDraft[key])) { ui.message = '目標値の範囲・入力形式を確認してください。'; render(); return; }
      database.goals = normalized; ui.goals = false; ui.message = ''; save(false); render(); return;
    }
    if (d.action === 'export-json') { downloadJSON(); return; }
    if (d.action === 'import-json') { document.getElementById('import-file')?.click(); return; }
    if (d.action === 'sample' && isPreview) {
      if ((!state.place && !state.holes.some(started)) || confirm('サンプルに置き換えますか？')) loadSample();
      return;
    }
    if (d.action === 'new-round' || d.action === 'reset') startNewRound();
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
    sample.holes.forEach((h, i) => Object.assign(h, JSON.parse(JSON.stringify(six[i % 6]))));
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
    text(`${t.done}/18H  ·  PAR ${t.done ? t.par : '—'}`, 1125, 258, 22, '#c9dfc8', 500, 'right');
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
      rect(36, y, 1128, 450, '#fff'); text(courseName(start === 0 ? 0 : 1), 66, y + 46, 28, ink, 800, 'left', 700);
      text(`${total.done ? total.score : '—'} 打  ·  ${total.done}/9H`, 1126, y + 46, 25, green, 700, 'right');
      const rows = [['H', holes.map((_, i) => start + i + 1)], ['PAR', holes.map(h => h.par)], ['50yまで', holes.map(h => fmt(h.long)), 'long'], ['50y→ON', holes.map(h => fmt(h.short)), 'short'], ['パット', holes.map(h => fmt(h.putts)), 'putts'], ['スコア', holes.map(h => fmt(score(h))), 'score'], ['OB', holes.map(h => h.obTee + h.obLater), 'ob'], ['B-on', holes.map(h => bogeyOn(h) === null ? '—' : bogeyOn(h) ? '○' : '−')], ['ティー方向', holes.map(h => h.tee ? TEE[h.tee] : '—')], ['ティー短', holes.map(h => h.teeShort ? 'ショート' : '—')], ['使用クラブ', holes.map(h => ({driver:'1W',wood_ut:'W/UT',iron:'I',wedge:'WG'})[h.teeClub] || '—')]];
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
    trend(36, 'ティーショット', stats.teeDirectionRecorded, TEE, stats.teeDirection);
    text(`ショート ${stats.teeShortCount}H / ${rate(stats.teeShortRate)}`, 60, 1525, 23, green, 700);
    trend(612, '50y以内の記録（複数選択）', stats.approachRecorded, { none: 'ミスなし', ...APPROACH }, stats.approachNotes);
    return canvas.toDataURL('image/png');
  }
  render();
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
