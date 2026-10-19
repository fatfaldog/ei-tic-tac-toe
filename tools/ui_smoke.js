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
      toggle(c, force) {
        const on = force === undefined ? !el.classList._s.has(c) : !!force;
        if (on) { el.classList._s.add(c); } else { el.classList._s.delete(c); }
        return on;
      },
      contains(c) { return el.classList._s.has(c); }
    },
    setAttribute(k, v) { el._attrs[k] = String(v); },
    getAttribute(k) { return k in el._attrs ? el._attrs[k] : null; },
    removeAttribute(k) { delete el._attrs[k]; },
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
    change() { fire(el, 'change', { target: el }); },
    focus() { fire(el, 'focus', { target: el }); }
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
load('web/js/input.js');
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
assert(board.children[4].style.left === '159px' && board.children[4].style.top === '150px',
  'поле: клетка 4 (центр) на (159,150)');
// регулярная сетка от центра: одинаковый размер и шаг 120x123
assert(board.children.every(c => c.style.width === '106px' && c.style.height === '109px'),
  'поле: все клетки одинаковые 106x109');
assert(board.children.every((c, i) => parseInt(c.style.left) === 39 + 120 * (i % 3)),
  'поле: колонки на 39/159/279 (шаг 120)');
assert(board.children.every((c, i) => parseInt(c.style.top) === 27 + 123 * Math.floor(i / 3)),
  'поле: строки на 27/150/273 (шаг 123)');
// внутренние линии (полосы 148-156, 268-276 X; 139-147, 263-271 Y, экранное
// масштабирование 417/418) лежат в середине промежутков: зазоры ~3px с обеих сторон
const disp = v => v * 417 / 418;
const gaps = [
  disp(148) - (39 + 106), 159 - disp(156),        // вокруг линии X=152
  disp(268) - (159 + 106), 279 - disp(276),       // вокруг линии X=272
  disp(139) - (27 + 109), 150 - disp(147),        // вокруг линии Y=143
  disp(263) - (150 + 109), 273 - disp(271)        // вокруг линии Y=266
];
assert(gaps.every(g => g > 2 && g < 4),
  'поле: зазоры до всех внутренних линий ~3px: ' + gaps.map(g => g.toFixed(1)).join(' '));

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
// окно результата в стиле диалогов + плита «Новая игра» (new-game-plate)
const gameMarkup = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
assert(gameMarkup.includes('class="modal result"') &&
  gameMarkup.includes('class="result-title"') &&
  gameMarkup.includes('class="result-frame"'),
  'окно результата: плита-заголовок, рамка, структура как у диалогов');
assert(gameMarkup.includes('id="result-new-game" class="plate-btn"') &&
  gameMarkup.includes('aria-label="Новая игра"'),
  'оверлей: «Новая игра» — плита (plate-btn) с aria-label');
assert(fs.existsSync(path.join(ROOT, 'web/assets/img/plate-result.png')),
  'ассет plate-result.png сгенерирован');
const gameCss = fs.readFileSync(path.join(ROOT, 'web/css/style.css'), 'utf8');
assert(/#result-new-game\s*\{[^}]*plate-confirm\.png/s.test(gameCss),
  'плита-галочка: result-new-game использует plate-confirm.png (правка приёмки)');
// тексты исходов — дословно оригинальные (change restore-original-result-texts)
assert(K.UI.RESULT_TEXTS.playerWon === 'Вы выиграли. ПоЗдравляю!!!!!',
  'текст победы игрока дословный (ПоЗдравляю с ПЗ)');
assert(K.UI.RESULT_TEXTS.computerWon === 'Комп вас уделал \u{1F61C}',
  'текст поражения: :tease: заменён на эмодзи');
assert(K.UI.RESULT_TEXTS.draw === 'Ничья!!!!',
  'текст ничьей дословный');
assert(text === K.UI.RESULT_TEXTS.computerWon || text === K.UI.RESULT_TEXTS.playerWon ||
  text === K.UI.RESULT_TEXTS.draw,
  'оверлей показывает один из оригинальных текстов: ' + JSON.stringify(text));

// «Новая игра» из оверлея: поле очищается, оверлей скрывается
fire($('result-new-game'), 'click', { target: $('result-new-game') });
const cleared = board.children.every(c => !c.classList.contains('cross') && !c.classList.contains('nought'));
assert(cleared && overlay.hidden, '«Новая игра» очищает поле и скрывает оверлей');

// настройки (мышь): список, циклы, черновик, OK/X, живое превью существа
$('mi-settings').click();
assert(!$('settings-modal').hidden, 'окно «Настройки» открывается');
assert($('settings-frame').classList.contains('easy'), 'фон рамки: кролик при «Легком»');
assert($('set-val-level').innerHTML === 'Легкий' &&
  $('set-val-first').innerHTML === 'Я' &&
  $('set-val-show-digits').innerHTML === 'Да' &&
  $('set-val-layout').innerHTML === 'Нативный', 'строки показывают текущие значения');
