/* OQ-45.2 页面逻辑
 * 全部计算在浏览器内完成，不发起任何网络请求。
 */
(function () {
  'use strict';

  const STORE_KEY = 'oq45_records_v1';
  const UID_KEY   = 'oq45_uid_v1';
  const $  = (id) => document.getElementById(id);
  const answers = new Array(45).fill(null);   // 0–4 | 'na' | null
  let current = null;                          // 当前这次的计分结果
  let startedAt = null;                        // 点「开始填写」的时刻，用于算作答时长

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
      $('env-warn-title').textContent = '这次的结果无法保存';
      add('浏览器不允许保存数据（常见于<strong>无痕模式</strong>）。'
        + '你可以正常填写和查看结果，但不会留下记录，也看不到变化趋势。');
    } else if (app) {
      $('env-warn-title').textContent = `你正在 ${app} 里打开`;
      add(`记录只会存在 ${app} 里，<strong>换用手机自带的浏览器就看不到了</strong>。`);
      add('想长期看到自己的变化，点右上角「···」选择<strong>「在浏览器中打开」</strong>，以后固定用同一个浏览器。');
    }
    card.hidden = false;
  }

  /* ══════════ 本机记录 ══════════ */

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(normalizeRecord) : [];
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

  /* 一条记录里的逐题作答：新记录存成 { q01: 2, q07: 'na', … } 的对象，
   * 旧记录只有数组，按题目顺序还原。数组靠位置对齐，题目顺序一旦调整就会整体错位，
   * 对象靠变量名对齐则不受影响，所以往后一律以 answers 为准。 */
  function normalizeRecord(rec) {
    if (!rec || typeof rec !== 'object') return rec;
    return Object.assign({}, rec, { raw: recordAnswers(rec) });
  }

  function recordAnswers(rec) {
    if (rec.answers && typeof rec.answers === 'object') {
      return OQ_ITEMS.map((it) => {
        const v = rec.answers[oqVariable(it.id)];
        return v === undefined ? null : v;
      });
    }
    return Array.isArray(rec.raw) ? rec.raw.slice() : new Array(OQ_ITEMS.length).fill(null);
  }

  function answersMap(list) {
    const out = {};
    OQ_ITEMS.forEach((it, i) => { out[oqVariable(it.id)] = list[i]; });
    return out;
  }

  /* ══════════ 匿名编号 ══════════
   * 存在这台设备上的一串随机字符，不含任何个人信息，也不会上传。
   * 作用只有一个：把同一个人的多次填写串起来——「编号或昵称」是可以留空、
   * 也可能每次写得不一样的，靠它做纵向对齐并不可靠。
   * 换设备时可以把这串字符抄到新设备上，记录就接得上。 */

  const UID_RE = /^[A-Za-z0-9_-]{4,64}$/;
  let uidCache = null;          // 存不进 localStorage 时至少在本次会话里保持一致
  let uidPersistent = true;

  function newUid() {
    const b = new Uint8Array(8);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
    else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    return 'oq-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  function getUid() {
    if (uidCache) return uidCache;
    let v = null;
    try { v = localStorage.getItem(UID_KEY); } catch (e) { /* 忽略 */ }
    if (!v || !UID_RE.test(v)) {
      v = newUid();
      uidPersistent = setUid(v);
    }
    uidCache = v;
    return v;
  }

  function setUid(v) {
    uidCache = v;
    try {
      localStorage.setItem(UID_KEY, v);
      uidPersistent = true;
    } catch (e) {
      uidPersistent = false;    // 无痕模式：本次会话里仍然可用，关掉页面就没了
    }
    return uidPersistent;
  }

  function renderUid() {
    const uid = getUid();
    $('uid-value').textContent = uid;
    $('uid-note').textContent = uidPersistent
      ? '这台设备有一串自动生成的匿名编号，不含个人信息，也不会上传。'
        + '换手机或换浏览器后，把它填到新设备上，导出的数据就还能认出是同一个人。'
        + '（本机已保存的记录不会跟着走，仍留在原来的设备上。）'
      : '浏览器不允许保存数据，这串编号只在本次填写有效；导出的文件里仍会带上它。';
  }

  async function copyUid() {
    const uid = getUid();
    try {
      await navigator.clipboard.writeText(uid);
      const tip = $('uid-copied');
      tip.hidden = false;
      setTimeout(() => { tip.hidden = true; }, 2000);
    } catch (e) {
      window.prompt('复制下面这串字符：', uid);
    }
  }

  function editUid() {
    const v = (window.prompt(
      '把旧设备上的匿名编号填进来，两边导出的数据就能对上。\n\n'
      + '只允许字母、数字、- 和 _，4–64 位。', getUid()) || '').trim();
    if (!v) return;
    if (!UID_RE.test(v)) { window.alert('这个编号不符合格式（字母、数字、- 或 _，4–64 位）。'); return; }
    setUid(v);
    renderUid();
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

    const done = new Date();
    current = {
      id: 'r' + Date.now(),
      uid: getUid(),
      uidPersistent,
      ts: done.toISOString(),
      date: $('meta-date').value || todayISO(),
      name: $('meta-name').value.trim(),
      baseline: $('meta-baseline').checked,
      // 作答时长是墙上时间，中途去做别的事也照算，只能当粗略参考。
      startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      completedAt: done.toISOString(),
      durationSec: startedAt ? Math.round((done.getTime() - startedAt) / 1000) : null,
      tzOffsetMin: -done.getTimezoneOffset(),   // 东八区为 +480
      itemsVersion: OQ_ITEMS_VERSION,
      scoringVersion: OQ_SCORING_VERSION,
      answers: answersMap(answers),             // 按变量名存，不依赖题目顺序
      raw: answers.slice(),                     // 兼容旧版读取逻辑
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
    gauge.appendChild(markEl(OQ_NORMS.total.cutoff, 180, '参考线 62'));

    const verdict = $('total-verdict');
    if (r.aboveCutoff) {
      verdict.className = 'verdict over';
      verdict.textContent = '达到或超过参考线 62。';
    } else {
      verdict.className = 'verdict under';
      verdict.textContent = '低于参考线 62。';
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
    renderDimTrend();

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
        `第 ${r.imputed.map((x) => x.id).join('、')} 题没有作答，分数是估算的，`
        + '总分会带一点不确定性。下次尽量答完整。';
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
      tail.textContent = '总分变化超过 17 分才算真的有变化；差得比这少，可能只是日常的起伏。';
      body.appendChild(tail);
    } else {
      const none = document.createElement('p');
      none.className = 'fieldnote';
      none.textContent = '这个浏览器里还没有以前的记录。如果你在别的设备上填过，可以在下面输入上次的总分。';
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

  /* 折线图最多画最近这么多次。再多横轴日期会糊成一团，
   * 而且最该看见的是最近的走向。图片导出也用同一个上限。 */
  const MAX_POINTS = 10;

  /* 总分趋势图（纯 SVG，无外部依赖） */
  function renderTrend() {
    const card = $('trend-card'), holder = $('trend-chart');
    holder.textContent = '';

    const all = loadRecords().sort((a, b) => a.ts.localeCompare(b.ts));
    const list = all.slice(-MAX_POINTS);
    if (list.length < 2) { card.hidden = true; return; }
    card.hidden = false;

    const padL = 32, padR = 16, padT = 12, padB = 30, h = 190;
    // 铺满容器宽度、不横向滚动：滚动会把最新一次挡在屏幕外，
    // 而那正是最该看到的。点多了改为抽稀标签，见下面的 dense。
    const gaps = list.length - 1;
    const w = Math.max(260, holder.clientWidth || 320);
    const step = (w - padL - padR) / gaps;
    const dense = step < 44;
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

      // 挤的时候只标最后一次；其余的值仍可长按/悬停从 <title> 读到
      if (!dense || i === gaps) {
        add('text', { x: Math.min(x(i), w - padR - 8), y: y(r.total) - 11,
                      'text-anchor': dense && i === gaps ? 'end' : 'middle',
                      'font-size': 11, 'font-weight': isNow ? 600 : 400,
                      fill: 'currentColor' }, r.total);
      }
      if (!dense || i % 2 === 0 || i === gaps) {
        add('text', { x: x(i), y: h - 10, 'text-anchor': 'middle',
                      'font-size': 10, fill: cMuted }, r.date.slice(5));
      }
    });

    holder.appendChild(svg);
    $('trend-note').textContent = all.length > MAX_POINTS
      ? `虚线是参考线 62，曲线下行代表好转，只显示最近 ${MAX_POINTS} 次（共 ${all.length} 次）。`
      : '虚线是参考线 62，曲线下行代表好转。看自己的曲线怎么走，比和别人比更有意义。';
  }

  /* 三个维度的趋势图。
   *
   * 三个维度满分不同（SD 100 / IR 44 / SR 36），画在同一根纵轴上，
   * IR 和 SR 会被压在下半部分看不出变化，所以纵轴换成「占各自满分的百分比」。
   * 巧的是三条美国常模划界分换算后几乎重合——37/100 = 37.0%、16/44 = 36.4%、
   * 13/36 = 36.1%——所以一条虚线就能同时代表三个维度的参考线。
   * 圆点上标的仍是原始分，避免读者把百分比当成分数。 */
  const DIM_LINES = [
    { key: 'SD', varName: '--dim-sd', fallback: '#426b78', dash: '' },
    { key: 'IR', varName: '--dim-ir', fallback: '#a8734a', dash: '7 4' },
    { key: 'SR', varName: '--dim-sr', fallback: '#6b6091', dash: '2 4' },
  ];
  const DIM_REF_PCT = 36.5;      // 三条划界分换算后的公共位置

  /* 老记录或导入的数据可能没有维度分，画之前先筛掉 */
  function hasDims(rec) {
    return rec && rec.dims && ['SD', 'IR', 'SR'].every(
      (k) => typeof rec.dims[k] === 'number' && isFinite(rec.dims[k]));
  }

  function renderDimTrend() {
    const card = $('dimtrend-card'), holder = $('dimtrend-chart'), legend = $('dimtrend-legend');
    holder.textContent = '';
    legend.textContent = '';

    const withDims = loadRecords().filter(hasDims).sort((a, b) => a.ts.localeCompare(b.ts));
    const list = withDims.slice(-MAX_POINTS);
    if (list.length < 2) { card.hidden = true; return; }
    card.hidden = false;

    const padL = 34, padR = 16, padT = 14, padB = 30, h = 200;
    const gaps = list.length - 1;
    const w = Math.max(260, holder.clientWidth || 320);
    const step = (w - padL - padR) / gaps;
    const dense = step < 44;
    const plotH = h - padT - padB;
    const x = (i) => padL + step * i;
    const y = (pct) => padT + plotH - (pct / 100) * plotH;

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '三个维度随时间变化的折线图');

    const css = getComputedStyle(document.body);
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

    [0, 50, 100].forEach((p) => {
      add('line', { x1: padL, y1: y(p), x2: w - padR, y2: y(p), stroke: cLine, 'stroke-width': 1 });
      add('text', { x: padL - 6, y: y(p) + 4, 'text-anchor': 'end',
                    'font-size': 10, fill: cMuted }, p + '%');
    });

    add('line', { x1: padL, y1: y(DIM_REF_PCT), x2: w - padR, y2: y(DIM_REF_PCT),
                  stroke: cMuted, 'stroke-width': 1, 'stroke-dasharray': '4 3' });

    DIM_LINES.forEach((d) => {
      const color = css.getPropertyValue(d.varName).trim() || d.fallback;
      const max = OQ_NORMS[d.key].max;
      const pctOf = (rec) => rec.dims[d.key] / max * 100;

      const attrs = {
        points: list.map((rec, i) => `${x(i)},${y(pctOf(rec))}`).join(' '),
        fill: 'none', stroke: color, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      };
      if (d.dash) attrs['stroke-dasharray'] = d.dash;
      add('polyline', attrs);

      list.forEach((rec, i) => {
        const isNow = rec.id === current.id;
        const dot = add('circle', {
          cx: x(i), cy: y(pctOf(rec)), r: isNow ? 4.5 : 3,
          fill: isNow ? color : cSurface, stroke: color, 'stroke-width': 2,
        });
        const title = document.createElementNS(NS, 'title');
        title.textContent = `${rec.date}　${OQ_NORMS[d.key].label} ${rec.dims[d.key]} / ${max}`;
        dot.appendChild(title);
      });

      // 不在线末标数值：三条线收尾时常常挨在一起，标签会叠成一团。
      // 本次的原始分由下方图例给出，点上的值可以长按/悬停看 <title>。
    });

    list.forEach((rec, i) => {
      if (!dense || i % 2 === 0 || i === gaps) {
        add('text', { x: x(i), y: h - 10, 'text-anchor': 'middle',
                      'font-size': 10, fill: cMuted }, rec.date.slice(5));
      }
    });

    holder.appendChild(svg);
    $('dimtrend-note').textContent = withDims.length > MAX_POINTS
      ? `只显示最近 ${MAX_POINTS} 次（共 ${withDims.length} 次有维度分的记录）。`
      : '';

    // 图例带上本次的原始分
    DIM_LINES.forEach((d) => {
      const color = css.getPropertyValue(d.varName).trim() || d.fallback;
      const n = OQ_NORMS[d.key];
      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = color;
      const txt = document.createElement('span');
      txt.innerHTML = `${n.label}　<b>${current.result.dims[d.key]}</b> / ${n.max}`;
      li.append(sw, txt);
      legend.appendChild(li);
    });
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
    L.push(`总分：${r.total} / 180　（参考线 62；${r.aboveCutoff ? '达到或超过' : '低于'}参考线）`);
    L.push('分数越高，表示心理困扰越重、社会功能受损越明显。');
    L.push(`严重度分层：${r.severity.label}`);
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
    // 留档用的一行：贴进个案记录后，日后能查出这份结果是哪版条目、哪版计分算出来的，
    // 以及它属于哪个匿名编号。写成一行，不占正文篇幅。
    L.push(`［${current.uid}　条目 ${current.itemsVersion}／计分 ${current.scoringVersion}　`
      + `完成于 ${localStamp(current.completedAt)}］`);
    return L.join('\n');
  }

  /* ISO 时间戳转本地时间，只到分钟：2026-09-03 15:34 */
  function localStamp(iso) {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
         + `${p(d.getHours())}:${p(d.getMinutes())}`;
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

  /* 一次填写在导出时会摊成四类值，含义写在 OQ_VALUE_KINDS 里：
   *   raw    作答者勾了什么（0–4；漏答和「不适用」都是空）
   *   na     是不是选了「不适用」（1 / 0）
   *   paper  纸质题本上的等价勾选值（正向题 0、反向题 4），便于和纸笔数据并表
   *   scored 计入总分的值（已反向计分、已填补漏答）
   * 四类分开列，避免"这一格的 0 到底是他答了不是、还是这题对他不适用、还是漏答被填补了"
   * 这种事后说不清的情况。 */
  function itemValues(i) {
    const v = current.raw[i];
    const na = v === 'na';
    return {
      raw: typeof v === 'number' ? v : null,
      na,
      paper: oqPaperValue(i, v),
      scored: current.result.scored[i],
    };
  }

  /* CSV 一次填写导出 45 行，一题一行（长表）。
   *
   * 每行左边写明这道题是什么——题干、维度、是不是反向题、「不适用」怎么换算、
   * 关键题阈值——右边是这次答了什么、算成了几分，末尾跟上这次施测的公共信息。
   * 这样一份文件自己就说得清自己，不必再配一张单独的对照表。
   *
   * 代价是做纵向分析前要转回宽表：pandas 里
   * `df.pivot(index='record_id', columns='variable', values='scored')`，
   * R 里 `pivot_wider()`。多份文件首尾相接就是一张长表，直接能拼。
   *
   * 列的排法照「先看谁、再看哪道题、再看答了什么」的顺序，
   * 在 Excel 里不用横向滚动就能读到关键的几列。
   */
  const CSV_COLS = [
    // 谁、哪一次
    'user_id', 'record_id', 'assessment_date', 'baseline',
    // 这道题是什么
    'variable', 'item_id', 'item_text', 'dimension', 'dimension_label', 'reverse',
    // 这次答了什么、算成几分
    'response_raw', 'response_label', 'not_applicable', 'missing',
    'paper_equivalent', 'scored', 'imputed', 'critical_flagged',
    // 这道题的计分规则（原先单独放在 codebook 里的部分）
    'response_min', 'response_max', 'response_labels', 'scoring_rule',
    'na_option', 'na_label', 'na_paper_value', 'na_scored_value',
    'critical', 'critical_threshold',
    // 这次施测的总体结果
    'total', 'sd', 'ir', 'sr', 'severity', 'above_cutoff', 'n_answered', 'n_missing',
    // 出处与版本
    'label', 'started_at', 'completed_at', 'duration_sec', 'tz_offset_min',
    'instrument', 'translation', 'items_version', 'scoring_version', 'export_schema',
  ];

  function exportCSV() {
    const r = current.result;
    const cb = oqCodebook().rows;                        // 每题的说明字段
    const imputed = new Set(r.imputed.map((x) => x.id));
    const flagged = new Set(r.critical.map((c) => c.id));

    // 施测级信息，45 行里逐行重复——长表就是这么用的，pivot 回去时它们是索引
    const shared = {
      user_id: current.uid,
      record_id: current.id,
      assessment_date: current.date,
      label: current.name,
      baseline: current.baseline ? 1 : 0,
      total: r.total, sd: r.dims.SD, ir: r.dims.IR, sr: r.dims.SR,
      severity: r.severity.label,
      above_cutoff: r.aboveCutoff ? 1 : 0,
      n_answered: r.answered,
      n_missing: OQ_ITEMS.length - r.answered,
      started_at: current.startedAt || '',
      completed_at: current.completedAt,
      duration_sec: current.durationSec === null ? '' : current.durationSec,
      tz_offset_min: current.tzOffsetMin,
      instrument: OQ_INSTRUMENT.name,
      translation: OQ_INSTRUMENT.translation,
      items_version: current.itemsVersion,
      scoring_version: current.scoringVersion,
      export_schema: OQ_EXPORT_SCHEMA,
    };

    const rows = OQ_ITEMS.map((item, i) => {
      const v = itemValues(i);
      return Object.assign({}, cb[i], shared, {
        // 作答者勾的那一档，同时给数值和中文标签，不用回头查对照表
        response_raw: v.raw === null ? '' : v.raw,
        response_label: v.na ? '不适用' : (v.raw === null ? '' : OQ_OPTIONS[v.raw]),
        not_applicable: v.na ? 1 : 0,
        missing: (v.raw === null && !v.na) ? 1 : 0,
        paper_equivalent: v.paper === null ? '' : v.paper,
        scored: v.scored === null ? '' : v.scored,
        imputed: imputed.has(item.id) ? 1 : 0,
        critical_flagged: flagged.has(item.id) ? 1 : 0,
      });
    });

    const table = [CSV_COLS].concat(rows.map((row) => CSV_COLS.map((c) => row[c])));
    download(fileStem() + '.csv', oqCsvText(table), 'text/csv');
  }

  function exportJSON() {
    const r = current.result;
    const imputed = new Set(r.imputed.map((x) => x.id));

    // 逐题结果按变量名装成对象，不再是数组：题目顺序日后若有调整，
    // 靠位置对齐的数据会整体错位，靠 q01–q45 对齐的不会。
    const responses = {};
    OQ_ITEMS.forEach((it, i) => {
      const v = itemValues(i);
      responses[oqVariable(it.id)] = {
        item_id: it.id,
        dimension: it.dim,
        reverse: !!it.reverse,
        raw: v.raw,
        not_applicable: v.na,
        missing: v.raw === null && !v.na,
        paper_equivalent: v.paper,
        scored: v.scored,
        imputed: imputed.has(it.id),
      };
    });

    const data = {
      schema: 'oq45-export',
      versions: oqVersions(),
      instrument: OQ_INSTRUMENT,
      record: {
        record_id: current.id,
        user_id: current.uid,
        user_id_note: '这台设备上的匿名标识，用于串联同一个人的多次填写；不含个人信息',
        user_id_persistent: current.uidPersistent !== false,
        label: current.name || null,
        baseline: current.baseline,
        assessment_date: current.date,
        started_at: current.startedAt,
        completed_at: current.completedAt,
        duration_sec: current.durationSec,
        tz_offset_min: current.tzOffsetMin,
      },
      value_kinds: OQ_VALUE_KINDS,
      responses,
      scores: {
        total: r.total,
        subscales: r.dims,
        severity: r.severity.label,
        above_cutoff: r.aboveCutoff,
        n_answered: r.answered,
        missing_items: OQ_ITEMS.filter((it, i) => current.raw[i] === null
          || current.raw[i] === undefined).map((it) => it.id),
        imputed_items: r.imputed.map((x) => x.id),
        na_items: OQ_ITEMS.filter((it, i) => current.raw[i] === 'na').map((it) => it.id),
        critical_items: r.critical.map((c) => ({ id: c.id, raw: c.value })),
      },
      norms: {
        total_cutoff: OQ_NORMS.total.cutoff,
        total_rci: OQ_NORMS.total.rci,
        total_source: '李钰静 (2010) 中国常模',
        subscale_cutoffs: { SD: OQ_NORMS.SD.cutoff, IR: OQ_NORMS.IR.cutoff, SR: OQ_NORMS.SR.cutoff },
        subscale_source: '美国常模（仅供参考）',
      },
      codebook: '各题的变量名、维度、计分方向、「不适用」换算与关键题阈值，'
        + '在 CSV 导出里逐行都带；本文件的 responses 每题也给了 dimension 与 reverse',
    };
    download(fileStem() + '.json', JSON.stringify(data, null, 2), 'application/json');
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
    SD: '#426b78', IR: '#a8734a', SR: '#6b6091',
  };
  const IMG_DASH = { SD: [], IR: [9, 5], SR: [2, 5] };

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

    // textAt 用绝对纵坐标，text 用当前的 y 游标
    const textAt = (str, x, yy, size, weight, color, align) => {
      setFont(ctx, weight, size);
      if (!dry) {
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(str, x, yy);
      }
    };
    const text = (str, x, size, weight, color, align) =>
      textAt(str, x, y, size, weight, color, align);
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

    /* 总分趋势折线。与网页版 SVG 同样的数据和刻度，画在 canvas 上。 */
    const chart = (list) => {
      const H = 172, axL = P + 48, axR = W - P - 6, plotW = axR - axL;
      const top = y, bot = y + H;
      const px = (i) => axL + plotW * (i / (list.length - 1));
      const py = (v) => bot - (v / 180) * H;

      [0, 60, 120, 180].forEach((v) => {
        rect(axL, py(v), plotW, 1, IMG_C.lineSoft);
        textAt(String(v), axL - 14, py(v) + 5, 14, '400', IMG_C.muted, 'right');
      });

      if (!dry) {
        // 划界分 62：虚线
        ctx.save();
        ctx.strokeStyle = IMG_C.muted;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(axL, py(62));
        ctx.lineTo(axR, py(62));
        ctx.stroke();
        ctx.restore();

        // 折线
        ctx.save();
        ctx.strokeStyle = IMG_C.accent;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        list.forEach((rec, i) => {
          if (i === 0) ctx.moveTo(px(i), py(rec.total));
          else ctx.lineTo(px(i), py(rec.total));
        });
        ctx.stroke();
        ctx.restore();
      }

      list.forEach((rec, i) => {
        const isNow = rec.id === current.id;
        if (!dry) {
          ctx.save();
          ctx.fillStyle = isNow ? IMG_C.accent : IMG_C.bg;
          ctx.strokeStyle = IMG_C.accent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px(i), py(rec.total), isNow ? 7 : 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        // 分数标在点上方，最高分附近改标下方，避免顶出画面；
        // 首尾两点的标签往里收，免得压到纵轴刻度或出界
        const above = py(rec.total) - 16 > top + 10;
        const lx = Math.min(Math.max(px(i), axL + 10), axR - 10);
        textAt(String(rec.total), lx, py(rec.total) + (above ? -16 : 26),
               15, isNow ? '600' : '400', IMG_C.ink, 'center');
        textAt(rec.date.slice(5), px(i), bot + 26, 14, '400', IMG_C.muted, 'center');
      });

      y = bot + 58;
    };

    /* 三个维度的趋势。纵轴是「占各自满分的百分比」——三个维度满分不同，
     * 不换算就没法画在一张图上。见 renderDimTrend() 里的说明。 */
    const dimChart = (list) => {
      const H = 172, axL = P + 48, axR = W - P - 6, plotW = axR - axL;
      const top = y, bot = y + H;
      const px = (i) => axL + plotW * (i / (list.length - 1));
      const py = (pct) => bot - (pct / 100) * H;

      [0, 50, 100].forEach((p) => {
        rect(axL, py(p), plotW, 1, IMG_C.lineSoft);
        textAt(p + '%', axL - 14, py(p) + 5, 14, '400', IMG_C.muted, 'right');
      });

      if (!dry) {
        ctx.save();
        ctx.strokeStyle = IMG_C.muted;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(axL, py(DIM_REF_PCT));
        ctx.lineTo(axR, py(DIM_REF_PCT));
        ctx.stroke();
        ctx.restore();
      }

      ['SD', 'IR', 'SR'].forEach((k) => {
        const max = OQ_NORMS[k].max;
        const pctOf = (rec) => rec.dims[k] / max * 100;

        if (!dry) {
          ctx.save();
          ctx.strokeStyle = IMG_C[k];
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.lineCap = IMG_DASH[k].length ? 'butt' : 'round';
          ctx.setLineDash(IMG_DASH[k]);
          ctx.beginPath();
          list.forEach((rec, i) => {
            if (i === 0) ctx.moveTo(px(i), py(pctOf(rec)));
            else ctx.lineTo(px(i), py(pctOf(rec)));
          });
          ctx.stroke();
          ctx.restore();

          list.forEach((rec, i) => {
            ctx.save();
            ctx.fillStyle = i === list.length - 1 ? IMG_C[k] : IMG_C.bg;
            ctx.strokeStyle = IMG_C[k];
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(px(i), py(pctOf(rec)), i === list.length - 1 ? 6 : 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          });
        }

        // 同网页版：不在线末标数值，三条线收尾时会叠在一起，改由下方图例给出
      });

      list.forEach((rec, i) => {
        textAt(rec.date.slice(5), px(i), bot + 26, 14, '400', IMG_C.muted, 'center');
      });

      y = bot + 56;

      // 图例：色块 + 名称 + 本次原始分
      let lx = P;
      ['SD', 'IR', 'SR'].forEach((k) => {
        const n = OQ_NORMS[k];
        const label = `${n.label} ${r.dims[k]}/${n.max}`;
        rect(lx, y - 9, 22, 4, IMG_C[k], 2);
        textAt(label, lx + 30, y, 15, '400', IMG_C.soft);
        setFont(ctx, '400', 15);
        lx += 30 + ctx.measureText(label).width + 24;
      });
      y += 26;
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
    // 顺序与网页一致：先说明读分方向，再给判定
    text('分数越高，表示心理困扰越重、社会功能受损越明显', P, 15, '400', IMG_C.soft);
    y += 26;
    text(r.aboveCutoff ? '达到或超过参考线 62' : '低于参考线 62',
         P, 21, '600', r.aboveCutoff ? IMG_C.warm : IMG_C.accent);
    y += 24;
    text(`严重度分层：${r.severity.label}`, P, 17, '400', IMG_C.muted);
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
    y += 22;   // 让开最后一根刻度条的「参考线」标签
    [['症状困扰（SD）', '你最近的主观痛苦与情绪体验'],
     ['人际关系（IR）', '你与生命中重要他人相处的质量与满意度'],
     ['社会角色（SR）', '你在学习、工作与休闲生活中的适应和胜任感']].forEach(([k, v]) => {
      text(k, P, 15, '600', IMG_C.soft);
      setFont(ctx, '600', 15);
      text(v, P + ctx.measureText(k).width + 6, 15, '400', IMG_C.muted);
      y += 22;
    });
    y += 4;
    text('三项与总分方向一致，用来看困扰更集中在哪一块，请以总分为主', P, 15, '400', IMG_C.muted);
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
      text('总分变化超过 17 分才算真的有变化，差得比这少可能只是日常起伏', P, 15, '400', IMG_C.muted);
      y += 30;
    }

    // ── 总分变化折线
    const all = loadRecords().sort((a, b) => a.ts.localeCompare(b.ts));
    const MAX_POINTS = 10;                 // 再多横轴日期就挤成一团了
    const history = all.slice(-MAX_POINTS);
    if (history.length >= 2) {
      rule();
      y += 34;
      text('总分变化', P, 20, '600', IMG_C.ink);
      y += 26;
      chart(history);
      text(all.length > MAX_POINTS
        ? `虚线是参考线 62，曲线下行代表好转　·　只显示最近 ${MAX_POINTS} 次（共 ${all.length} 次）`
        : '虚线是参考线 62，曲线下行代表好转', P, 15, '400', IMG_C.muted);
      y += 30;
    }

    // ── 三个维度的变化折线
    const dimHistory = all.filter(hasDims).slice(-MAX_POINTS);
    if (dimHistory.length >= 2) {
      rule();
      y += 34;
      text('三个方面的变化', P, 20, '600', IMG_C.ink);
      y += 26;
      dimChart(dimHistory);
      setFont(ctx, '400', 15);
      wrapText(ctx, '三项的满分不同，换算成百分比才能画在同一张图上；'
        + '图例里是本次的实际分数，虚线是参考线，曲线下行代表好转。', CW).forEach((ln) => {
        text(ln, P, 15, '400', IMG_C.muted);
        y += 22;
      });
      y += 12;
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
               + '请把这份结果带到会谈中和咨询师一起看。';
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

  let imgCanvas = null;         // 留着按需生成 blob，供分享/下载用

  function isTouch() {
    return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  }

  function showImage() {
    try {
      imgCanvas = buildImage();
      // <img> 用 data URL：iOS 上长按 blob URL 的图片存相册经常失败，data URL 稳定
      $('img-out').src = imgCanvas.toDataURL('image/png');
    } catch (e) {
      window.alert('图片生成失败，请改用「复制为文字」。');
      return;
    }
    $('img-tip').textContent = isTouch()
      ? '长按图片可保存到相册，也可以点下面的「保存 / 分享图片」'
      : '右键图片可另存为，也可以点下面的「保存 / 分享图片」';
    $('img-overlay').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hideImage() {
    $('img-overlay').hidden = true;
    $('img-out').removeAttribute('src');
    imgCanvas = null;
    document.body.style.overflow = '';
  }

  function canvasBlob(cv) {
    return new Promise((resolve, reject) => {
      if (cv.toBlob) cv.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob 返回空')), 'image/png');
      else reject(new Error('不支持 toBlob'));
    });
  }

  /* 保存图片。
   * 移动端不能用 <a download href="data:...">：iOS Safari 对 data URL 忽略
   * download 属性，App 内置浏览器更是直接屏蔽下载，点了完全没反应。
   * 系统分享面板才是手机上真正可用的路径（iOS 里就有「存储到照片」）。 */
  async function saveImage() {
    if (!imgCanvas) return;
    let blob;
    try {
      blob = await canvasBlob(imgCanvas);
    } catch (e) {
      window.alert('图片导出失败，请改用长按图片保存。');
      return;
    }

    const name = fileStem() + '.png';
    if (typeof File === 'function' && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;   // 用户自己取消了分享
        /* 其余情况落到下面的下载分支 */
      }
    }

    // 回退：blob URL 下载。桌面浏览器和安卓 Chrome 都能正常触发。
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      window.alert('这个浏览器不支持直接下载，请长按上面的图片保存。');
    }
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

    renderUid();
    $('uid-copy').addEventListener('click', copyUid);
    $('uid-edit').addEventListener('click', editUid);

    $('btn-start').addEventListener('click', () => {
      if (startedAt === null) startedAt = Date.now();   // 中途返回说明页不重新计时
      showScreen('screen-form');
    });
    $('btn-back-intro').addEventListener('click', () => showScreen('screen-intro'));
    $('btn-submit').addEventListener('click', onSubmit);

    $('btn-copy').addEventListener('click', copyText);
    $('btn-csv').addEventListener('click', exportCSV);
    $('btn-json').addEventListener('click', exportJSON);
    $('btn-print').addEventListener('click', () => window.print());
    $('btn-image').addEventListener('click', showImage);

    $('img-close').addEventListener('click', hideImage);
    $('img-overlay').addEventListener('click', (e) => {
      if (e.target === $('img-overlay')) hideImage();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('img-overlay').hidden) hideImage();
    });
    $('img-save').addEventListener('click', saveImage);

    $('btn-again').addEventListener('click', () => {
      resetForm();
      refreshCount();
      startedAt = null;
      showScreen('screen-intro');
    });

    const doClear = () => {
      if (!window.confirm('将删除这台设备上保存的全部 OQ-45.2 记录，且无法恢复。确定吗？')) return;
      clearRecords();
      refreshCount();
      $('compare-card').hidden = true;
      $('trend-card').hidden = true;
      $('dimtrend-card').hidden = true;
      window.alert('本机记录已清除。');
    };
    $('intro-clear').addEventListener('click', doClear);
    $('btn-clear').addEventListener('click', doClear);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
