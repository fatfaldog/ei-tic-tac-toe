#!/usr/bin/env node
/* Смоук-тест UI-слоя (web/js/ui.js) на минимальном DOM-стабе, без браузера.
 * Проверяет: создание поля, обработку ходов, оверлей результата, меню,
 * настройки (взаимоисключающие пары), «Об авторе», «Выход».
 * Запуск: node tools/ui_smoke.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------- DOM-стаб */

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    style: {},
    hidden: false,
    checked: false,
    id: '',
    _text: '',
    _listeners: {},
    _attrs: {},
    classList: {
      _s: new Set(),
      add(...cs) { cs.forEach(c => el.classList._s.add(c)); },
      remove(...cs) { cs.forEach(c => el.classList._s.delete(c)); },
      contains(c) { return el.classList._s.has(c); }
    },
    setAttribute(k, v) { el._attrs[k] = String(v); },
    getAttribute(k) { return k in el._attrs ? el._attrs[k] : null; },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener(type, fn) { (el._listeners[type] = el._listeners[type] || []).push(fn); },
    set innerHTML(v) { el._html = String(v); el.children = []; },
    get innerHTML() { return el._html || ''; },
    set textContent(v) { el._text = String(v); },
    get textContent() { return el._text; },
    get className() { return Array.from(el.classList._s).join(' '); },
    set className(v) {
      el.classList._s = new Set(String(v).split(/\s+/).filter(Boolean));
    },
    closest(sel) {
      // для смоука достаточно: '.cell' → сам элемент, '.dd-item' → null
      if (sel === '.cell' && el.classList.contains('cell')) { return el; }
      return null;
    },
    click() { fire(el, 'click', { target: el }); },
    change() { fire(el, 'change', { target: el }); }
  };
  return el;
}

function fire(el, type, ev) {
  ev = ev || { target: el };
  ev.stopPropagation = ev.stopPropagation || (() => {});
  (el._listeners[type] || []).forEach(fn => fn(ev));
}

const registry = new Map();
const documentStub = {
  createElement: makeEl,
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
  _listeners: {},
  getElementById(id) {
    if (!registry.has(id)) { registry.set(id, makeEl('div')); registry.get(id).id = id; }
    return registry.get(id);
  }
};

let windowClosed = false;
const windowStub = {
  close() { windowClosed = true; }
};

global.window = windowStub;
global.document = documentStub;

/* детерминированный random (LCG), чтобы исходы были воспроизводимы */
let seed = 42;
Math.random = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

/* -------------------------------------------------- загрузка скриптов */

function load(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  new Function('window', code)(windowStub);
}
load('web/js/engine.js');
load('web/js/ai.js');
load('web/js/ui.js');

const K = windowStub.Krestiki;
const $ = id => documentStub.getElementById(id);

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.log('FAIL ' + msg); }
  else { console.log('PASS ' + msg); }
}

/* --------------------------------------------------------- сценарии */

K.UI.init();

const board = $('board');
assert(board.children.length === 9, 'поле: создано 9 клеток');
assert(board.children[4].style.left === '168px' && board.children[4].style.top === '152px',
  'поле: координаты клетки 4 (центр) из layout.json');

// ход игрока в центр: клетка получает класс cross, компьютер — nought
const clickBoard = cellIdx => fire(board, 'click', { target: board.children[cellIdx] });
clickBoard(4);
const crosses = board.children.filter(c => c.classList.contains('cross'));
const noughts = board.children.filter(c => c.classList.contains('nought'));
assert(crosses.length === 1 && noughts.length === 1,
  'ход игрока → cross, ответ компьютера → nought');

// клик в занятую клетку ничего не меняет
const marksBefore = board.children.map(c => c.className).join('|');
clickBoard(4);
assert(board.children.map(c => c.className).join('|') === marksBefore,
  'клик в занятую клетку игнорируется');

// доигрываем партию (легкий ИИ, seeded random — исход детерминирован)
function markAt(i) {
  const c = board.children[i];
  if (c.classList.contains('cross')) { return 'X'; }
  if (c.classList.contains('nought')) { return 'O'; }
  return null;
}
let steps = 0;
while ($('result-overlay').hidden && steps < 9) {
  let idx = -1;
  for (let i = 0; i < 9; i++) { if (!markAt(i)) { idx = i; break; } }
  if (idx === -1) { break; }
  clickBoard(idx); // каждый ход игрока синхронно вызывает ответ компьютера
  steps++;
}

// после цикла проверяем оверлей результата
const overlay = $('result-overlay');
const overlayShown = !overlay.hidden;
const text = $('result-text').innerHTML;
assert(overlayShown, 'по завершении партии показан оверлей результата');
assert(['Вы победили!', 'Компьютер победил', 'Ничья'].indexOf(text) !== -1,
  'текст результата корректен: ' + JSON.stringify(text));

// «Новая игра» из оверлея: поле очищается, оверлей скрывается
fire($('result-new-game'), 'click', { target: $('result-new-game') });
const cleared = board.children.every(c => !c.classList.contains('cross') && !c.classList.contains('nought'));
assert(cleared && overlay.hidden, '«Новая игра» очищает поле и скрывает оверлей');

// настройки: открытие отражает текущие значения
$('mi-settings').click();
assert(!$('settings-modal').hidden, 'окно «Настройки» открывается');
assert($('cb-easy').checked && !$('cb-hard').checked, 'умолчание: «Легкий»');
assert($('cb-player-first').checked && !$('cb-computer-first').checked, 'умолчание: «Я»');

// переключение «Тяжелый» снимает «Легкий» и меняет настройку уровня
$('cb-hard').checked = true;
$('cb-hard').change();
assert(!$('cb-easy').checked, 'пара «Легкий/Тяжелый» взаимоисключающая');

// переключение «Комп» — первым ходит компьютер в новой партии
$('cb-computer-first').checked = true;
$('cb-computer-first').change();
assert(!$('cb-player-first').checked, 'пара «Я/Комп» взаимоисключающая');
fire($('mi-new-game'), 'click', { target: $('mi-new-game') });
const noughtsAfter = board.children.filter(c => c.classList.contains('nought')).length;
assert(noughtsAfter === 1, '«Комп» первым: после «Новой игры» на поле один нолик');

// закрытие настроек
$('settings-close').click();
assert($('settings-modal').hidden, 'окно «Настройки» закрывается');

// «Об авторе»: полный текст Memo
$('mi-about').click();
const layout = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/assets/layout.json'), 'utf8'));
const aboutNode = layout.forms.TABOUTAVTOR.children.find(c => c.cls === 'TMemo');
const memoLines = aboutNode.props['Lines.Strings'];
assert(!$('about-modal').hidden, 'окно «Об авторе» открывается');
assert($('about-text')._text === memoLines.join('\n'),
  'текст «Об авторе» совпадает с layout.json посимвольно');
$('about-close').click();
assert($('about-modal').hidden, 'окно «Об авторе» закрывается');

// «Выход»: прощальный экран + попытка закрыть вкладку
$('mi-exit').click();
assert(!$('farewell').hidden, '«Выход»: показан прощальный экран');
assert(windowClosed, '«Выход»: window.close() вызван');

console.log(failures === 0 ? 'СМОУК: ВСЁ ЗЕЛЁНОЕ' : 'СМОУК: ЕСТЬ ОШИБКИ (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
