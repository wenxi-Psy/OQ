/* OQ-45.2 页面逻辑
 * 全部计算在浏览器内完成，不发起任何网络请求。
 */
(function () {
  'use strict';

  const STORE_KEY = 'oq45_records_v1';
  const $  = (id) => document.getElementById(id);
  const answers = new Array(45).fill(null);   // 0–4 | 'na' | null
  let current = null;                          // 当前这次的计分结果

  /* ══════════ 运行环境 ══════════ */

  /* App 内置浏览器（WebView）的存储是按 App 隔离的：在微信里填的记录，
   * 换到 Safari / Chrome 就看不到；部分 App 还会在关闭后清掉。
   * UA 匹配是启发式的，只用来提醒，不影响任何功能。 */
  const IN_APP_BROWSERS = [
    { re: /MicroMessenger/i,                     name: '微信' },
    { re: /\bQQ\/[\d.]+/i,                       name: 'QQ' },
    { re: /Weibo/i,                              name: '微博' },
    { re: /AlipayClient/i,                       name: '支付宝' },
    { re: /DingTalk/i,                           name: '钉钉' },
    { re: /Lark|Feishu/i,                        name: '飞书' },
    { re: /xhsdiscover|XHS/i,                    name: '小红书' },
    { re: /aweme|BytedanceWebview/i,             name: '抖音' },
    { re: /FBAN|FBAV|Instagram|Line\//i,         name: '社交 App' },
  ];

  function inAppBrowser() {
    const ua = navigator.userAgent || '';
    const hit = IN_APP_BROWSERS.find((x) => x.re.test(ua));
    return hit ? hit.name : null;
  }

  /* 真写一次再读回来。无痕模式下 localStorage 存在但写入会抛错，
   * 只判断 'localStorage' in window 是不够的。 */
  function storageWorks() {
    try {
      const k = '__oq_probe__';
      localStorage.setItem(k, '1');
      const ok = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function renderEnvWarning() {
    const card = $('env-warn'), body = $('env-warn-body');
    const app = inAppBrowser();
    const canStore = storageWorks();
    if (canStore && !app) { card.hidden = true; return; }

    body.textContent = '';
    const add = (html) => {
      const p = document.createElement('p');
      p.innerHTML = html;
      body.appendChild(p);
    };

    if (!canStore) {
      $('env-warn-title').textContent = '这台设备上无法保存记录';
      add('这个浏览器不允许网页保存数据（常见于<strong>无痕/隐私模式</strong>）。'
        + '你可以正常填写和查看结果，但<strong>这次的结果不会被保存</strong>，也不会有变化趋势图。');
      add('如果需要追踪变化，请换成普通模式再填；或者在看完结果后用「保存为图片」把结果存下来。');
    } else if (app) {
      $('env-warn-title').textContent = `你正在 ${app} 里打开这个页面`;
      add(`记录会存在 ${app} 自带的浏览器里，<strong>换用手机自带的浏览器就看不到了</strong>，`
        + `部分 App 还会在关闭后清除。`);
      add(`想长期看到自己的变化趋势，建议点右上角的「···」选择<strong>「在浏览器中打开」</strong>，`
        + `并且以后<strong>每次都用同一个浏览器</strong>填写。`);
      add('只填这一次、不需要对比的话，在这里直接填也没问题。');
    }
    card.hidden = false;
  }

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
    card.hidden = false;   // 没有历史时也显示，给出手动输入的入口

    const list = loadRecords()
      .filter((x) => x.id !== current.id)
      .sort((a, b) => a.ts.localeCompare(b.ts));

    if (list.length) {
      const prev = list[list.length - 1];
      // 结果图片要用到，存一份
      current.compare = Object.assign(oqCompare(prev.total, current.total), { t1Date: prev.date });
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
    } else {
      const none = document.createElement('p');
      none.className = 'fieldnote';
      none.textContent = '这个浏览器里还没有以前的记录，所以暂时没法比较。'
        + '如果你以前在别的设备或浏览器上填过，可以在下面直接输入上次的总分。';
      body.appendChild(none);
    }

    body.appendChild(manualCompare(list.length > 0));
  }

  /* 换过设备/浏览器时，允许手动输入上次总分来做判定 */
  function manualCompare(hasHistory) {
    const box = document.createElement('details');
    box.className = 'manual';
    box.open = !hasHistory;

    const sum = document.createElement('summary');
    sum.textContent = '手动输入上次的总分来对比';
    box.appendChild(sum);

    const row = document.createElement('div');
    row.className = 'manual-body';

    const field = document.createElement('label');
    field.className = 'field';
    const cap = document.createElement('span');
    cap.textContent = '上次总分（0–180）';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0'; input.max = '180'; input.step = '1';
    input.inputMode = 'numeric';
    input.placeholder = '例如 95';
    field.append(cap, input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '对比';

    const out = document.createElement('div');
    out.className = 'manual-out';

    const run = () => {
      out.textContent = '';
      const v = Number(input.value);
      if (input.value.trim() === '' || !Number.isFinite(v) || v < 0 || v > 180) {
        const err = document.createElement('p');
        err.className = 'fieldnote';
        err.textContent = '请输入 0 到 180 之间的整数。';
        out.appendChild(err);
        return;
      }
      const rec = { date: '手动输入', total: Math.round(v) };
      current.compare = Object.assign(oqCompare(rec.total, current.total), { t1Date: rec.date });
      out.appendChild(compareBlock('你输入的上次记录', rec));
    };
    btn.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });

    row.append(field, btn);
    box.append(row, out);
    return box;
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
    const cAccent  = css.getPropertyValue('--accent').trim()  || '#426b78';
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
    const naIds = current.raw.map((v, i) => v === 'na' ? OQ_ITEMS[i].id : null).filter(Boolean);
    const head = ['日期', '编号', '基线', '总分', 'SD', 'IR', 'SR', '严重度分层', '选了不适用的题号'];
    const row  = [current.date, current.name, current.baseline ? '是' : '否',
                  r.total, r.dims.SD, r.dims.IR, r.dims.SR, r.severity.label,
                  naIds.join(' ')];
    // 逐题导出纸质题本的等价勾选值，未做反向计分，可直接与纸笔施测数据对齐。
    OQ_ITEMS.forEach((it, i) => {
      head.push(`q${it.id}(原始未反向)`);
      const v = oqPaperValue(i, current.raw[i]);
      row.push(v === null ? '' : v);
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
      raw_responses_note: '页面上记录的值：0–4 为勾选值，"na" 为「不适用」，null 为漏答。均未反向计分',
      raw: current.raw,
      paper_equivalent_note: '把「不适用」换算成纸质题本应勾的值（正向题 0，反向题 4），仍未反向计分',
      paper_equivalent: current.raw.map((v, i) => oqPaperValue(i, v)),
      na_items: current.raw.map((v, i) => v === 'na' ? OQ_ITEMS[i].id : null).filter(Boolean),
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

  /* 全部记录的导出 / 导入，用于换设备或换浏览器 */
  function exportAll() {
    const list = loadRecords();
    if (!list.length) { window.alert('本机还没有任何记录。'); return; }
    const data = { format: 'oq45-records', version: 1, exported_at: new Date().toISOString(), records: list };
    // 文件名用 ASCII：部分安卓文件管理器和聊天软件会弄坏中文文件名
    download('OQ45_all_records_' + todayISO() + '.json', JSON.stringify(data, null, 2), 'application/json');
  }

  function importAll(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let incoming;
      try {
        const parsed = JSON.parse(String(reader.result));
        incoming = Array.isArray(parsed) ? parsed : parsed.records;
      } catch (e) { incoming = null; }

      if (!Array.isArray(incoming)) {
        window.alert('这个文件读不出记录。请选择用「导出全部记录」生成的 JSON 文件。');
        return;
      }
      const valid = incoming.filter((r) =>
        r && typeof r.total === 'number' && Array.isArray(r.raw) && r.raw.length === 45 && r.ts);
      if (!valid.length) {
        window.alert('文件里没有可用的 OQ-45.2 记录。');
        return;
      }

      const existing = loadRecords();
      const seen = new Set(existing.map((r) => r.id));
      const added = valid.filter((r) => !seen.has(r.id));
      const merged = existing.concat(added).sort((a, b) => a.ts.localeCompare(b.ts));

      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(merged));
      } catch (e) {
        window.alert('导入失败：这个浏览器不允许保存数据。');
        return;
      }
      refreshCount();
      window.alert(`导入完成：新增 ${added.length} 份`
        + (valid.length - added.length ? `，跳过 ${valid.length - added.length} 份重复记录` : '')
        + `。本机现有 ${merged.length} 份。`);
    };
    reader.onerror = () => window.alert('文件读取失败，请重试。');
    reader.readAsText(file);
  }

  /* ══════════ 结果图片 ══════════
   * 手机浏览器的 window.print() 多数只给打印机选项，App 内置浏览器里常常
   * 完全没反应。生成一张图片让用户长按保存，是移动端最可靠的带走方式。
   * 用 canvas 手绘而不是引第三方库：中文由系统字体渲染，不需要嵌字体。 */

  const IMG_W = 640;                    // 逻辑宽度，最终按 2 倍像素输出
  const IMG_PAD = 40;
  const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", '
             + '"Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';
  // 图片固定用浅色，便于打印和在深色聊天界面里查看
  const IMG_C = {
    bg: '#ffffff', ink: '#2c2a26', soft: '#56514a', muted: '#8a837a',
    line: '#e6e0d6', lineSoft: '#f2eee7', accent: '#426b78', warm: '#a8734a',
  };

  function setFont(ctx, weight, size) { ctx.font = `${weight} ${size}px ${FONT}`; }

  /* 按字符折行，中英文都适用 */
  function wrapText(ctx, text, maxW) {
    const lines = [];
    let line = '';
    for (const ch of text) {
      if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; }
      else line += ch;
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * 把结果画到 ctx 上，返回内容总高度。
   * @param {boolean} dry 只量高度不落笔（用来确定画布尺寸）
   */
  function drawCard(ctx, dry) {
    const r = current.result;
    const W = IMG_W, P = IMG_PAD, CW = W - P * 2;
    let y = 0;

    const text = (str, x, size, weight, color, align) => {
      setFont(ctx, weight, size);
      if (!dry) {
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(str, x, y);
      }
    };
    const rect = (x, yy, w, h, color, radius) => {
      if (dry) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      if (radius && ctx.roundRect) ctx.roundRect(x, yy, w, h, radius);
      else ctx.rect(x, yy, w, h);
      ctx.fill();
    };
    const rule = () => { rect(P, y, CW, 1, IMG_C.lineSoft); y += 1; };
    const bar = (val, max, cutoff) => {
      const h = 12;
      rect(P, y, CW, h, IMG_C.lineSoft, h / 2);
      rect(P, y, Math.max(h, CW * Math.min(1, val / max)), h, IMG_C.accent, h / 2);
      const cx = P + CW * (cutoff / max);
      rect(cx - 1, y - 4, 2, h + 8, IMG_C.soft);
      // 刻度线比条高出 4px，标签基线要让开这段，否则字会压在条上
      y += h + 22;
      // 标签贴边时收进来，避免超出画布
      const lblX = Math.min(Math.max(cx, P + 30), W - P - 30);
      text(`参考线 ${cutoff}`, lblX, 15, '400', IMG_C.muted, 'center');
      y += 12;
    };

    // ── 抬头
    y += 54;
    text('OQ-45.2 心理咨询效果问卷', P, 20, '400', IMG_C.muted);
    y += 40;
    text('我的结果', P, 34, '600', IMG_C.ink);
    y += 30;
    const meta = [current.date, current.name && ('编号 ' + current.name),
                  current.baseline && '基线'].filter(Boolean).join('　·　');
    text(meta, P, 19, '400', IMG_C.muted);
    y += 28;
    rule();
    y += 34;

    // ── 总分
    text('总分', P, 20, '600', IMG_C.ink);
    y += 62;
    text(String(r.total), P, 68, '300', IMG_C.ink);
    setFont(ctx, '300', 68);
    const numW = ctx.measureText(String(r.total)).width;
    text('/ 180', P + numW + 14, 20, '400', IMG_C.muted);
    y += 22;
    bar(r.total, 180, 62);
    y += 14;
    text(r.aboveCutoff ? '总分达到或超过划界分 62' : '总分低于划界分 62',
         P, 21, '600', r.aboveCutoff ? IMG_C.warm : IMG_C.accent);
    y += 26;
    text(`严重度分层：${r.severity.label}（美国常模参考）`, P, 17, '400', IMG_C.muted);
    y += 30;
    rule();
    y += 34;

    // ── 三个维度
    text('三个方面', P, 20, '600', IMG_C.ink);
    y += 12;
    ['SD', 'IR', 'SR'].forEach((k) => {
      const n = OQ_NORMS[k], v = r.dims[k];
      y += 30;
      text(`${n.label}（${k}）`, P, 18, '600', IMG_C.soft);
      text(`${v} / ${n.max}`, W - P, 18, '400', IMG_C.muted, 'right');
      y += 12;
      bar(v, n.max, n.cutoff);
    });
    y += 4;
    text('维度分只作定性线索，参考线取自美国常模', P, 15, '400', IMG_C.muted);
    y += 30;

    // ── 与上次比
    if (current.compare) {
      rule();
      y += 34;
      text('和上一次比', P, 20, '600', IMG_C.ink);
      y += 34;
      const c = current.compare;
      const dir = c.delta > 0 ? '下降' : c.delta < 0 ? '上升' : '持平';
      text(c.label, P, 24, '600',
           c.key === 'deteriorated' ? IMG_C.warm : IMG_C.accent);
      y += 30;
      text(`与 ${c.t1Date}（总分 ${c.t1}）相比，总分${dir} ${Math.abs(c.delta)} 分`,
           P, 18, '400', IMG_C.soft);
      y += 24;
      text('判定用中国常模：可信变化指数 17、划界分 62', P, 15, '400', IMG_C.muted);
      y += 30;
    }

    // ── 关键题
    if (r.critical.length) {
      rule();
      y += 34;
      text('建议在会谈中谈到的几题', P, 20, '600', IMG_C.ink);
      y += 12;
      r.critical.forEach((c) => {
        y += 28;
        setFont(ctx, '400', 18);
        const lines = wrapText(ctx, `第 ${c.id} 题　${c.text}`, CW - 90);
        lines.forEach((ln, i) => {
          text(ln, P, 18, '400', IMG_C.soft);
          if (i === 0) text(c.label, W - P, 16, '600', IMG_C.warm, 'right');
          if (i < lines.length - 1) y += 26;
        });
      });
      y += 30;
    }

    // ── 页脚
    rule();
    y += 30;
    setFont(ctx, '400', 15);
    const foot = 'OQ-45.2 是效果监测工具，不是诊断工具。分数高低不等于任何诊断，'
               + '结果需要由受过训练的临床工作者解读。划界分 62、可信变化指数 17 '
               + '来自中国常模（李钰静, 2010）。';
    wrapText(ctx, foot, CW).forEach((ln) => {
      text(ln, P, 15, '400', IMG_C.muted);
      y += 22;
    });
    y += 22;
    return y;
  }

  function buildImage() {
    // 先在一张临时画布上量高度，再按真实尺寸重画
    const probe = document.createElement('canvas').getContext('2d');
    const h = Math.ceil(drawCard(probe, true));

    const scale = 2;
    const cv = document.createElement('canvas');
    cv.width = IMG_W * scale;
    cv.height = h * scale;
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = IMG_C.bg;
    ctx.fillRect(0, 0, IMG_W, h);
    drawCard(ctx, false);
    return cv;
  }

  function showImage() {
    let url;
    try {
      url = buildImage().toDataURL('image/png');
    } catch (e) {
      window.alert('图片生成失败，请改用「复制为文字」。');
      return;
    }
    $('img-out').src = url;
    $('img-download').dataset.url = url;
    $('img-tip').textContent = (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
      ? '长按图片即可保存到相册，或直接转发给咨询师'
      : '右键图片可另存为，也可以点下面的「下载图片」';
    $('img-overlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hideImage() {
    $('img-overlay').hidden = true;
    $('img-out').removeAttribute('src');
    document.body.style.overflow = '';
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
    renderEnvWarning();

    $('btn-start').addEventListener('click', () => showScreen('screen-form'));
    $('btn-back-intro').addEventListener('click', () => showScreen('screen-intro'));
    $('btn-submit').addEventListener('click', onSubmit);

    $('btn-copy').addEventListener('click', copyText);
    $('btn-csv').addEventListener('click', exportCSV);
    $('btn-json').addEventListener('click', exportJSON);
    $('btn-print').addEventListener('click', () => window.print());
    $('btn-image').addEventListener('click', showImage);

    $('btn-export-all').addEventListener('click', exportAll);
    $('btn-import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importAll(f);
      e.target.value = '';          // 允许重复选同一个文件
    });

    $('img-close').addEventListener('click', hideImage);
    $('img-overlay').addEventListener('click', (e) => {
      if (e.target === $('img-overlay')) hideImage();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('img-overlay').hidden) hideImage();
    });
    $('img-download').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = $('img-download').dataset.url || '';
      a.download = fileStem() + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

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
