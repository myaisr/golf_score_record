(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./roundnote-core.js'));
  else root.RoundnoteViews = factory(root.RoundnoteCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  const { TEE, CLUBS, APPROACH, score, bogeyOn, started, scorecardTone } = Core;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const sums = Core.analyze;
  const courseName = (ctx, index) => Core.normalizeCourseNames(ctx.state.courseNames)[index];
  const holeNumber = (ctx, index) => Core.holeNumber(ctx.state, index);

  const TEE_CLUB_STYLES = {
    driver: { label: 'ドライバー', color: '#2d6950', ink: '#fff' },
    wood_ut: { label: 'ウッド・UT', color: '#8db79e', ink: '#193e2b' },
    iron: { label: 'アイアン', color: '#b1a3cf', ink: '#43345f' },
    wedge: { label: 'ウェッジ', color: '#d9c69c', ink: '#51452b' },
    unknown: { label: 'クラブ未記録', color: '#a6b1ab', ink: '#263f30' },
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => finite(n) ? String(n) : '—';
  const sgn = n => n > 0 ? `+${n}` : String(n);
  const number = n => finite(n) ? Number(n.toFixed(1)).toString() : '—';
  const rate = n => finite(n) ? `${number(n)}%` : '対象なし';
  const signed = n => n > 0 ? `+${number(n)}` : number(n);
  const scoreName = h => {
    if (score(h) === null) return '';
    const relative = score(h) - h.par;
    return ({ '-3': 'アルバトロス', '-2': 'イーグル', '-1': 'バーディ', 0: 'パー', 1: 'ボギー', 2: 'ダブルボギー', 3: 'トリプルボギー' })[relative] || sgn(relative);
  };

  function startSettingsView(ctx) {
    const { state } = ctx;
    const starts = Core.normalizeCourseStarts(state.courseNames, state.courseStarts);
    return ['前半', '後半'].map((half, i) => `<div class="start-setting"><span>${half}の開始ホール番号</span><div class="start-options" role="group" aria-label="${half}の開始ホール番号">${[1, 10].map(n => `<button data-start-half="${i}" data-start="${n}" class="shot-choice ${starts[i] === n ? 'active' : ''}" aria-pressed="${starts[i] === n}" ${Core.automaticStart(courseName(ctx, i)) ? 'disabled' : ''}>${n}番から</button>`).join('')}</div></div>`).join('') + '<p class="numbering-help">INは10番、OUTは1番から自動設定。それ以外は前後半それぞれ選べます。</p>';
  }
  function courseSettingsView(ctx) {
    return `<details class="course-settings"><summary id="course-summary">前半 ${esc(courseName(ctx, 0))} / 後半 ${esc(courseName(ctx, 1))}</summary><div class="course-fields">${['前半', '後半'].map((label, i) => `<label>${label}<input data-course="${i}" aria-label="${label}のコース名" maxlength="20" placeholder="${Core.DEFAULT_COURSE_NAMES[i]}" value="${esc(courseName(ctx, i))}"></label>`).join('')}</div><div id="start-settings">${startSettingsView(ctx)}</div></details>`;
  }
  function backupView(ctx) {
    return `<section class="surface result-backup"><h2>記録のバックアップ</h2><p>JSONには全ラウンドと目標設定をまとめて保存します。機種変更時は「履歴」の「JSON復元」から戻せます。全履歴を残していれば、Excelへの取り込みも最新版1つでOKです。</p><button class="secondary" data-action="export-json">JSONを保存</button></section>`;
  }
  function inputView(ctx) {
    const { state, ui } = ctx;
    const h = state.holes[state.active], t = sums(state.holes);
    return `<section class="round-meta"><input id="date" type="date" aria-label="日付" value="${esc(state.date)}"><input id="place" aria-label="ゴルフ場" placeholder="ゴルフ場" maxlength="100" value="${esc(state.place)}"></section>
      ${courseSettingsView(ctx)}<div class="round-status"><span>${t.done}/18H 記録済み</span><span>${state.finished ? '終了済み' : 'ラウンド中'}</span></div>
      <section class="surface" id="hole-editor" aria-label="${holeNumber(ctx, state.active)}ホール目の記録">
        <div class="hole-heading"><button class="arrow" data-action="prev" aria-label="前のホール" ${state.active === 0 ? 'disabled' : ''}>‹</button><h1><button class="hole-select" data-action="holes" aria-expanded="${ui.holes}" aria-controls="hole-picker">${holeNumber(ctx, state.active)}H <span class="chevron" aria-hidden="true">⌄</span></button></h1><div class="hole-score" aria-live="polite"><strong>${fmt(score(h))}</strong><small>${scoreName(h) || '打'}</small></div><button class="arrow" data-action="next" aria-label="${state.active === 17 ? 'ラウンド終了' : '次のホール'}">›</button></div>
        ${holePickerView(ctx)}
        <div class="hole-tools"><div class="par-group" role="group" aria-label="PAR"><span class="par-label">PAR</span>${[3, 4, 5].map(p => `<button class="par-button ${h.par === p ? 'active' : ''}" data-par="${p}" aria-label="PAR ${p}" aria-pressed="${h.par === p}">${p}</button>`).join('')}</div><span class="hole-progress" id="current-course">${esc(courseName(ctx, state.active < 9 ? 0 : 1))}</span></div>
        ${counter(ctx, 'long', '50y以内まで', h.long, [1, 2, 3, 4, 5])}
        ${counter(ctx, 'short', '50y以内 → ON', h.short, [0, 1, 2, 3, 4], h)}
        ${counter(ctx, 'putts', 'パット', h.putts, [0, 1, 2, 3, 4])}
        <section class="ob-section" aria-label="OB回数"><div class="section-line"><h2>OB</h2><button class="info-button" data-action="ob-help" aria-label="OB入力の説明" aria-expanded="${ui.obHelp}" aria-controls="ob-help">ⓘ</button></div><p class="ob-help" id="ob-help" ${ui.obHelp ? '' : 'hidden'}>罰打は上の打数に含めます。ここでは回数だけを記録します。 <a href="https://www.randa.org/rog/the-rules-of-golf/rule-18" target="_blank" rel="noopener noreferrer">規則18</a></p>${obRow(ctx, 'obTee', 'ティーショット', h.obTee)}${obRow(ctx, 'obLater', '2打目以降', h.obLater)}${laterOBView(ctx, h)}${onePenaltyView(ctx, h)}<div class="bunker-counter">${obRow(ctx, 'bunker', 'バンカー回数', h.bunker)}</div><p class="numbering-help">バンカー・OBの回数はスコアに再加算しません。</p></section>
        ${shotReview(ctx, h)}
      </section><div class="input-actions"><button class="primary" data-action="next">${state.active === 17 ? 'ラウンド終了' : '次のホール →'}</button></div>`;
  }
  function holePickerView(ctx) {
    const { state, ui } = ctx;
    return `<div class="hole-picker" id="hole-picker" ${ui.holes ? '' : 'hidden'}>${[0, 9].map(start => `<div class="hole-picker-half"><p>${start === 0 ? '前半' : '後半'} ${esc(courseName(ctx, start === 0 ? 0 : 1))}</p><div class="hole-picker-grid">${state.holes.slice(start, start + 9).map((hole, offset) => { const i = start + offset; return `<button data-hole="${i}" class="hole-tile ${score(hole) !== null ? 'done' : started(hole) ? 'started' : ''} ${state.active === i ? 'current' : ''}" aria-label="${esc(courseName(ctx, start === 0 ? 0 : 1))} ${holeNumber(ctx, i)}H${score(hole) !== null ? ' 記録済' : started(hole) ? ' 入力途中' : ''}" ${state.active === i ? 'aria-current="step"' : ''}>${holeNumber(ctx, i)}</button>`; }).join('')}</div></div>`).join('')}</div>`;
  }
  function counter(ctx, field, label, value, quick, hole) {
    return `<section class="counter"><div class="counter-heading"><h2>${label}</h2><div class="value-control"><button data-field="${field}" data-step="-1" aria-label="${label}を1減らす" ${!finite(value) || value === 0 ? 'disabled' : ''}>−</button><strong aria-live="polite">${fmt(value)}</strong><button data-field="${field}" data-step="1" aria-label="${label}を1増やす" ${value === 30 ? 'disabled' : ''}>＋</button></div></div><div class="quick-values" role="group" aria-label="${label}">${quick.map(n => `<button data-field="${field}" data-setval="${n}" class="${value === n ? 'active' : ''}" aria-pressed="${value === n}" aria-label="${label} ${n}打">${n}</button>`).join('')}</div>${hole ? `<button class="direct-toggle ${hole.direct ? 'active' : ''}" data-action="direct" aria-pressed="${hole.direct}"><span class="check" aria-hidden="true">✓</span>50y超からON</button>` : ''}</section>`;
  }
  function obRow(ctx, field, label, value) {
    return `<div class="ob-row"><span>${label}</span><div class="ob-stepper"><button data-field="${field}" data-step="-1" aria-label="${label}${field === 'bunker' ? 'を' : 'のOBを'}減らす" ${!finite(value) || value === 0 ? 'disabled' : ''}>−</button><b aria-live="polite">${fmt(value)}</b><button data-field="${field}" data-step="1" aria-label="${label}${field === 'bunker' ? 'を' : 'のOBを'}増やす" ${value === 9 ? 'disabled' : ''}>＋</button></div></div>`;
  }
  function laterOBView(ctx, h) {
    return h.laterOB.map((ob, i) => `<section class="later-ob-detail" aria-label="2打目以降のOB ${i + 1}回目"><h3>2打目以降のOB · ${i + 1}回目 <span class="badge">任意</span></h3><label class="penalty-stage">発生したショット<select data-ob-stage="${i}" aria-label="OB ${i + 1}回目の発生したショット">${stageOptions(ctx, ob.stage || 'long', false)}</select></label>${[['direction', '方向', Core.OB_DIRECTIONS], ['club', '使用クラブ', Core.LATER_CLUBS]].map(([field, label, choices]) => `<div class="later-ob-field"><span>${label}</span><div class="later-ob-choices" role="group" aria-label="OB ${i + 1}回目の${label}">${Object.entries(choices).map(([key, name]) => `<button class="shot-choice ${ob[field] === key ? 'active' : ''}" data-later-ob="${i}" data-later-field="${field}" data-later-value="${key}" aria-pressed="${ob[field] === key}">${name}</button>`).join('')}</div></div>`).join('')}</section>`).join('');
  }
  function stageOptions(ctx, stage, includeTee = true) {
    return Object.entries(Core.PENALTY_STAGES).filter(([key]) => includeTee || key !== 'tee').map(([key, label]) => `<option value="${key}" ${stage === key ? 'selected' : ''}>${label}</option>`).join('');
  }
  function onePenaltyView(ctx, h) {
    return `<section class="one-penalties" aria-label="ワンペナ"><h3>ワンペナ</h3>${h.onePenalties.map((p, i) => `<div class="one-penalty-item"><div class="one-penalty-heading"><h4>ワンペナ · ${i + 1}回目</h4><button class="text-button" data-remove-penalty="${i}" aria-label="ワンペナ ${i + 1}回目を削除">削除</button></div><label class="penalty-stage">発生したショット<select data-one-penalty="${i}" aria-label="ワンペナ ${i + 1}回目の発生したショット">${stageOptions(ctx, p.stage)}</select></label></div>`).join('')}<button class="add-penalty" data-action="add-penalty" ${h.onePenalties.length >= 9 ? 'disabled' : ''}>＋ ワンペナを追加</button></section>`;
  }
  function reviewSummary(ctx, h) {
    const lines = [], tee = [], direction = [];
    if (h.teeClub) tee.push(CLUBS[h.teeClub]);
    if (h.tee) direction.push(TEE[h.tee]);
    if (h.teeShort) direction.push('ショート');
    if (direction.length) tee.push(direction.join('・'));
    if (tee.length) lines.push(`ティーショット: ${tee.join('/')}`);
    if (!h.direct && h.approach !== null) lines.push(`50y未満: ${h.approach.length ? h.approach.map(k => APPROACH[k]).join('・') : 'ミスなし'}`);
    return lines.join('\n');
  }
  function shotReview(ctx, h) {
    const { ui } = ctx;
    const summary = reviewSummary(ctx, h);
    const missButton = (key, label) => `<button class="shot-choice ${key === 'none' ? h.approach?.length === 0 ? 'active' : '' : h.approach?.includes(key) ? 'active' : ''}" data-approach="${key}" aria-pressed="${key === 'none' ? h.approach?.length === 0 : h.approach?.includes(key) || false}" style="grid-area:${key === 'none' ? 'center' : key}">${label}</button>`;
    return `<section class="shot-review"><button class="review-toggle" data-action="review" aria-expanded="${ui.review}" aria-controls="review-body"><span><span class="review-title">振り返り <span class="badge">任意</span></span>${summary ? `<span class="review-summary">${esc(summary)}</span>` : ''}</span><span class="chevron" aria-hidden="true">${ui.review ? '⌃' : '⌄'}</span></button>
      <div class="review-body" id="review-body" ${ui.review ? '' : 'hidden'}><div class="review-group"><h3>使用クラブ</h3><div class="club-choices" role="group" aria-label="ティーショットのクラブ">${Object.entries(CLUBS).map(([key, label]) => `<button class="shot-choice ${h.teeClub === key ? 'active' : ''}" data-tee-club="${key}" aria-pressed="${h.teeClub === key}">${label}</button>`).join('')}</div></div><div class="review-group"><h3>ティーショット</h3><div class="tee-choices" role="group" aria-label="ティーショットの方向">${Object.entries(TEE).map(([key, label]) => `<button class="shot-choice ${h.tee === key ? 'active' : ''}" data-tee="${key}" aria-pressed="${h.tee === key}">${label}</button>`).join('')}</div><button class="shot-choice tee-short ${h.teeShort ? 'active' : ''}" data-tee-short="true" aria-pressed="${h.teeShort === true}">ショート</button></div>
      ${!h.direct ? `<div class="review-group"><h3>50y以内 <span class="badge">複数選択</span></h3><div class="approach-map" role="group" aria-label="50y以内の方向">${missButton('over', 'オーバー')}${missButton('left', '左')}${missButton('none', 'ミスなし')}${missButton('right', '右')}${missButton('short', 'ショート')}</div><div class="contact-choices" role="group" aria-label="50y以内の当たり">${['fat', 'thin'].map(key => `<button class="shot-choice ${h.approach?.includes(key) ? 'active' : ''}" data-approach="${key}" aria-pressed="${h.approach?.includes(key) || false}">${APPROACH[key]}</button>`).join('')}</div></div>` : ''}
      ${h.teeClub || h.tee !== null || h.teeShort || (!h.direct && h.approach !== null) ? '<button class="text-button review-clear" data-action="clear-review">クリア</button>' : ''}</div></section>`;
  }
  function resultView(ctx) {
    const { state, database, ui } = ctx;
    if (!state.finished) return `<section class="surface finish-gate"><h1>ラウンド記録</h1><p>${sums(state.holes).done}/18H 記録済み</p><button class="primary" data-action="finish" ${!state.holes.some(started) ? 'disabled' : ''}>ラウンドを終了して集計</button><button class="text-button" data-view="input">記録に戻る</button></section>`;
    const t = sums(state.holes);
    const out = sums(state.holes.slice(0, 9)), inside = sums(state.holes.slice(9));
    const scoreDiff = Core.compare(state.holes, database.goals)[0];
    return `<section class="result-hero"><div class="result-meta"><h1>${esc(state.date)}</h1><span>${t.done}/18H</span></div><div class="result-score"><div class="big">${t.done ? t.score : '—'}<span class="unit">打</span></div><div class="result-relative"><strong>${t.done ? sgn(t.score - t.par) : '—'}</strong><span>PAR ${t.done ? t.par : '—'}</span></div></div>${state.place ? `<p class="result-place">${esc(state.place)}</p>` : ''}</section>
      <div class="result-halves"><span><span class="course-label">${esc(courseName(ctx, 0))}</span> <b>${out.done ? out.score : '—'}</b><small>${out.done}/9H</small></span><span><span class="course-label">${esc(courseName(ctx, 1))}</span> <b>${inside.done ? inside.score : '—'}</b><small>${inside.done}/9H</small></span></div>
      <div class="goal-gap"><span>目標 ${database.goals.score}打以下</span><strong class="${tone(scoreDiff)}">${scoreDiff.eligible ? `${signed(scoreDiff.diff)}打` : '入力不足'}</strong></div>
      ${penaltyReviewView(ctx)}${comparisonView(ctx)}${ui.goals ? goalsView(ctx) : ''}
      <section class="surface"><div class="section-heading compact"><h2>OBの内訳</h2></div><div class="ob-summary"><span>ティーショット <b>${t.teeOB}回</b></span><span>2打目以降 <b>${t.lateOB}回</b></span></div><dl class="ob-directions">${[['left', '左'], ['right', '右'], ['other', 'その他']].map(([key, label]) => `<div><dt>${label}</dt><dd>${t.teeOBDirection[key]}回</dd></div>`).join('')}</dl><details class="help"><summary>方向内訳について</summary><p>ティーショットOBを、そのホールで記録した方向に分類します。方向未記録・まっすぐ・ショート単独は「その他」です。同一ホールで複数回OBした場合も、記録方向による分類です。</p></details></section>
      <section class="surface approach-analysis"><h2>50y以内からの2打以上率</h2><strong>${rate(t.approachRate)}</strong><p>ミス${t.approachMisses}回 / 対象${t.approachAttempts}回</p><div class="reference-metrics"><span>50y以上から直接ON <b>${t.directCount}回 / ${rate(t.directRate)}</b></span><span>3パット以上 <b>${t.threePutts}H</b></span></div></section>
      ${trendView(ctx)}
      <div class="section-heading"><h2>スコアカード</h2></div>${halfMatrix(ctx, 0)}${halfMatrix(ctx, 9)}
      <div class="result-actions"><button class="primary" data-action="export">画像を保存</button><button class="secondary" data-action="resume">記録を再開</button></div>${backupView(ctx)}`;
  }
  function penaltyReviewView(ctx) {
    const { state, ui } = ctx;
    const review = Core.reviewRound(state, ui.reviewFilter);
    const metrics = [['罰打のみ', review.penaltyOnly], ['罰打＋ミス', review.both], ['ミスのみ', review.mistakeOnly],
      ...(review.noIssue ? [['該当なし', review.noIssue]] : []), ...(review.invalid ? [['要確認', review.invalid]] : [])];
    return `<section class="penalty-review"><div class="penalty-review-hero"><div class="penalty-review-heading"><h2>大叩きの振り返り</h2><span>対象 ${review.rows.length}H</span></div><div class="penalty-review-tabs" role="group" aria-label="振り返り対象">${[['all', '全ホール'], ['double', 'ダボ以上'], ['triple', 'トリプル以上']].map(([key, label]) => `<button data-review-filter="${key}" class="${ui.reviewFilter === key ? 'active' : ''}" aria-pressed="${ui.reviewFilter === key}">${label}</button>`).join('')}</div><div class="penalty-review-metrics">${metrics.map(([label, n]) => `<div><span>${label}</span><strong>${n}<small>H</small></strong></div>`).join('')}</div></div><div class="surface penalty-review-list"><h3>ホールごとの振り返り</h3><div class="penalty-review-columns"><span>ホール</span><span>スコア</span><span>判定</span></div>${review.rows.length ? review.rows.map(row => penaltyReviewRow(ctx, row)).join('') : '<p class="review-empty">対象のホールはありません。</p>'}</div></section>`;
  }
  function penaltyReviewRow(ctx, row) {
    const { state } = ctx;
    return `<article class="penalty-review-row" data-review-hole="${row.index}"><div><button data-hole="${row.index}" aria-label="${esc(courseName(ctx, row.half))} ${row.number}Hを編集">${row.number}H</button><small>${row.half === 0 ? '前半' : '後半'} ${esc(courseName(ctx, row.half))} / PAR ${row.par}</small></div><div class="review-score ${row.score >= row.par + 3 ? 'triple' : row.score === row.par + 2 ? 'double' : ''}"><strong>${row.score}</strong><small>${row.score >= row.par + 3 ? 'トリプル以上' : row.score === row.par + 2 ? 'ダボ' : scoreName(state.holes[row.index])}</small></div><div class="review-tags">${row.tags.length ? row.tags.map(tag => `<span class="review-tag ${tag === 'OB' || tag === 'ワンペナ' ? 'penalty' : 'mistake'}">${tag}</span>`).join('') : '<span class="review-no-tags">—</span>'}</div></article>`;
  }
  const tone = row => row.good === null ? 'neutral' : row.good ? 'good' : 'bad';
  function comparisonView(ctx) {
    const { state, database, ui } = ctx;
    return `<section class="comparison-section"><div class="section-heading"><h2>目標と実績</h2><button class="text-button" data-action="goals">目標設定</button></div><div class="scope-tabs" role="group" aria-label="比較範囲">${[['all', '18H'], ['out', courseName(ctx, 0)], ['in', courseName(ctx, 1)]].map(([key, label]) => `<button data-scope="${key}" class="${ui.scope === key ? 'active' : ''}" aria-pressed="${ui.scope === key}">${esc(label)}</button>`).join('')}</div><div class="comparison-wrap"><table class="comparison-table"><thead><tr><th scope="col">指標</th><th scope="col">実績</th><th scope="col">目標</th><th scope="col">差分</th></tr></thead><tbody>${Core.compare(state.holes, database.goals, ui.scope).map(row => `<tr data-metric="${row.key}"><th scope="row">${row.label}</th><td>${row.actual === null ? '対象なし' : `${number(row.actual)}${row.unit}`}</td><td>${number(row.target)}${row.unit}${row.highIsGood ? '以上' : '以下'}</td><td class="${tone(row)}">${row.diff === null ? row.actual === null ? '—' : '入力不足' : `${signed(row.diff)}${row.diffUnit}`}</td></tr>`).join('')}</tbody></table></div><details class="help"><summary>集計条件</summary><p>打数と率は入力完了ホールから計算します。直接ONは50y以内の対象外。途中終了時、打数・OBの目標差分は対象の9H/18Hが揃うまで表示しません。前後半の目標は等分（スコアの端数は前半へ配分）。目標は分析用の目安で、指標同士は合算しません。</p></details></section>`;
  }
  function goalsView(ctx) {
    const { ui } = ctx;
    const fields = [['score', '総スコア（打以下）', 1, 1620], ['ob', 'OB（回以下 / 18H）', 0, 162], ['approachRate', '50y以内2打以上率（%以下）', 0, 100], ['putts', 'パット（打以下 / 18H）', 0, 540], ['bogeyOnHoles', 'ボギーオン以内（H以上 / 18H）', 0, 18]];
    return `<section class="surface goals-panel"><h2>目標設定</h2><div class="goals-grid">${fields.map(([key, label, min, max]) => `<label>${label}<input data-goal="${key}" type="number" inputmode="${key === 'approachRate' ? 'decimal' : 'numeric'}" min="${min}" max="${max}" step="${key === 'approachRate' ? '0.1' : '1'}" value="${esc(ui.goalDraft[key])}"></label>`).join('')}</div><div class="result-actions"><button class="primary" data-action="save-goals">保存</button><button class="secondary" data-action="goals">キャンセル</button></div></section>`;
  }
  function halfMatrix(ctx, start) {
    const { state } = ctx;
    const holes = state.holes.slice(start, start + 9), t = sums(holes);
    const rows = [['H', holes.map((_, i) => holeNumber(ctx, start + i)), 'head'], ['PAR', holes.map(h => h.par)], ['50yまで', holes.map(h => fmt(h.long)), 'long'], ['50y→ON', holes.map(h => fmt(h.short)), 'short'], ['パット', holes.map(h => fmt(h.putts)), 'putts'], ['スコア', holes.map(h => fmt(score(h))), 'score'], ['OB', holes.map(h => h.obTee + h.obLater), 'ob'], ['バンカー', holes.map(h => fmt(h.bunker))]];
    return `<section class="surface half-section"><div class="half-head"><h3>${esc(courseName(ctx, start === 0 ? 0 : 1))}</h3><strong>${t.done ? t.score : '—'}<small>${t.done}/9H</small></strong></div><div class="matrix">${rows.map(([label, values, kind]) => `<div class="matrix-label">${label}</div>${values.map((value, i) => kind === 'head' ? `<button class="matrix-cell" data-hole="${start + i}" aria-label="${holeNumber(ctx, start + i)}Hを編集">${value}</button>` : `<div class="matrix-cell ${kind === 'score' ? 'score' : ''} ${scorecardTone(holes[i], kind)} ${value === '—' ? 'muted' : ''}">${value}</div>`).join('')}`).join('')}</div></section>`;
  }
  function teeChart(ctx, data) {
    const { ui } = ctx;
    if (!ui.teeClubs.length) return '<p class="tee-chart-empty" role="status">表示するクラブを選択してください。</p>';
    if (!data.total) return '<p class="tee-chart-empty" role="status">選択したクラブの方向記録はありません。</p>';
    const description = data.series.flatMap(series => Object.entries(series.counts).filter(([, n]) => n.safe + n.ob).map(([direction, n]) => `${TEE_CLUB_STYLES[series.key].label}・${TEE[direction]}：OBなし${n.safe}H、OBあり${n.ob}H`)).join('。');
    let svg = `<svg viewBox="0 0 350 196" role="img" aria-labelledby="tee-chart-title tee-chart-description" data-axis-max="${data.axisMax}"><title id="tee-chart-title">選択したクラブのティー方向・対象${data.total}H</title><desc id="tee-chart-description">${description}。OBはティーショットのみ、同一ホールの複数OBも1Hとして集計。</desc><defs><pattern id="tee-ob-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V8" stroke="#fff" stroke-opacity=".66" stroke-width="3"/></pattern></defs>`;
    for (let tick = 0; tick <= data.axisMax; tick += data.axisStep) {
      const x = 65 + tick / data.axisMax * 240;
      svg += `<line x1="${x}" y1="22" x2="${x}" y2="162" stroke="#e4ebe1"/><text x="${x}" y="13" text-anchor="middle" fill="#87988b" font-size="10">${tick}</text>`;
    }
    svg += '<text x="349" y="13" text-anchor="end" fill="#87988b" font-size="10">H</text>';
    Object.entries(TEE).forEach(([direction, label], i) => {
      const y = 30 + i * 52, n = data.directions[direction];
      svg += `<text x="0" y="${y + 19}" fill="#4c6656" font-size="12" font-weight="600">${label}</text><text x="349" y="${y + 19}" text-anchor="end" fill="#193e2b" font-size="13" font-weight="750">${n.total}<tspan font-size="10" font-weight="500">H</tspan></text>`;
      let x = 65;
      data.series.forEach(series => {
        const style = TEE_CLUB_STYLES[series.key];
        ['safe', 'ob'].forEach(kind => {
          const count = series.counts[direction][kind];
          if (!count) return;
          const width = count / data.axisMax * 240;
          svg += `<g data-tee-segment="${series.key}" data-direction="${direction}" data-ob="${kind === 'ob'}" data-count="${count}"><title>${style.label}・${label}・OB${kind === 'ob' ? 'あり' : 'なし'} ${count}H</title><rect x="${x}" y="${y}" width="${width}" height="28" rx="3" fill="${style.color}"/>`;
          if (kind === 'ob') svg += `<rect x="${x}" y="${y}" width="${width}" height="28" rx="3" fill="url(#tee-ob-hatch)"/>`;
          svg += `<rect x="${x}" y="${y}" width="${width}" height="28" rx="3" fill="none" stroke="#fff" stroke-width="1.5"/><text x="${x + width / 2}" y="${y + 18}" text-anchor="middle" font-size="11" font-weight="750" fill="${style.ink}" stroke="${style.color}" stroke-width="2" paint-order="stroke">${count}</text></g>`;
          x += width;
        });
      });
      svg += `<text x="305" y="${y + 43}" text-anchor="end" fill="${n.ob ? '#a16132' : '#8e9e91'}" font-size="10" font-weight="600">OB ${n.ob}H</text>`;
    });
    return svg + '</svg>';
  }
  function teeChartView(ctx) {
    const { state, ui } = ctx;
    const data = Core.teeShotBreakdown(state.holes, ui.teeClubs), all = ui.teeClubs.length === Object.keys(CLUBS).length;
    const unknown = data.unknownClub ? `<p class="tee-missing"><i style="--club:#a6b1ab"></i>クラブ未記録 ${data.unknownClub}H${all ? 'を灰色で表示' : 'は「すべて」で表示'}</p>` : '';
    const missing = data.missingDirection ? `<p class="tee-missing">方向未記録 ${data.missingDirection}H（うちOBあり${data.missingDirectionOB}H）はグラフ対象外</p>` : '';
    return `<article class="surface trend-card tee-chart-card"><h3>ティーショットの方向<small>対象 ${data.total}H</small></h3><div class="tee-filter-heading"><span>クラブを選択（複数可）</span><button data-tee-filter="all" class="tee-select-all ${all ? 'active' : ''}" aria-pressed="${all}">すべて</button></div><div class="tee-filters" role="group" aria-label="表示するティーショットのクラブ">${Object.keys(CLUBS).map(key => {
      const active = ui.teeClubs.includes(key), style = TEE_CLUB_STYLES[key];
      return `<button class="tee-filter ${active ? 'active' : ''}" style="--club:${style.color}" data-tee-filter="${key}" aria-pressed="${active}"><i aria-hidden="true"></i><span>${style.label}</span><span class="tee-check" aria-hidden="true">${active ? '✓' : '＋'}</span></button>`;
    }).join('')}</div><div class="tee-ob-legend"><i aria-hidden="true"></i><span>斜線＝OBあり / 斜線なし＝OBなし</span></div><div class="tee-chart">${teeChart(ctx, data)}</div>${unknown}${missing}<p class="tee-chart-note">数字は選択したクラブのホール数。横軸の目盛りは固定。<br>ティーOBのみを判定し、複数OBも1Hとして数えます。</p></article>`;
  }
  function trendView(ctx) {
    const { state } = ctx;
    const stats = sums(state.holes);
    const card = (title, total, labels, counts, multi = false) => `<article class="surface trend-card"><h3>${title}<small>${multi ? '複数選択 · ' : ''}記録 ${total}H</small></h3>${total ? Object.entries(labels).map(([key, label]) => `<div class="trend-row ${key === 'none' || key === 'good' ? 'good' : ''}"><span>${label}</span><span class="trend-track"><i style="width:${counts[key] / total * 100}%"></i></span><b>${counts[key]}H</b></div>`).join('') : '<div class="trend-empty">—</div>'}</article>`;
    return `<section><div class="section-heading"><h2>ショットの傾向</h2></div><div class="trend-grid">${teeChartView(ctx)}${card('50y以内の記録', stats.approachRecorded, { none: 'ミスなし', ...APPROACH }, stats.approachNotes, true)}</div><p class="reference-line">ティーショットのショート ${stats.teeShortCount}H / 記録${stats.teeShortRecorded}H（${rate(stats.teeShortRate)}）</p></section>`;
  }
  function historyView(ctx) {
    const { state, database } = ctx;
    const rounds = database.rounds.filter(r => Core.hasRoundData(r)).sort((a, b) => b.date.localeCompare(a.date) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return `<section><div class="section-heading"><h1 class="page-title">ラウンド履歴</h1><span>${rounds.length}件</span></div><div class="backup-actions"><button class="secondary" data-action="export-json">JSON出力</button><button class="secondary" data-action="import-json">JSON復元</button><input id="import-file" type="file" accept=".json,application/json" hidden></div><div class="history-list">${rounds.length ? rounds.map(r => `<button class="history-row" data-round="${esc(r.id)}"><span><strong>${esc(r.date || '日付未設定')}</strong><small>${esc(r.place || 'ゴルフ場未入力')}</small></span><span>${r.finished ? '終了' : '記録中'} · ${sums(r.holes).done}/18H</span></button>`).join('') : '<p class="empty-history">記録はありません</p>'}</div>${state.finished ? growthView(ctx, rounds) : ''}</section>`;
  }
  function growthView(ctx, rounds) {
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
  function appView(ctx) {
    const { state, ui, isPreview, saveStatus } = ctx;
    return `<header class="masthead"><div class="shell ${state.view === 'result' ? 'result-shell' : ''}"><span class="brand">ROUNDNOTE</span><span class="save-status${saveStatus === '保存できません' ? ' error' : ''}" id="save-status" role="status">${saveStatus}</span></div></header>
      <main class="shell ${state.view === 'result' ? 'result-shell' : ''}">
        ${isPreview ? '<aside class="preview-note"><span>プレビュー</span><button class="text-button" data-action="sample">サンプル</button></aside>' : ''}
        <nav class="tabs" aria-label="画面切替">${[['input', '記録'], ['result', '集計'], ['history', '履歴']].map(([key, label]) => `<button class="tab ${state.view === key ? 'active' : ''}" data-view="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>
        ${ui.message ? `<p class="app-message" role="status">${esc(ui.message)}</p>` : ''}
        ${state.view === 'input' ? inputView(ctx) : state.view === 'history' ? historyView(ctx) : resultView(ctx)}
        <footer class="footer-row"><details class="help"><summary>入力について</summary><p>スコア＝50y以内まで＋50y以内からON＋パット。罰打は各打数に含めます。OB欄は回数のみ。ティーのショートにはチョロ・ダフリなどの飛距離不足も含みます。</p></details><button class="text-button" data-action="new-round">新規ラウンド</button></footer>
      </main>`;
  }

  return Object.freeze({ appView, inputView, resultView, historyView, startSettingsView,
    TEE_CLUB_STYLES, esc, fmt, sgn, number, rate, signed, scoreName });
});
