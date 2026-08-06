/* OQ-45.2 计分与判定
 *
 * 常模出处见 README。要点：
 *   - 总分划界分 62、可信变化指数 RCI 17 —— 李钰静 (2010) 中国常模
 *   - 分量表划界分与总分严重度分层 —— 美国常模，仅供参考
 *   - 中国的分量表划界分与 RCI 未见公开发表
 */

const OQ_NORMS = {
  total: { max: 180, cutoff: 62, rci: 17, source: 'cn' },
  SD:    { max: 100, cutoff: 37, rci: 10, source: 'us', label: '症状困扰', count: 25 },
  IR:    { max: 44,  cutoff: 16, rci: 8,  source: 'us', label: '人际关系', count: 11 },
  SR:    { max: 36,  cutoff: 13, rci: 7,  source: 'us', label: '社会角色', count: 9 },
};

/* 美国常模的总分严重度分层。注意这套分层以 64 为起点，
 * 与上面 62 的划界分出处不同，结果页会分别标注，不混用。 */
const OQ_SEVERITY = [
  { max: 63,       label: '低',   desc: '低于美国常模的临床范围' },
  { max: 82,       label: '中度', desc: '' },
  { max: 105,      label: '中高', desc: '' },
  { max: Infinity, label: '高',   desc: '' },
];

/* 反向计分：0↔4, 1↔3, 2 不变。只在这里发生一次。 */
function oqReverse(v) { return 4 - v; }

/**
 * 「不适用」在纸质题本上应勾的选项值。
 * 纸质题本逐题印「如不适用请填 X」，X 随计分方向不同：
 *   正向题 → "不是"（0）；反向题 → "总是这样"（4，反转后为 0）。
 * 两种写法算出来都是 0 分困扰，页面上统一成一个「不适用」按钮，
 * 导出时再换算回纸质题本的等价值，方便与纸笔施测的数据对齐。
 * @param {number} i 题目索引（0-based）
 * @param {number|'na'|null} v 页面上记录的值
 */
function oqPaperValue(i, v) {
  if (v === 'na') return OQ_ITEMS[i].reverse ? 4 : 0;
  return v;
}

/**
 * 计分主函数。
 * @param {Array<number|null|'na'>} raw 长度 45，索引 0 对应第 1 题。
 *        数字 0–4 为作答者勾选的原始值；null 表示漏答；
 *        'na' 表示选了「不适用」（目前仅第 37 题可用）。
 * @returns {object} 计分结果，valid=false 时 reason 说明原因。
 */
function oqScore(raw) {
  const missing = [];      // 漏答题号（1-based）
  const scored = new Array(45).fill(null);

  OQ_ITEMS.forEach((item, i) => {
    const v = raw[i];
    if (v === 'na') {
      // 「不适用」一律按 0 分困扰记，正向题反向题都一样。
      // 反向题（第 37 题）若让来访者勾「不是」，反转后会变成 4 分，凭空多出困扰。
      scored[i] = 0;
      return;
    }
    if (v === null || v === undefined) { missing.push(item.id); return; }
    scored[i] = item.reverse ? oqReverse(v) : v;
  });

  if (missing.length >= 5) {
    return {
      valid: false,
      reason: 'too_many_missing',
      missing,
      message: `漏答 ${missing.length} 题。OQ-45.2 规定漏答 5 题及以上整份作废（需完成至少 41 题），请补答后再提交。`,
    };
  }

  // 漏答 1–4 题：用该题所属分量表其余题目的均值（四舍五入取整）填补。
  const imputed = [];
  if (missing.length > 0) {
    const sums = { SD: 0, IR: 0, SR: 0 }, counts = { SD: 0, IR: 0, SR: 0 };
    OQ_ITEMS.forEach((item, i) => {
      if (scored[i] === null) return;
      sums[item.dim] += scored[i];
      counts[item.dim] += 1;
    });
    OQ_ITEMS.forEach((item, i) => {
      if (scored[i] !== null) return;
      const mean = counts[item.dim] > 0 ? sums[item.dim] / counts[item.dim] : 0;
      scored[i] = Math.round(mean);
      imputed.push({ id: item.id, dim: item.dim, value: scored[i] });
    });
  }

  const dims = { SD: 0, IR: 0, SR: 0 };
  OQ_ITEMS.forEach((item, i) => { dims[item.dim] += scored[i]; });
  const total = dims.SD + dims.IR + dims.SR;

  // 关键题：第 8 题只要不为 0 就跟进，其余四题「有时」（=2）及以上跟进。
  // 判断用作答者勾选的原始值，「不适用」不触发。
  const critical = [];
  OQ_ITEMS.forEach((item, i) => {
    if (!item.critical) return;
    const v = raw[i];
    if (typeof v !== 'number') return;
    const threshold = item.id === 8 ? 1 : 2;
    if (v >= threshold) {
      critical.push({ id: item.id, text: item.text, value: v, label: OQ_OPTIONS[v] });
    }
  });

  return {
    valid: true,
    scored, dims, total, imputed, critical,
    answered: 45 - missing.length,
    aboveCutoff: total >= OQ_NORMS.total.cutoff,
    severity: OQ_SEVERITY.find(s => total <= s.max),
    suicidalItem: typeof raw[7] === 'number' && raw[7] > 0
      ? { value: raw[7], label: OQ_OPTIONS[raw[7]] } : null,
  };
}

/**
 * Jacobson-Truax 四分类（用中国常模：划界分 62、RCI 17）。
 * @param {number} t1 基线总分
 * @param {number} t2 当前总分
 */
function oqCompare(t1, t2) {
  const { cutoff, rci } = OQ_NORMS.total;
  const delta = t1 - t2;               // 正值表示分数下降 = 好转
  let key, label, meaning;

  if (delta >= rci && t2 < cutoff) {
    key = 'recovered'; label = '恢复';
    meaning = '下降幅度足够大，而且总分已经低于参考线。';
  } else if (delta >= rci) {
    key = 'improved'; label = '改善';
    meaning = '下降幅度足够大，但总分仍在参考线以上。';
  } else if (delta <= -rci) {
    key = 'deteriorated'; label = '恶化';
    meaning = '总分明显上升了，建议尽快和咨询师聊聊。';
  } else {
    key = 'unchanged'; label = '无变化';
    meaning = '变化不到 17 分，可能只是日常的起伏。';
  }
  return { key, label, meaning, delta, t1, t2 };
}