// группы «Геймплей» и «Управление с клавиатуры»: заголовки в разметке и неинтерактивны
// (стаб DOM их не касается — проверяем исходный HTML, как для «Об авторе»)
const settingsMarkup = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
assert(settingsMarkup.includes('id="set-group-game"') &&
  settingsMarkup.includes('Геймплей') &&
  settingsMarkup.includes('id="set-group-kbd"') &&
  settingsMarkup.includes('Управление с клавиатуры'),
  'разметка: заголовки групп «Геймплей» и «Управление с клавиатуры»');
assert($('set-group-game').getAttribute('tabindex') === null &&
  $('set-group-kbd').getAttribute('tabindex') === null,
  'заголовки групп не табулируемы (стрелки/Tab их пропускают)');
// номера клеток включены по умолчанию: нативный порядок 1..9 (cell-number-hints)
assert(board.classList.contains('digits-on'), 'номера клеток включены по умолчанию');
assert(board.children[0].getAttribute('data-digit') === '1' &&
  board.children[8].getAttribute('data-digit') === '9',
  'нативный порядок: клетка 0 -> «1», клетка 8 -> «9»');

// клик по строке уровня: цикл + живое превью тролля
$('set-row-level').click();
assert($('set-val-level').innerHTML === 'Тяжелый', 'клик по строке циклит значение');
assert($('settings-frame').classList.contains('hard'), 'превью: тролль при «Тяжелом»');

// крестик: закрыть без применения — уровень не изменился
$('set-cancel').click();
assert($('settings-modal').hidden, 'крестик закрывает окно');
$('mi-settings').click();
assert($('set-val-level').innerHTML === 'Легкий', 'отмена отбросила черновик');
assert($('settings-frame').classList.contains('easy'), 'фон вернулся к кролику');

// применить по галочке: Тяжелый + Комп первым + Нумпад
$('set-row-level').click();            // -> Тяжелый (тролль)
$('set-row-first').click();            // -> Комп
$('set-row-layout').click();           // -> Нумпад
$('set-ok').click();
assert($('settings-modal').hidden, 'галочка закрывает окно');
// нумпад применился и к номерам клеток немедленно (cell-number-hints)
assert(board.children[0].getAttribute('data-digit') === '7' &&
  board.children[8].getAttribute('data-digit') === '3',
  'нумпад: номера обновились немедленно (клетка 0 -> «7», клетка 8 -> «3»)');
// геймплейные настройки перезапускают партию немедленно (settings-apply-restarts-game):
// поле уже чистое, «Комп» первым сходил крестиком — без ручной «Новой игры»
const noughtsAfter = board.children.filter(c => c.classList.contains('nought')).length;
assert(noughtsAfter === 0, '«Комп» первым: игрок-нолик ещё не ходил (ноликов нет)');
const crossesAfter = board.children.filter(c => c.classList.contains('cross')).length;
assert(crossesAfter === 1, 'галочка с геймплейной сменой: компьютер поставил один крестик');
// призрак игрока при его знаке-нолике (first-mover-plays-crosses):
// наведём фокус на пустую клетку — вид ghost-nought
fire(board, 'mouseover', { target: board.children[8] });
assert(board.children[8].classList.contains('ghost-nought'),
  'призрак игрока-нолика: класс ghost-nought на пустой клетке');

// вернуть умолчания для последующих тестов: Легкий, Я, Читающая
$('mi-settings').click();
$('set-row-level').click();            // -> Легкий
$('set-row-first').click();            // -> Я
$('set-row-layout').click();           // -> Читающая
$('set-ok').click();

// только раскладка: партия НЕ перезапускается — пара ходов остаётся на поле
$('mi-new-game').click();              // чистая партия (Я первым, Легкий)
fire(board, 'click', { target: board.children[4] });  // ход игрока + ответ компьютера
const marksBeforeLayout = board.children.filter(c => c.classList.contains('cross') || c.classList.contains('nought')).length;
assert(marksBeforeLayout === 2, 'подготовка: на поле два знака');
$('mi-settings').click();
$('set-row-layout').click();           // -> Нумпад (не геймплейная)
$('set-ok').click();
const marksAfterLayout = board.children.filter(c => c.classList.contains('cross') || c.classList.contains('nought')).length;
assert(marksAfterLayout === 2, 'только раскладка: поле не перезапущено, знаки на месте');
// раскладка при этом применилась: цифра 7 (нумпад) = верхняя левая
fire(board, 'mouseover', { target: board.children[8] });
(documentStub._listeners.keydown || []).forEach(fn => fn({
  code: 'Digit7', ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}
}));
assert(board.children[0].classList.contains('ghost') ||
  board.children[0].classList.contains('ghost-nought'),
  'раскладка применилась без перезапуска: 7 -> верхняя левая (клетка 0)');
