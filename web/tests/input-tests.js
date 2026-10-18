/* Тесты слоя ввода — capability game-input (задача 1.1, 4.1). */
(function (T, K) {
  'use strict';

  function key(code, mods) {
    return Object.assign({ code: code, ctrlKey: false, metaKey: false, altKey: false }, mods || {});
  }

  /* ---------------- keyAction ---------------- */

  T.test('keyAction: стрелки и WASD -> направления', function () {
    T.eq(K.Input.keyAction(key('ArrowUp')), 'UP');
    T.eq(K.Input.keyAction(key('KeyW')), 'UP');
    T.eq(K.Input.keyAction(key('ArrowDown')), 'DOWN');
    T.eq(K.Input.keyAction(key('KeyS')), 'DOWN');
    T.eq(K.Input.keyAction(key('ArrowLeft')), 'LEFT');
    T.eq(K.Input.keyAction(key('KeyA')), 'LEFT');
    T.eq(K.Input.keyAction(key('ArrowRight')), 'RIGHT');
    T.eq(K.Input.keyAction(key('KeyD')), 'RIGHT');
  });

  T.test('keyAction: подтверждение, назад, меню', function () {
    T.eq(K.Input.keyAction(key('Enter')), 'CONFIRM');
    T.eq(K.Input.keyAction(key('NumpadEnter')), 'CONFIRM');
    T.eq(K.Input.keyAction(key('Space')), 'CONFIRM');
    T.eq(K.Input.keyAction(key('Escape')), 'BACK');
    T.eq(K.Input.keyAction(key('F10')), 'MENU');
    T.eq(K.Input.keyAction(key('KeyM')), 'MENU');
  });

  T.test('keyAction: модификаторы и прочие клавиши игнорируются', function () {
    T.eq(K.Input.keyAction(key('KeyM', { ctrlKey: true })), null);
    T.eq(K.Input.keyAction(key('KeyA', { metaKey: true })), null);
    T.eq(K.Input.keyAction(key('KeyD', { altKey: true })), null);
    T.eq(K.Input.keyAction(key('KeyZ')), null);
    T.eq(K.Input.keyAction(key('Backspace')), null);
  });

  /* ---------------- digitCell: раскладки ---------------- */

  T.test('digitCell: читающая раскладка (1 = верхняя левая)', function () {
    T.eq(K.Input.digitCell('1', 'reading'), 0);
    T.eq(K.Input.digitCell('2', 'reading'), 1);
    T.eq(K.Input.digitCell('5', 'reading'), 4);
    T.eq(K.Input.digitCell('9', 'reading'), 8);
  });

  T.test('digitCell: нумпадовая раскладка (7 8 9 / 4 5 6 / 1 2 3)', function () {
    T.eq(K.Input.digitCell('7', 'numpad'), 0);
    T.eq(K.Input.digitCell('8', 'numpad'), 1);
    T.eq(K.Input.digitCell('9', 'numpad'), 2);
    T.eq(K.Input.digitCell('4', 'numpad'), 3);
    T.eq(K.Input.digitCell('1', 'numpad'), 6);
    T.eq(K.Input.digitCell('3', 'numpad'), 8);
  });

  T.test('digitCell: неизвестная цифра/раскладка', function () {
    T.eq(K.Input.digitCell('0', 'reading'), null);
    T.eq(K.Input.digitCell('x', 'reading'), null);
    T.eq(K.Input.digitCell('1', 'мусор'), 0, 'неизвестная раскладка -> читающая');
  });

  /* ---------------- gamepadEdges ---------------- */

  function pad(buttons, axes) {
    var b = [];
    for (var i = 0; i < 17; i++) {
      b.push(buttons.indexOf(i) !== -1);
    }
    return { buttons: b, axes: axes || [0, 0] };
  }

  T.test('gamepadEdges: нажатие A один раз -> один CONFIRM', function () {
    var idle = pad([], [0, 0]);
    var aDown = pad([0], [0, 0]);
    T.eq(K.Input.gamepadEdges(idle, aDown), ['CONFIRM']);
    T.eq(K.Input.gamepadEdges(aDown, aDown), [], 'удержание не повторяется');
    T.eq(K.Input.gamepadEdges(aDown, idle), [], 'отпускание молчит');
  });

  T.test('gamepadEdges: D-pad кнопки', function () {
    var idle = pad([], [0, 0]);
    T.eq(K.Input.gamepadEdges(idle, pad([12])), ['UP']);
    T.eq(K.Input.gamepadEdges(idle, pad([13])), ['DOWN']);
    T.eq(K.Input.gamepadEdges(idle, pad([14])), ['LEFT']);
    T.eq(K.Input.gamepadEdges(idle, pad([15])), ['RIGHT']);
    T.eq(K.Input.gamepadEdges(idle, pad([1])), ['BACK']);
    T.eq(K.Input.gamepadEdges(idle, pad([9])), ['MENU']);
  });

  T.test('gamepadEdges: стик с мёртвой зоной', function () {
    var idle = pad([], [0, 0]);
    var slight = pad([], [0.3, 0]);       // в мёртвой зоне
    T.eq(K.Input.gamepadEdges(idle, slight), []);
    T.eq(K.Input.gamepadEdges(slight, pad([], [0.7, 0])), ['RIGHT']);
    T.eq(K.Input.gamepadEdges(pad([], [0.7, 0]), pad([], [-0.9, 0])), ['LEFT'],
      'переброс стика через центр');
    T.eq(K.Input.gamepadEdges(idle, pad([], [0, -0.8])), ['UP']);
  });

  T.test('gamepadEdges: одновременные нажатия без дублей', function () {
    var idle = pad([], [0, 0]);
    T.eq(K.Input.gamepadEdges(idle, pad([0, 15], [0.9, 0])), ['RIGHT', 'CONFIRM'],
      'A + D-pad вправо + стик вправо: RIGHT один раз, порядок не важен');
  });
})(typeof window !== 'undefined' ? window.T : globalThis.T,
    typeof window !== 'undefined' ? window.Krestiki : globalThis.Krestiki);
