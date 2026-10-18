#!/usr/bin/env node
/* Прогон браузерных тестов в node (автоматическая проверка задач 2.x/3.x).
 * Использование: node tools/run_tests.js <тестовый-файл.js> [...]
 * Загружает web/tests/harness.js, web/js/engine.js, web/js/ai.js, затем файлы тестов.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PRELUDE = [
  'web/tests/harness.js',
  'web/js/engine.js',
  'web/js/ai.js',
  'web/js/input.js'
];

function load(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    return; // например, ai.js ещё не создан на ранних этапах
  }
  const code = fs.readFileSync(file, 'utf8');
  // классические скрипты рассчитывают на window/globalThis — в node это globalThis
  new Function('window', code)(globalThis);
}

PRELUDE.forEach(load);

const testFiles = process.argv.slice(2);
if (testFiles.length === 0) {
  console.error('Укажите файлы тестов, например: node tools/run_tests.js web/tests/engine-tests.js');
  process.exit(2);
}
testFiles.forEach(load);

const results = globalThis.T.run();
let failed = 0;
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' — ' + r.error));
  if (!r.ok) failed++;
}
console.log(`Тестов: ${results.length}, падений: ${failed}` +
  (failed === 0 ? ' — ВСЁ ЗЕЛЁНОЕ' : ' — ЕСТЬ ОШИБКИ'));
process.exit(failed === 0 ? 0 : 1);
