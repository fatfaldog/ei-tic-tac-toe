/* Мини-каркас тестов: работает и в браузере (страницы web/tests/*.html),
 * и в node (tools/run_tests.js). Синхронный, без зависимостей.
 */
(function (global) {
  'use strict';

  var T = global.T = { tests: [], failures: 0, count: 0 };

  T.test = function (name, fn) {
    T.tests.push({ name: name, fn: fn });
  };

  T.assert = function (cond, msg) {
    T.count++;
    if (!cond) {
      T.failures++;
      throw new Error('assert не выполнен: ' + (msg || ''));
    }
  };

  T.eq = function (actual, expected, msg) {
    T.count++;
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) {
      T.failures++;
      throw new Error((msg || 'значения не совпали') + ': получено ' + a + ', ожидалось ' + e);
    }
  };

  T.run = function () {
    var results = [];
    for (var i = 0; i < T.tests.length; i++) {
      var t = T.tests[i];
      try {
        t.fn();
        results.push({ name: t.name, ok: true, error: null });
      } catch (e) {
        results.push({ name: t.name, ok: false, error: e.message });
      }
    }
    if (typeof document !== 'undefined') {
      var ul = document.getElementById('results');
      if (ul) {
        ul.innerHTML = '';
        results.forEach(function (r) {
          var li = document.createElement('li');
          li.className = r.ok ? 'pass' : 'fail';
          li.textContent = (r.ok ? 'PASS ' : 'FAIL ') + r.name +
            (r.ok ? '' : ' — ' + r.error);
          ul.appendChild(li);
        });
        var sum = document.getElementById('summary');
        if (sum) {
          var bad = results.filter(function (r) { return !r.ok; }).length;
          sum.textContent = 'Тестов: ' + results.length + ', падений: ' + bad +
            (bad === 0 ? ' — ВСЁ ЗЕЛЁНОЕ' : ' — ЕСТЬ ОШИБКИ');
          sum.className = bad === 0 ? 'pass' : 'fail';
        }
      }
    }
    T.results = results;
    return results;
  };
})(typeof window !== 'undefined' ? window : globalThis);
