#!/usr/bin/env node
/* 生成仓库根目录的 codebook.csv
 *
 *   node tools/build-codebook.js          写入 codebook.csv
 *   node tools/build-codebook.js --check  只检查是否与源文件一致（CI / 提交前自查用）
 *
 * 页面本身仍然是零构建的静态站点：这个脚本只是把 assets/ 里已有的条目数据
 * 导出成一份可以直接给研究者的表，不参与页面运行。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const OUT = path.join(root, 'codebook.csv');

/* assets/*.js 是给浏览器用的普通脚本，没有 import/export。
 * 放进同一个 vm 上下文里按顺序跑一遍，就能拿到里面的常量和函数。 */
const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
['items.js', 'score.js', 'codebook.js'].forEach((f) => {
  const file = path.join(root, 'assets', f);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
});

/* const 声明只存在于上下文的词法作用域里，不会挂到 sandbox 上，
 * 所以取常量要在上下文里求值，不能直接读 sandbox 的属性。 */
const evalIn = (expr) => vm.runInContext(expr, sandbox);
const csv = evalIn('oqCodebookCSV()');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== csv) {
    console.error('codebook.csv 与 assets/ 里的条目数据不一致，请运行：node tools/build-codebook.js');
    process.exit(1);
  }
  console.log('codebook.csv 是最新的。');
} else {
  fs.writeFileSync(OUT, csv);
  console.log(`已写入 ${path.relative(root, OUT)}（${evalIn('OQ_ITEMS.length')} 题，`
    + `条目版本 ${evalIn('OQ_ITEMS_VERSION')}）`);
}