// вернуть Читающую для клавиатурных тестов ниже (снова без перезапуска)
$('mi-settings').click();
$('set-row-layout').click();           // -> Читающая
$('set-ok').click();
assert(board.children.filter(c => c.classList.contains('cross') || c.classList.contains('nought')).length === 2,
  'возврат раскладки тоже не перезапустил партию');

// «Отображать номера клеток»: Нет скрывает цифры немедленно, Да — возвращает;
// партия при этом не перезапускается (cell-number-hints)
$('mi-settings').click();
$('set-row-show-digits').click();        // Да -> Нет
assert($('set-val-show-digits').innerHTML === 'Нет', 'цикл показа номеров: Да -> Нет');
$('set-ok').click();
assert(!board.classList.contains('digits-on'), '«Нет»: цифры скрыты немедленно');
assert(board.children.filter(c => c.classList.contains('cross') || c.classList.contains('nought')).length === 2,
  'смена показа номеров не перезапустила партию');
$('mi-settings').click();
$('set-row-show-digits').click();        // Нет -> Да
$('set-ok').click();
assert(board.classList.contains('digits-on') &&
  board.children[0].getAttribute('data-digit') === '1',
  '«Да»: номера вернулись (нативный порядок)');
$('mi-about').click();
assert(!$('about-modal').hidden, 'окно «Об авторе» открывается');
// текст «Об авторе» — современная редакция в разметке (redesign-about-window):
// проверяем ключевые имена и адрес прямо в HTML (стаб DOM не парсит разметку)
const aboutMarkup = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
for (const s of ['fatfaldog', 'PPyatachok', 'ksaont', 'MorgenS',
                 'Вселенная Аллодов', 'allods.gipat.ru']) {
  assert(aboutMarkup.includes(s), 'разметка «Об авторе» содержит: ' + s);
}
// одна плита-галочка закрывает
$('about-ok').click();
assert($('about-modal').hidden, 'плита-галочка закрывает окно');

// --- game-input: клавиатура, фокус, навигация, третья группа настроек ---

function key(code) {
  (documentStub._listeners.keydown || []).forEach(fn => fn({
    code, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}
  }));
}
function viewOf(i) {
  const c = board.children[i];
  return ['focused', 'ghost', 'invalid', 'dim'].filter(k => c.classList.contains(k)).join('+') || '-';
}

// подготовка не нужна: умолчания (Легкий, Я, Читающая) восстановлены выше

// меню с клавиатуры: F10 открывает, первый пункт подсвечен
key('F10');
assert($('menu-game').classList.contains('open'), 'клавиатура: F10 открывает меню');
assert($('mi-new-game').classList.contains('kbd-active'), 'клавиатура: пункт меню подсвечен');
// «Новая игра» через Enter
key('Enter');
assert(!$('menu-game').classList.contains('open'), 'клавиатура: Enter закрывает меню');
assert(board.children.every(c => !c.classList.contains('cross') && !c.classList.contains('nought')),
  'клавиатура: «Новая игра» из меню очищает поле');

// фокус: первый ввод — центр, вид ghost (пустая, очередь игрока)
key('ArrowUp');
assert(viewOf(4) === 'focused+ghost', 'фокус: стрелка из ничего -> центр, призрак (ghost)');
key('ArrowLeft');
assert(viewOf(3) === 'focused+ghost', 'фокус: стрелка влево -> клетка 3');
key('Digit7');
assert(viewOf(6) === 'focused+ghost', 'фокус: цифра 7 (читающая) -> клетка 6');

// hover двигает тот же фокус
fire(board, 'mouseover', { target: board.children[2] });
assert(viewOf(2) === 'focused+ghost', 'фокус: hover мышью двигает фокус');
assert(!board.children[3].classList.contains('focused'), 'фокус: старая клетка освобождена');

// подтверждение в фокусе: ход игрока + ответ компьютера
const before = board.children.filter(c => c.classList.contains('cross')).length;
key('Enter');
assert(board.children[2].classList.contains('cross'), 'клавиатура: Enter ставит крестик в фокус');
assert(board.children.filter(c => c.classList.contains('cross')).length === before + 1,
  'клавиатура: ход принят ровно один');
assert(viewOf(2) === 'focused+invalid', 'фокус: занятая клетка -> invalid (красная)');

// Enter на занятой клетке ничего не делает
const frozen = board.children.map(c => c.className).join('|');
key('Enter');
assert(board.children.map(c => c.className).join('|') === frozen,
  'клавиатура: Enter на занятой клетке игнорируется');

