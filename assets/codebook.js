/* 条目对照表（codebook）与导出用的公共工具
 *
 * 这里是「变量名」的唯一出处：页面导出、仓库里的 codebook.csv、日后可能的后端
 * 都从 oqVariable() 取名，任何一处改了名字，其余地方跟着变。
 *
 * 变量名用零填充的 q01–q45，而不是数组下标：
 * 题目顺序万一调整，靠位置对齐的数据会整体错位，靠名字对齐的不会。
 */

/* 导出文件的格式版本。改动导出的列名 / 字段结构时 +1，
 * 读数据的脚本可以据此判断该按哪一版解析。 */
const OQ_EXPORT_SCHEMA = '2.0.0';

/* 变量名：第 1 题 → q01，第 45 题 → q45 */
function oqVariable(id) { return 'q' + String(id).padStart(2, '0'); }

/* 反过来：q01 → 1。认不出的名字返回 null。 */
function oqItemIdOf(variable) {
  const m = /^q(\d{2})$/.exec(String(variable));
  if (!m) return null;
  const id = parseInt(m[1], 10);
  return id >= 1 && id <= OQ_ITEMS.length ? id : null;
}

/* 一份记录里三类值的定义，导出的说明文字和 README 都引这三句。 */
const OQ_VALUE_KINDS = {
  raw: '作答者在页面上勾选的原始值 0–4，未做反向计分；漏答与「不适用」都留空',
  na: '是否选了「不适用」：1 = 是（该题情况不存在），0 = 否',
  paper: '纸质题本上的等价勾选值：「不适用」在正向题记 0、反向题记 4，仍未反向计分',
  scored: '计入总分的值：已做反向计分，「不适用」记 0，漏答已按同维度均值填补',
};

/* 当前这版量表 + 计分 + 导出格式的版本号，导出文件里原样带上。 */
function oqVersions() {
  return {
    items_version: OQ_ITEMS_VERSION,
    scoring_version: OQ_SCORING_VERSION,
    export_schema: OQ_EXPORT_SCHEMA,
  };
}

/**
 * 条目对照表：一题一行，说明变量名、维度、计分方向、「不适用」与关键题规则。
 * @returns {{columns: string[], rows: Array<Object>}}
 */
function oqCodebook() {
  const columns = [
    'variable',            // 导出文件里的列名 / JSON 键名
    'item_id',             // 题号 1–45
    'item_text',           // 题干（秦佑凤、胡姝婧 2008 译本）
    'dimension',           // SD / IR / SR
    'dimension_label',     // 维度中文名
    'reverse',             // 是否反向题：1 / 0
    'response_min',        // 作答值下界
    'response_max',        // 作答值上界
    'response_labels',     // 0=不是|1=很少|…
    'scoring_rule',        // 由 raw 得到 scored 的算式
    'na_option',           // 页面是否给这题「不适用」按钮：1 / 0
    'na_label',            // 按钮上的文字
    'na_paper_value',      // 「不适用」对应纸质题本应勾的值
    'na_scored_value',     // 「不适用」计入总分的值（一律 0 分困扰）
    'critical',            // 是否关键题：1 / 0
    'critical_threshold',  // raw ≥ 此值即在结果页列出，需在会谈中跟进
  ];

  const labels = OQ_OPTIONS.map((t, v) => v + '=' + t).join('|');

  const rows = OQ_ITEMS.map((item, i) => ({
    variable: oqVariable(item.id),
    item_id: item.id,
    item_text: item.text,
    dimension: item.dim,
    dimension_label: OQ_NORMS[item.dim].label,
    reverse: item.reverse ? 1 : 0,
    response_min: 0,
    response_max: OQ_OPTIONS.length - 1,
    response_labels: labels,
    scoring_rule: item.reverse ? 'scored = 4 - raw' : 'scored = raw',
    na_option: item.na ? 1 : 0,
    na_label: item.na ? item.naLabel : '',
    na_paper_value: item.na ? oqPaperValue(i, 'na') : '',
    na_scored_value: item.na ? 0 : '',
    critical: item.critical ? 1 : 0,
    critical_threshold: item.critical ? oqCriticalThreshold(item) : '',
  }));

  return { columns, rows };
}

/* CSV 转义：一律加引号，内部的引号翻倍。Excel 与 SPSS 都吃这一套。 */
function oqCsvCell(v) {
  return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
}

/* 拼一份 CSV 文本。带 UTF-8 BOM，否则 Excel 打开中文是乱码；行尾用 CRLF。 */
function oqCsvText(rows) {
  return '﻿' + rows.map((r) => r.map(oqCsvCell).join(',')).join('\r\n') + '\r\n';
}

/* codebook.csv 的完整文本。页面上的下载按钮和 tools/build-codebook.js 用的是同一个函数，
 * 所以仓库里那份文件和页面导出的那份不会对不上。 */
function oqCodebookCSV() {
  const { columns, rows } = oqCodebook();
  return oqCsvText([columns].concat(rows.map((r) => columns.map((c) => r[c]))));
}

/* 供 tools/build-codebook.js 在 Node 里调用；浏览器里没有 module，跳过。 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OQ_EXPORT_SCHEMA, OQ_VALUE_KINDS,
    oqVariable, oqItemIdOf, oqVersions, oqCodebook, oqCodebookCSV, oqCsvCell, oqCsvText,
  };
}
