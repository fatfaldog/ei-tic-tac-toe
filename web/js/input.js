/* Крестики-нолики по ПЗшному — слой ввода (capability: game-input).
 *
 * Устройства сводятся к единым действиям (design.md D1):
 *   UP / DOWN / LEFT / RIGHT / CONFIRM / BACK / MENU
 * Клавиатура: keydown (по event.code — независимо от раскладки ОС),
 * цифры 1-9 (Digit1..9 и Numpad1..9) — прямой выбор клетки через digitPick.
 * Геймпад: опрос Gamepad API с edge-детекцией (design.md D4).
 * Модуль не знает DOM игры: только события и колбэки.
 */
(function (global) {
  'use strict';

  var NS = global.Krestiki = global.Krestiki || {};

  /* --------------------------------------------------------- клавиатура */

  var KEY_ACTIONS = {
    ArrowUp: 'UP', KeyW: 'UP',
    ArrowDown: 'DOWN', KeyS: 'DOWN',
    ArrowLeft: 'LEFT', KeyA: 'LEFT',
    ArrowRight: 'RIGHT', KeyD: 'RIGHT',
    Enter: 'CONFIRM', NumpadEnter: 'CONFIRM', Space: 'CONFIRM',
    Escape: 'BACK',
    F10: 'MENU', KeyM: 'MENU'
  };

  /** Клавиатурное событие -> действие или null. Модификаторы игнорируем,
   *  чтобы не перехватывать системные сочетания. */
  function keyAction(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return null;
    }
    return KEY_ACTIONS[event.code] || null;
  }

  /* --------------------------------------------------- раскладки 1-9 */

  /** Цифра (символ '1'..'9') -> индекс клетки 0..8 по раскладке или null. */
  var DIGIT_MAPS = {
    // читающая: 1 2 3 / 4 5 6 / 7 8 9
    reading: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8 },
    // нумпадовая: 7 8 9 / 4 5 6 / 1 2 3
    numpad: { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 }
  };

  function digitCell(digit, layout) {
    var map = DIGIT_MAPS[layout] || DIGIT_MAPS.reading;
    return map[digit] !== undefined ? map[digit] : null;
  }

  /* ------------------------------------------------------------ геймпад */

  var DEADZONE = 0.5;
  var PAD_BUTTONS = { 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };
  var PAD_ACTIONS = { 0: 'CONFIRM', 1: 'BACK', 9: 'MENU' };

  /** Состояние геймпада -> массив действий на переходах «отпущено->нажато».
   *  prev/cur: { buttons: bool[17], axes: [x, y] }. Чистая функция. */
  function gamepadEdges(prev, cur) {
    var out = [];
    var i;
    // D-pad и кнопки: только переход 0 -> 1 (удержание не повторяется)
    for (i in PAD_BUTTONS) {
      if (cur.buttons[i] && prev && !prev.buttons[i]) {
        out.push(PAD_BUTTONS[i]);
      }
    }
    for (i in PAD_ACTIONS) {
      if (cur.buttons[i] && prev && !prev.buttons[i]) {
        out.push(PAD_ACTIONS[i]);
      }
    }
    // стик: пересечение мёртвой зоны по направлению
    var AXES = [
      { axis: 0, sign: 1, action: 'RIGHT' },
      { axis: 0, sign: -1, action: 'LEFT' },
      { axis: 1, sign: 1, action: 'DOWN' },
      { axis: 1, sign: -1, action: 'UP' }
    ];
    for (var a = 0; a < AXES.length; a++) {
      var ax = AXES[a];
      var curV = cur.axes ? cur.axes[ax.axis] * ax.sign : 0;
      var prevV = (prev && prev.axes) ? prev.axes[ax.axis] * ax.sign : 0;
      if (curV >= DEADZONE && prevV < DEADZONE) {
        out.push(ax.action);
      }
    }
    // стик и D-pad одновременно не дублируют действие (уникальность с сохранением порядка)
    var seen = {};
    var unique = [];
    for (var u = 0; u < out.length; u++) {
      if (!seen[out[u]]) {
        seen[out[u]] = true;
        unique.push(out[u]);
      }
    }
    return unique;
  }

  /** Снять состояние первого подключённого геймпада для edge-детекции. */
  function readGamepad(pad) {
    var buttons = [];
    for (var i = 0; i < 17; i++) {
      buttons.push(!!(pad.buttons[i] && pad.buttons[i].pressed));
    }
    return { buttons: buttons, axes: [pad.axes[0] || 0, pad.axes[1] || 0] };
  }

  /* ------------------------------------------------------------ подключение */

  /**
   * dispatch(action) — обработчик действий;
   * digitKey(digitChar) — обработчик цифр 1-9 (раскладку знает UI).
   */
  function attach(dispatch, digitKey) {
    document.addEventListener('keydown', function (e) {
      var action = keyAction(e);
      if (action) {
        // Если фокус стоит на нативном контроле (кнопка меню/плиты/клетки,
        // пункт меню), Enter/Space обрабатывает сам контрол (native click) —
        // не дублируем действием игры (правка приёмки: Tab-навигация).
        var ae = document.activeElement;
        if (action === 'CONFIRM' && ae &&
            (ae.tagName === 'BUTTON' ||
             (ae.classList && ae.classList.contains('menu-item')))) {
          return; // native click сделает то же самое
        }
        e.preventDefault();
        dispatch(action);
        return;
      }
      var m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
      if (m) {
        e.preventDefault();
        digitKey(m[1]);
      }
    });

    // Геймпад: цикл опроса только при подключённом падде (D4)
    var nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav || typeof nav.getGamepads !== 'function') {
      return; // Gamepad API недоступен — игра живёт только с клавиатуры/мыши
    }
    var prev = null;
    var raf = null;

    function poll() {
      var pads = nav.getGamepads();
      for (var i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) {
          var cur = readGamepad(pads[i]);
          var actions = gamepadEdges(prev, cur);
          prev = cur;
          for (var a = 0; a < actions.length; a++) {
            dispatch(actions[a]);
          }
          break;
        }
      }
      raf = global.requestAnimationFrame(poll);
    }

    function start() {
      if (raf === null && typeof global.requestAnimationFrame === 'function') {
        raf = global.requestAnimationFrame(poll);
      }
    }
    function stop() {
      if (raf !== null && typeof global.cancelAnimationFrame === 'function') {
        global.cancelAnimationFrame(raf);
      }
      raf = null;
      prev = null;
    }

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('gamepadconnected', start);
      global.addEventListener('gamepaddisconnected', stop);
    }
  }

  NS.Input = {
    keyAction: keyAction,
    digitCell: digitCell,
    gamepadEdges: gamepadEdges,
    readGamepad: readGamepad,
    attach: attach
  };
})(typeof window !== 'undefined' ? window : globalThis);