// настройки с клавиатуры: F10, вниз, Enter -> окно; навигация строками и плитами
key('F10');
key('ArrowDown');      // mi-settings
key('Enter');
assert(!$('settings-modal').hidden, 'клавиатура: меню -> «Настройки» открываются');
assert($('game-window').getAttribute('inert') !== null,
  'модальность: настройки открыты — главное окно inert (Tab/мышь заперты)');
assert($('set-row-level').classList.contains('kbd-active'), 'клавиатура: первая строка подсвечена');
assert(viewOf(2) === 'focused+dim', 'фокус: при открытом окне подсветка клетки тускнеет');
// цикл уровня с клавиатуры + живое превью тролля
key('Enter');
assert($('set-val-level').innerHTML === 'Тяжелый' && $('settings-frame').classList.contains('hard'),
  'клавиатура: Enter циклит уровень, превью — тролль');
// вниз до группы «Управление с клавиатуры»: показ номеров, затем порядок
key('ArrowDown'); key('ArrowDown');   // -> set-row-show-digits
assert($('set-row-show-digits').classList.contains('kbd-active'), 'клавиатура: навигация по строкам группы');
key('Space');                          // CONFIRM циклит Да -> Нет
assert($('set-val-show-digits').innerHTML === 'Нет', 'клавиатура: Space циклит показ номеров');
key('ArrowDown');                      // -> set-row-layout
assert($('set-row-layout').classList.contains('kbd-active'), 'клавиатура: дошла до «Порядка нумерации»');
key('Space');                          // -> Нумпад
assert($('set-val-layout').innerHTML === 'Нумпад', 'клавиатура: Space циклит порядок нумерации');
// Esc — отмена: черновик отброшен
key('Escape');
assert($('settings-modal').hidden, 'клавиатура: Esc закрывает настройки');
assert($('game-window').getAttribute('inert') === null,
  'модальность: Esc закрыл настройки — inert снят');
$('mi-settings').click();
assert($('set-val-layout').innerHTML === 'Нативный' && $('set-val-level').innerHTML === 'Легкий' &&
  $('set-val-show-digits').innerHTML === 'Да',
  'клавиатура: Esc отбросил изменения');
// применить «Нумпад» через плиту OK с клавиатуры
key('ArrowDown'); key('ArrowDown'); key('ArrowDown'); key('Space');  // порядок -> Нумпад
key('ArrowDown');                                            // -> плита OK (позиция 4)
assert($('set-ok').classList.contains('kbd-active'), 'клавиатура: фокус дошёл до плиты OK');
key('Enter');
assert($('settings-modal').hidden, 'клавиатура: Enter на плите OK применяет и закрывает');
assert(board.children[0].getAttribute('data-digit') === '7',
  'клавиатура: OK применил «Нумпад» — номера обновились немедленно');
assert($('game-window').getAttribute('inert') === null,
  'модальность: OK закрыл настройки — inert снят');

// нумпадовая раскладка действует после OK: 7 -> верхняя левая
key('Digit7');
assert(viewOf(0) === 'focused+ghost', 'раскладка: после OK «Нумпад» цифра 7 -> клетка 0');
key('Enter');

// результат партии: доигрываем кликами, Enter = «Новая игра»
steps = 0;
while ($('result-overlay').hidden && steps < 9) {
  let idx = -1;
  for (let i = 0; i < 9; i++) { if (!markAt(i)) { idx = i; break; } }
  if (idx === -1) { break; }
  clickBoard(idx);
  steps++;
}
assert(!$('result-overlay').hidden, 'результат: партия доиграна, оверлей показан');
key('Enter');
assert($('result-overlay').hidden &&
  board.children.every(c => !c.classList.contains('cross') && !c.classList.contains('nought')),
  'клавиатура: Enter на оверлее = «Новая игра»');

// «Об авторе» с клавиатуры и закрытие Esc
key('F10');
key('ArrowDown'); key('ArrowDown'); key('ArrowDown'); // mi-about
key('Enter');
assert(!$('about-modal').hidden, 'клавиатура: «Об авторе» открывается из меню');
assert($('game-window').getAttribute('inert') !== null,
  'модальность: «Об авторе» открыто — главное окно inert');
key('Escape');
assert($('about-modal').hidden, 'клавиатура: Esc закрывает «Об авторе»');
assert($('game-window').getAttribute('inert') === null,
  'модальность: «Об авторе» закрыто — inert снят');

// «Выход»: прощальный экран + попытка закрыть вкладку
$('mi-exit').click();
assert(!$('farewell').hidden, '«Выход»: показан прощальный экран');
assert(windowClosed, '«Выход»: window.close() вызван');

console.log(failures === 0 ? 'СМОУК: ВСЁ ЗЕЛЁНОЕ' : 'СМОУК: ЕСТЬ ОШИБКИ (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
