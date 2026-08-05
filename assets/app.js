/* OQ-45.2 页面逻辑
 * 全部计算在浏览器内完成，不发起任何网络请求。
 */
(function () {
  'use strict';

  const STORE_KEY = 'oq45_records_v1';
  const $  = (id) => document.getElementById(id);
  const answers = new Array(45).fill(null);   // 0–4 | 'na' | null
  let current = null;                          // 当前这次的计分结果

  /* ══════════ 本机记录 ══════════ */

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];   // 隐私模式或存储被禁用时静默降级
    }
  }

  function saveRecord(rec) {
    try {
      const list = loadRecords();
      list.push(rec);
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearRecords() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 忽略 */ }
  }

  function refreshCount() {
    $('intro-count').textContent = loadRecords().length;
  }

  /* ══════════ 说明页 ══════════ */

  function todayISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function showScreen(id) {
    ['screen-intro', 'screen-form', 'screen-result'].forEach((s) => {
      $(s).hidden = (s !== id);
    });
    window.scrollTo(0, 0);
  }

  /* ══════════ 填答页 ══════════ */

  function buildItems() {
    const form = $('items');
    const frag = document.createDocumentFragment();

    OQ_ITEMS.forEach((item, idx) => {
      // 用 div[role=radiogroup] 而不是 fieldset/legend：
      // legend 上的 display:flex 在各浏览器表现不一致，不适合做自定义排版。
      const fs = document.createElement('div');
      fs.className = 'item';
      fs.id = 'item-' + item.id;
      fs.dataset.index = idx;
      fs.setAttribute('role', 'radiogroup');
      fs.setAttribute('aria-labelledby', 'lbl-' + item.id);

      const legend = document.createElement('p');
      legend.className = 'item-q';
      legend.id = 'lbl-' + item.id;
      const num = document.createElement('span');
      num.className = 'item-num';
      num.textContent = item.id + '.';
      const txt = document.createElement('span');
      txt.textContent = item.text;

      if (item.hint) {
        const h = document.createElement('small');
        h.className = 'item-hint';
        h.textContent = item.hint;
        txt.appendChild(h);
      }
      if (item.naHint) {
        const h = document.createElement('small');
        h.className = 'item-hint strong';
        h.textContent = item.naHint;
        txt.appendChild(h);
      }
      legend.append(num, txt);
      fs.appendChild(legend);

      const opts = document.createElement('div');
      opts.className = 'opts';
      OQ_OPTIONS.forEach((label, val) => {
        opts.appendChild(makeOption(item, idx, String(val), label));
      });
      fs.appendChild(opts);

      if (item.na) {
        const wrap = document.createElement('div');
        wrap.className = 'opt-na';
        wrap.appendChild(makeOption(item, idx, 'na', item.naLabel || '不适用'));
        fs.appendChild(wrap);
      }

      frag.appendChild(fs);
    });

    form.appendChild(frag);
    form.addEventListener('change', onAnswer);
    form.addEventListener('keydown', onDigitKey);
  }

  function makeOption(item, idx, value, label) {
    const wrap = document.createElement('label');
    wrap.className = 'opt';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'q' + item.id;
    input.value = value;
    input.dataset.index = idx;
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(input, span);
    return wrap;
  }

  function firstUnanswered() {
    return answers.findIndex((a) => a === null);
  }

  function onAnswer(e) {
    const input = e.target;
    if (input.type !== 'radio') return;
    const idx = Number(input.dataset.index);
    const wasFirstOpen = firstUnanswered();

    answers[idx] = input.value === 'na' ? 'na' : Number(input.value);
    const card = $('item-' + OQ_ITEMS[idx].id);
    card.classList.add('answered');
    card.classList.remove('flagged');
    updateProgress();

    // 只在「顺着往下填」时自动前进；回头改答案不打断阅读。
    if (idx === wasFirstOpen) {
      const next = firstUnanswered();
      if (next > -1 && next > idx) {
        const el = $('item-' + OQ_ITEMS[next].id);
        const rect = el.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 8 || rect.top < 56) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  }

  /* 键盘 1–5 为当前聚焦的题作答，并把焦点交给下一道未答题 */
  function onDigitKey(e) {
    if (e.key < '1' || e.key > '5' || e.metaKey || e.ctrlKey || e.altKey) return;
    const fs = e.target.closest('.item');
    if (!fs) return;
    const val = Number(e.key) - 1;
    const input = fs.querySelector(`input[value="${val}"]`);
    if (!input) return;
    e.preventDefault();
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // 不移焦的话，后续按键会一直改同一道题。
    // preventScroll：滚动交给 onAnswer 里的平滑滚动处理，避免两处打架。
    const next = firstUnanswered();
    if (next > -1) {
      const el = $('item-' + OQ_ITEMS[next].id).querySelector('input');
      if (el) el.focus({ preventScroll: true });
    } else {
      $('btn-submit').focus({ preventScroll: true });
    }
  }

  function updateProgress() {
    const n = answers.filter((a) => a !== null).length;
    $('progress-count').textContent = n;
    $('progress-fill').style.width = (n / 45 * 100) + '%';
  }

  function onSubmit() {
    const box = $('validation');
    const missing = [];
    answers.forEach((a, i) => { if (a === null) missing.push(OQ_ITEMS[i].id); });

    OQ_ITEMS.forEach((it) => $('item-' + it.id).classList.remove('flagged'));

    if (missing.length >= 5) {
      missing.forEach((id) => $('item-' + id).classList.add('flagged'));
      box.hidden = false;
      box.textContent = `还有 ${missing.length} 题没有作答：第 ${missing.join('、')} 题。`
        + '按 OQ-45.2 的规定，漏答 5 题及以上整份问卷作废，请补答后再提交。';
      $('item-' + missing[0]).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (missing.length > 0) {
      const ok = window.confirm(
        `第 ${missing.join('、')} 题还没有作答。\n\n`
        + '继续的话，这几题会按 OQ-45.2 的规定，用同一维度其余题目的平均分填补。\n\n'
        + '「取消」回去补答，「确定」直接出结果。'
      );
      if (!ok) {
        missing.forEach((id) => $('item-' + id).classList.add('flagged'));
        box.hidden = false;
        box.textContent = `待补答：第 ${missing.join('、')} 题。`;
        $('item-' + missing[0]).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    box.hidden = true;
    const result = oqScore(answers);
    if (!result.valid) { box.hidden = false; box.textContent = result.message; return; }

    current = {
      id: 'r' + Date.now(),
      ts: new Date().toISOString(),
      date: $('meta-date').value || todayISO(),
      name: $('meta-name').value.trim(),
      baseline: $('meta-baseline').checked,
      raw: answers.slice(),
      total: result.total,
      dims: result.dims,
      result,
    };

    const stored = { ...current };
    delete stored.result;                 // 存原始作答即可，结果可随时重算
    current.saved = saveRecord(stored);

    // 先显示再渲染：趋势图需要量容器的实际宽度，隐藏时量到的是 0。
    showScreen('screen-result');
    renderResult();
  }

  /* ══════════ 结果页 ══════════ */

  function pct(v, max) { return Math.max(0, Math.min(100, v / max * 100)); }

  function markEl(cutoff, max, label) {
    const p = pct(cutoff, max);
    const el = document.createElement('div');
    el.className = 'gauge-mark' + (p < 12 ? ' edge-l' : p > 88 ? ' edge-r' : '');
    el.style.left = p + '%';
    const s = document.createElement('span');
    s.textContent = label;
    el.appendChild(s);
    return el;
  }

  function renderResult() {
    const r = current.result;

    // —— 抬头
    const bits = [];
    if (current.name) bits.push('编号 ' + current.name);
    bits.push(current.date);
    if (current.baseline) bits.push('基线');
    if (!current.saved) bits.push('未能保存到本机（浏览器禁用了本地存储）');
    $('result-meta').textContent = bits.join(' · ');

    // —— 第 8 题
    const safety = $('safety-card');
    if (r.suicidalItem) {
      safety.hidden = false;
      $('safety-line').innerHTML =
        `第 8 题「我有结束自己生命的想法」，你选了<strong>「${r.suicidalItem.label}」</strong>。`;
    } else {
      safety.hidden = true;
    }

    // —— 总分
    $('total-num').textContent = r.total;
    $('total-fill').style.width = pct(r.total, 180) + '%';
    const gauge = $('total-gauge');
    gauge.querySelectorAll('.gauge-mark').forEach((n) => n.remove());
    gauge.appendChild(markEl(OQ_NORMS.total.cutoff, 180, '划界分 62'));

    const verdict = $('total-verdict');
    if (r.aboveCutoff) {
      verdict.className = 'verdict over';
      verdict.textContent = '总分达到或超过划界分 62。';
    } else {
      verdict.className = 'verdict under';
      verdict.textContent = '总分低于划界分 62。';
    }
    $('severity-label').textContent = r.severity.label;

    // —— 三个维度
    const dimBox = $('dims');
    dimBox.textContent = '';
    ['SD', 'IR', 'SR'].forEach((key) => {
      const n = OQ_NORMS[key];
      const v = r.dims[key];
      const row = document.createElement('div');
      row.className = 'dim';

      const top = document.createElement('div');
      top.className = 'dim-top';
      const name = document.createElement('span');
      name.className = 'dim-name';
      name.textContent = `${n.label}（${key}）`;
      const val = document.createElement('span');
      val.className = 'dim-val';
      val.innerHTML = `<b>${v}</b> / ${n.max}`;
      top.append(name, val);

      const g = document.createElement('div');
      g.className = 'dim-gauge';
      const track = document.createElement('div');
      track.className = 'gauge-track';
      const fill = document.createElement('div');
      fill.className = 'gauge-fill';
      fill.style.width = pct(v, n.max) + '%';
      track.appendChild(fill);
      g.append(track, markEl(n.cutoff, n.max, '参考线 ' + n.cutoff));

      row.append(top, g);
      dimBox.appendChild(row);
    });
    $('sr-note').hidden = r.dims.SR >= OQ_NORMS.SR.cutoff;

    renderCompare();
    renderTrend();

    // —— 关键题
    const cCard = $('critical-card'), cList = $('critical-list');
    cList.textContent = '';
    if (r.critical.length) {
      cCard.hidden = false;
      r.critical.forEach((c) => {
        const li = document.createElement('li');
        const head = document.createElement('div');
        head.className = 'ci-head';
        const t = document.createElement('span');
        t.textContent = `第 ${c.id} 题　${c.text}`;
        const a = document.createElement('span');
        a.className = 'ci-ans';
        a.textContent = c.label;
        head.append(t, a);
        const note = document.createElement('p');
        note.className = 'ci-note';
        note.textContent = OQ_CRITICAL_NOTES[c.id] || '';
        li.append(head, note);
        cList.appendChild(li);
      });
    } else {
      cCard.hidden = true;
    }

    // —— 漏答填补
    const iCard = $('imputed-card');
    if (r.imputed.length) {
      iCard.hidden = false;
      $('imputed-body').textContent =
        `你有 ${r.imputed.length} 题未作答（第 ${r.imputed.map((x) => x.id).join('、')} 题），`
        + '结果中这几题的分数是按同一维度其余题目的平均分估算的。'
        + '这会让总分带一点不确定性，下次尽量答完整。';
    } else {
      iCard.hidden = true;
    }
  }

  /* 与历史记录比较（Jacobson-Truax） */
  function renderCompare() {
    const card = $('compare-card'), body = $('compare-body');
    body.textContent = '';

    const list = loadRecords()
      .filter((x) => x.id !== current.id)
      .sort((a, b) => a.ts.localeCompare(b.ts));

    if (!list.length) { card.hidden = true; return; }
    card.hidden = false;

    const prev = list[list.length - 1];
    body.appendChild(compareBlock('上一次', prev));

    const base = list.find((x) => x.baseline);
    if (base && base.id !== prev.id) {
      body.appendChild(compareBlock('基线', base));
    }

    const tail = document.createElement('p');
    tail.className = 'fieldnote';
    tail.innerHTML = '判定用中国常模：可信变化指数 <strong>17</strong>、划界分 <strong>62</strong>。'
      + '变化量小于 17 分时，还不能排除测量误差和日常心境波动的影响。';
    body.appendChild(tail);
  }

  function compareBlock(label, rec) {
    const c = oqCompare(rec.total, current.total);
    const box = document.createElement('div');
    box.className = 'dim';

    const tag = document.createElement('div');
    tag.className = 'jt ' + c.key;
    tag.textContent = c.label;

    const line = document.createElement('p');
    line.className = 'delta';
    const dir = c.delta > 0 ? '下降' : c.delta < 0 ? '上升' : '持平';
    line.innerHTML = `与${label}（${rec.date}，总分 ${rec.total}）相比，总分${dir}`
      + ` <b>${Math.abs(c.delta)}</b> 分。`;

    const mean = document.createElement('p');
    mean.className = 'fieldnote';
    mean.textContent = c.meaning;

    box.append(tag, line, mean);
    return box;
  }

  /* 总分趋势图（纯 SVG，无外部依赖） */
  function renderTrend() {
    const card = $('trend-card'), holder = $('trend-chart');
    holder.textContent = '';

    const list = loadRecords().sort((a, b) => a.ts.localeCompare(b.ts));
    if (list.length < 2) { card.hidden = true; return; }
    card.hidden = false;

    const padL = 32, padR = 14, padT = 12, padB = 30, h = 190;
    // 点少时铺满容器宽度，点多时按每点最小间距展开、由容器横向滚动。
    const gaps = list.length - 1;
    const avail = Math.max(260, holder.clientWidth || 320);
    const step = Math.max(56, (avail - padL - padR) / gaps);
    const w = padL + padR + step * gaps;
    const plotH = h - padT - padB;
    const x = (i) => padL + step * i;
    const y = (v) => padT + plotH - (v / 180) * plotH;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '总分随时间变化的折线图');

    const css = getComputedStyle(document.body);
    // SVG 的 presentation attribute 里用 var() 各浏览器支持不齐，先在 JS 里解析成实际色值
    const cAccent  = css.getPropertyValue('--accent').trim()  || '#4f7d8c';
    const cLine    = css.getPropertyValue('--line').trim()    || '#e6e0d6';
    const cMuted   = css.getPropertyValue('--muted').trim()   || '#857e74';
    const cSurface = css.getPropertyValue('--surface').trim() || '#ffffff';

    const add = (tag, attrs, text) => {
      const el = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      if (text != null) el.textContent = text;
      svg.appendChild(el);
      return el;
    };

    // Y 轴刻度
    [0, 60, 120, 180].forEach((v) => {
      add('line', { x1: padL, y1: y(v), x2: w - padR, y2: y(v), stroke: cLine, 'stroke-width': 1 });
      add('text', { x: padL - 6, y: y(v) + 4, 'text-anchor': 'end',
                    'font-size': 10, fill: cMuted }, v);
    });

    // 划界分 62
    add('line', { x1: padL, y1: y(62), x2: w - padR, y2: y(62),
                  stroke: cMuted, 'stroke-width': 1, 'stroke-dasharray': '4 3' });

    add('polyline', {
      points: list.map((r, i) => `${x(i)},${y(r.total)}`).join(' '),
      fill: 'none', stroke: cAccent, 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    });

    list.forEach((r, i) => {
      const isNow = r.id === current.id;
      const dot = add('circle', {
        cx: x(i), cy: y(r.total), r: isNow ? 5.5 : 4,
        fill: isNow ? cAccent : cSurface,
        stroke: cAccent, 'stroke-width': 2,
      });
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${r.date}　总分 ${r.total}`;
      dot.appendChild(title);

      add('text', { x: x(i), y: y(r.total) - 11, 'text-anchor': 'middle',
                    'font-size': 11, 'font-weight': isNow ? 600 : 400,
                    fill: 'currentColor' }, r.total);
      add('text', { x: x(i), y: h - 10, 'text-anchor': 'middle',
                    'font-size': 10, fill: cMuted }, r.date.slice(5));
    });

    holder.appendChild(svg);
  }

  /* ══════════ 导出 ══════════ */

  function resultText() {
    const r = current.result;
    const L = [];
    L.push('OQ-45.2 结果');
    L.push('填写日期：' + current.date);
    if (current.name) L.push('编号：' + current.name);
    if (current.baseline) L.push('（基线）');
    L.push('');
    L.push(`总分：${r.total} / 180　（划界分 62，中国常模；${r.aboveCutoff ? '达到或超过' : '低于'}划界分）`);
    L.push(`严重度分层：${r.severity.label}（美国常模参考）`);
    L.push('');
    ['SD', 'IR', 'SR'].forEach((k) => {
      const n = OQ_NORMS[k];
      L.push(`${n.label} ${k}：${r.dims[k]} / ${n.max}　（美国参考线 ${n.cutoff}）`);
    });

    const list = loadRecords().filter((x) => x.id !== current.id)
      .sort((a, b) => a.ts.localeCompare(b.ts));
    if (list.length) {
      const prev = list[list.length - 1];
      const c = oqCompare(prev.total, current.total);
      L.push('');
      L.push(`与上一次（${prev.date}，总分 ${prev.total}）相比：Δ = ${c.delta} → ${c.label}`);
    }

    if (r.critical.length) {
      L.push('');
      L.push('建议在会谈中跟进：'
        + r.critical.map((c) => `第 ${c.id} 题（${c.label}）`).join('、'));
    }
    if (r.imputed.length) {
      L.push('漏答估算填补：第 ' + r.imputed.map((x) => x.id).join('、') + ' 题');
    }
    L.push('');
    L.push('常模：总分划界分 62、可信变化指数 17，李钰静 (2010)；');
    L.push('分量表参考线与严重度分层取自美国常模，仅供参考。');
    L.push('本量表为效果监测工具，不作诊断用途，结果需由受训临床工作者解读。');
    return L.join('\n');
  }

  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function fileStem() {
    return 'OQ45_' + (current.name ? current.name + '_' : '') + current.date;
  }

  function exportCSV() {
    const r = current.result;
    const head = ['日期', '编号', '基线', '总分', 'SD', 'IR', 'SR', '严重度分层'];
    const row  = [current.date, current.name, current.baseline ? '是' : '否',
                  r.total, r.dims.SD, r.dims.IR, r.dims.SR, r.severity.label];
    OQ_ITEMS.forEach((it, i) => {
      head.push(`q${it.id}(原始未反向)`);
      const v = current.raw[i];
      row.push(v === 'na' ? '不适用' : v === null ? '' : v);
    });
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = '﻿' + [head.map(esc).join(','), row.map(esc).join(',')].join('\r\n');
    download(fileStem() + '.csv', csv, 'text/csv');
  }

  function exportJSON() {
    const r = current.result;
    const data = {
      instrument: 'OQ-45.2',
      translation: '秦佑凤、胡姝婧 (2008) 中文版',
      date: current.date,
      name: current.name || null,
      baseline: current.baseline,
      raw_responses_note: '0–4 为作答者勾选的原始值，未做反向计分；"na" 为「不适用」',
      raw: current.raw,
      scored_note: '已完成反向计分与漏答填补',
      scored: r.scored,
      total: r.total,
      subscales: r.dims,
      imputed_items: r.imputed.map((x) => x.id),
      critical_items: r.critical.map((c) => ({ id: c.id, response: c.value })),
      norms: {
        total_cutoff: 62, total_rci: 17,
        total_source: '李钰静 (2010) 中国常模',
        subscale_source: '美国常模（仅供参考）',
      },
    };
    download(fileStem() + '.json', JSON.stringify(data, null, 2), 'application/json');
  }

  async function copyText() {
    const text = resultText();
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // 非安全上下文或旧浏览器的兜底
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* 忽略 */ }
      ta.remove();
    }
    const tip = $('copied');
    tip.hidden = false;
    setTimeout(() => { tip.hidden = true; }, 2200);
  }

  /* ══════════ 启动 ══════════ */

  function resetForm() {
    answers.fill(null);
    $('items').querySelectorAll('input[type=radio]').forEach((i) => { i.checked = false; });
    OQ_ITEMS.forEach((it) => $('item-' + it.id).classList.remove('answered', 'flagged'));
    $('validation').hidden = true;
    updateProgress();
  }

  function init() {
    $('meta-date').value = todayISO();
    buildItems();
    updateProgress();
    refreshCount();

    $('btn-start').addEventListener('click', () => showScreen('screen-form'));
    $('btn-back-intro').addEventListener('click', () => showScreen('screen-intro'));
    $('btn-submit').addEventListener('click', onSubmit);

    $('btn-copy').addEventListener('click', copyText);
    $('btn-csv').addEventListener('click', exportCSV);
    $('btn-json').addEventListener('click', exportJSON);
    $('btn-print').addEventListener('click', () => window.print());

    $('btn-again').addEventListener('click', () => {
      resetForm();
      refreshCount();
      showScreen('screen-intro');
    });

    const doClear = () => {
      if (!window.confirm('将删除这台设备上保存的全部 OQ-45.2 记录，且无法恢复。确定吗？')) return;
      clearRecords();
      refreshCount();
      $('compare-card').hidden = true;
      $('trend-card').hidden = true;
      window.alert('本机记录已清除。');
    };
    $('intro-clear').addEventListener('click', doClear);
    $('btn-clear').addEventListener('click', doClear);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
