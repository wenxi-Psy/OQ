/* 导出用的公共工具
 *
 * oqVariable() 是「变量名」的唯一出处：localStorage 里的逐题作答按 q01–q45 存，
 * 不按数组下标——题目顺序万一调整，靠位置对齐的数据会整体错位，靠名字对齐的不会。
 */

/* 导出文件的格式版本。改动导出的结构时 +1，日后回看能对上是哪一版的产物。 */
const OQ_EXPORT_SCHEMA = '4.0.0';

/* 变量名：第 1 题 → q01，第 45 题 → q45 */
function oqVariable(id) { return 'q' + String(id).padStart(2, '0'); }

/* 当前这版量表 + 计分 + 导出格式的版本号 */
function oqVersions() {
  return {
    items_version: OQ_ITEMS_VERSION,
    scoring_version: OQ_SCORING_VERSION,
    export_schema: OQ_EXPORT_SCHEMA,
  };
}

/* CSV 转义：一律加引号，内部的引号翻倍。Excel 与 WPS 都吃这一套。 */
function oqCsvCell(v) {
  return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
}

/* 拼一份 CSV 文本。带 UTF-8 BOM，否则 Excel 打开中文是乱码；行尾用 CRLF。 */
function oqCsvText(rows) {
  return '﻿' + rows.map((r) => r.map(oqCsvCell).join(',')).join('\r\n') + '\r\n';
}
