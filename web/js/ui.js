/* Крестики-нолики по ПЗшному — UI-слой (capabilities: game-ui + game-input).
 * DOM: окно, поле, меню, модальные окна «Настройки» и «Об авторе»,
 * оверлей результата. Оркестрация партии — Krestiki.Game (engine.js).
 * Ввод: мышь (как раньше) + клавиатура/геймпад через Krestiki.Input —
 * единая модель фокуса и контекстная диспетчеризация (design.md D2).
 */
(function (global) {
  'use strict';

  var NS = global.Krestiki = global.Krestiki || {};

  /* Сетка поля — клетки под промежутки арта с ОДИНАКОВЫМ зазором ~3px до
   * каждой линии (линии стоят неровно, поэтому клетки разной величины).
   * МЕТКИ при этом строго одинаковые: текстуры рисуются с фиксированным
   * background-size, а обрезаются только их чёрные поля (крестик виден
   * в диапазоне ~[13..81]x[13..79] текстуры 96x94). Правая колонка
   * заезжает на внешнюю рамку — допустимо (приёмка). Координаты — в
   * экранных пикселях с учётом микромасштаба фона 417/418. */
  var CELLS = [
    { x: 47,  y: 48,  w: 98,  h: 88  }, { x: 159, y: 48,  w: 105, h: 88  }, { x: 278, y: 48,  w: 96, h: 88  },
    { x: 47,  y: 150, w: 98,  h: 109 }, { x: 159, y: 150, w: 105, h: 109 }, { x: 278, y: 150, w: 96, h: 109 },
    { x: 47,  y: 273, w: 98,  h: 102 }, { x: 159, y: 273, w: 105, h: 102 }, { x: 278, y: 273, w: 96, h: 102 }
  ];

  /* Текст Memo «Об авторе» — сгенерировано из layout.json (TABOUTAVTOR). */
  var ABOUT_TEXT = [
    '          Автором данной программы является fatfaldog',
    '          в некоторых кругах более извесный под ником yurasim',
    '          участник Проекта: Перепись ПЗшников',
    '          ищите этот Проект по адресу http://ei-census.eclub.lv/',
    '',
    '                            Отдельное спасибо:',
    '          альфа и бета тестеру под ником PPyatachok',
    "          а так же ksaont'y за разрешение использования его",
    '          наработок для Переписи ПЗшников в программе'
  ].join('\n');

  var RESULT_TEXTS = {
    playerWon: 'Вы победили!',
    computerWon: 'Компьютер победил',
    draw: 'Ничья'
  };

  var UI = NS.UI = {};
  var game = null;
  var cellEls = [];

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ фокус */

  var focusCell = null;        // 0..8 | null — единый фокус клетки (мышь+клавиатура)
  var uiContext = 'board';     // board | menu | settings | about | result | farewell

  /** Чистая функция вида фокуса (design.md D3):
   *  ghost — пустая клетка в очередь игрока (призрак крестика);
   *  glow  — пустая в очередь компьютера; invalid — занятая;
   *  dim   — партия не идёт или ввод в другом контексте. */
  function focusView(cellIdx, board, side, status, context) {
    if (context !== 'board' || status !== 'playing') {
      return 'dim';
    }
    if (board[cellIdx]) {
      return 'invalid';
    }
    return side === 'player' ? 'ghost' : 'glow';
  }

  function currentFocusView() {
    if (focusCell === null || !game) {
      return null;
    }
    return focusView(focusCell, game.engine.board, game.engine.current,
      game.engine.status, uiContext);
  }

  function renderFocus() {
    var view = currentFocusView();
    for (var i = 0; i < 9; i++) {
      cellEls[i].classList.remove('focused', 'ghost', 'invalid', 'dim');
      if (view && i === focusCell) {
        cellEls[i].classList.add('focused', view);
      }
    }
  }

  function setFocus(idx) {
    focusCell = idx;
    renderFocus();
  }

  function moveFocus(action) {
    if (focusCell === null) {
      setFocus(4); // первый клавиатурный/геймпадный ввод — центр поля
      return;
    }
    var col = focusCell % 3, row = Math.floor(focusCell / 3);
    if (action === 'LEFT' && col > 0) { col--; }
    if (action === 'RIGHT' && col < 2) { col++; }
    if (action === 'UP' && row > 0) { row--; }
    if (action === 'DOWN' && row < 2) { row++; }
    setFocus(row * 3 + col);
  }

  /** Подтверждение хода в фокусе; без фокуса — сначала ставим фокус в центр. */
  function confirmCell() {
    if (focusCell === null) {
      setFocus(4);
      return;
    }
    game.playerTurn(focusCell); // движок сам игнорирует не-очередь/занятость
  }

  /* ------------------------------------------------------------ поле */

  function buildBoard() {
    var board = $('board');
    board.innerHTML = '';
    cellEls = [];
    for (var i = 0; i < CELLS.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'cell';
      btn.style.left = CELLS[i].x + 'px';
      btn.style.top = CELLS[i].y + 'px';
      btn.style.width = CELLS[i].w + 'px';
      btn.style.height = CELLS[i].h + 'px';
      btn.setAttribute('data-index', i);
      btn.setAttribute('aria-label', 'Клетка ' + (i + 1));
      board.appendChild(btn);
      cellEls.push(btn);
    }
    board.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('.cell') : null;
      if (!t) {
        return;
      }
      // клик = выбор клетки + подтверждение; движок игнорирует не-очередь
      game.playerTurn(parseInt(t.getAttribute('data-index'), 10));
    });
    // наведение мыши двигает тот же фокус, что и клавиатура/геймпад (единая модель)
    board.addEventListener('mouseover', function (e) {
      var t = e.target.closest ? e.target.closest('.cell') : null;
      if (t && uiContext === 'board') {
        setFocus(parseInt(t.getAttribute('data-index'), 10));
      }
    });
  }

  function renderCell(index) {
    var mark = game.engine.board[index];
    var el = cellEls[index];
    el.classList.remove('cross', 'nought');
    if (mark === 'X') {
      el.classList.add('cross');
    } else if (mark === 'O') {
      el.classList.add('nought');
    }
  }

  function renderAllCells() {
    for (var i = 0; i < 9; i++) {
      renderCell(i);
    }
  }

  /* --------------------------------------------------- события партии */

  function onGameEvent(event, data) {
    if (event === 'newgame') {
      renderAllCells();
      hideResult();
    } else if (event === 'move') {
      renderCell(data.index);
    } else if (event === 'gameover') {
      showResult(data.status);
    }
    renderFocus(); // вид фокуса зависит от доски, очереди и статуса
  }

  /* ---------------------------------------------------------- оверлеи */

  function showResult(status) {
    $('result-text').innerHTML = RESULT_TEXTS[status] || '';
    $('result-overlay').hidden = false;
    setContext('result');
  }

  function hideResult() {
    $('result-overlay').hidden = true;
    setContext('board');
  }

  /* ------------------------------------------------------------- меню */

  var MENU_ITEMS = ['mi-new-game', 'mi-settings', 'mi-exit', 'mi-about'];
  var menuIndex = 0;

  function menuOpen() {
    return $('menu-game').classList.contains('open');
  }

  function openMenuKbd() {
    $('menu-game').classList.add('open');
    menuIndex = 0;
    setContext('menu');
    renderMenuSel();
  }

  function closeMenu() {
    $('menu-game').classList.remove('open');
    setContext('board');
    renderMenuSel();
  }

  function renderMenuSel() {
    for (var i = 0; i < MENU_ITEMS.length; i++) {
      var el = $(MENU_ITEMS[i]);
      el.classList.remove('kbd-active');
      if (menuOpen() && i === menuIndex) {
        el.classList.add('kbd-active');
      }
    }
  }

  function activateMenuSel() {
    var id = MENU_ITEMS[menuIndex];
    closeMenu();
    $(id).click();
  }

  function initMenu() {
    // «Игра» — раскрытие/закрытие выпадающего списка (мышью)
    var menuGame = $('menu-game');
    menuGame.addEventListener('click', function (e) {
      if (e.target.closest('.dd-item')) {
        return; // клики по пунктам обрабатываются отдельно
      }
      menuGame.classList.toggle('open');
      if (menuOpen()) { setContext('menu'); } else { setContext('board'); }
      e.stopPropagation();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#menu-game')) {
        if (menuOpen()) {
          closeMenu();
        }
      }
    });

    $('mi-new-game').addEventListener('click', function () {
      closeMenu();
      newGame();
    });
    $('mi-settings').addEventListener('click', function () {
      closeMenu();
      openSettings();
    });
    $('mi-exit').addEventListener('click', function () {
      closeMenu();
      exitGame();
    });
    $('mi-about').addEventListener('click', openAbout);

    $('result-new-game').addEventListener('click', newGame);
  }

  /** «Выход»: закрыть вкладку, если браузер разрешает; иначе — прощальный экран. */
  function exitGame() {
    $('farewell').hidden = false;
    setContext('farewell');
    window.close();
  }

  /* ------------------------------------------------------- настройки */

  var CHECK_IDS = ['cb-easy', 'cb-hard', 'cb-player-first', 'cb-computer-first',
    'cb-reading', 'cb-numpad'];
  var checkIndex = 0; // сетка 2x3: строка = idx/2, колонка = idx%2

  function fireChange(el) {
    if (typeof el.dispatchEvent === 'function') {
      el.dispatchEvent(new global.Event('change'));
    } else if (typeof el.change === 'function') {
      el.change();
    }
  }

  function renderCheckSel() {
    for (var i = 0; i < CHECK_IDS.length; i++) {
      $(CHECK_IDS[i]).classList.remove('kbd-active');
      if (i === checkIndex) {
        $(CHECK_IDS[i]).classList.add('kbd-active');
      }
    }
  }

  function moveCheckSel(action) {
    var col = checkIndex % 2, row = Math.floor(checkIndex / 2);
    if (action === 'LEFT' && col > 0) { col--; }
    if (action === 'RIGHT' && col < 1) { col++; }
    if (action === 'UP' && row > 0) { row--; }
    if (action === 'DOWN' && row < 2) { row++; }
    checkIndex = row * 2 + col;
    renderCheckSel();
  }

  function openSettings() {
    // отражаем действующие настройки в чекбоксах
    $('cb-easy').checked = game.settings.level === 'easy';
    $('cb-hard').checked = game.settings.level === 'hard';
    $('cb-player-first').checked = game.settings.first === 'player';
    $('cb-computer-first').checked = game.settings.first === 'computer';
    $('cb-reading').checked = game.settings.digitLayout === 'reading';
    $('cb-numpad').checked = game.settings.digitLayout === 'numpad';
    $('settings-modal').hidden = false;
    checkIndex = 0;
    setContext('settings');
    renderCheckSel();
  }

  function closeSettings() {
    $('settings-modal').hidden = true;
    setContext('board');
  }

  function initSettings() {
    // пары взаимоисключающих чекбоксов, как TCheckBox в оригинале
    function pair(aId, bId, onPick) {
      var a = $(aId), b = $(bId);
      a.addEventListener('change', function () {
        if (a.checked) { b.checked = false; } else { a.checked = true; }
        onPick();
      });
      b.addEventListener('change', function () {
        if (b.checked) { a.checked = false; } else { b.checked = true; }
        onPick();
      });
    }
    pair('cb-easy', 'cb-hard', function () {
      game.applySettings({ level: $('cb-hard').checked ? 'hard' : 'easy' });
    });
    pair('cb-player-first', 'cb-computer-first', function () {
      game.applySettings({ first: $('cb-computer-first').checked ? 'computer' : 'player' });
    });
    pair('cb-reading', 'cb-numpad', function () {
      game.applySettings({ digitLayout: $('cb-numpad').checked ? 'numpad' : 'reading' });
    });
    $('settings-close').addEventListener('click', closeSettings);
  }

  /* -------------------------------------------------------- об авторе */

  function openAbout() {
    $('about-text').textContent = ABOUT_TEXT;
    $('about-modal').hidden = false;
    setContext('about');
  }

  function closeAbout() {
    $('about-modal').hidden = true;
    setContext('board');
  }

  function initAbout() {
    $('about-close').addEventListener('click', closeAbout);
    // клик по фону закрывает окно
    $('about-modal').addEventListener('click', function (e) {
      if (e.target === $('about-modal')) { closeAbout(); }
    });
    $('settings-modal').addEventListener('click', function (e) {
      if (e.target === $('settings-modal')) { closeSettings(); }
    });
  }

  /* -------------------------------------------- диспетчер ввода (D2) */

  function setContext(ctx) {
    uiContext = ctx;
    renderFocus();
  }

  function handleAction(action) {
    switch (uiContext) {
      case 'board':
        if (action === 'UP' || action === 'DOWN' ||
            action === 'LEFT' || action === 'RIGHT') {
          moveFocus(action);
        } else if (action === 'CONFIRM') {
          confirmCell();
        } else if (action === 'MENU') {
          openMenuKbd();
        }
        break;
      case 'menu':
        if (action === 'UP') {
          menuIndex = (menuIndex + MENU_ITEMS.length - 1) % MENU_ITEMS.length;
          renderMenuSel();
        } else if (action === 'DOWN') {
          menuIndex = (menuIndex + 1) % MENU_ITEMS.length;
          renderMenuSel();
        } else if (action === 'CONFIRM') {
          activateMenuSel();
        } else if (action === 'BACK' || action === 'MENU') {
          closeMenu();
        }
        break;
      case 'settings':
        if (action === 'UP' || action === 'DOWN' ||
            action === 'LEFT' || action === 'RIGHT') {
          moveCheckSel(action);
        } else if (action === 'CONFIRM') {
          // переключение выбранного варианта пары (Space/A)
          var cb = $(CHECK_IDS[checkIndex]);
          cb.checked = true;
          fireChange(cb);
        } else if (action === 'BACK') {
          closeSettings();
        }
        break;
      case 'about':
        if (action === 'BACK' || action === 'CONFIRM') {
          closeAbout();
        }
        break;
      case 'result':
        if (action === 'CONFIRM') {
          newGame();
        } else if (action === 'BACK') {
          $('result-overlay').hidden = true;
          setContext('board'); // доска завершённой партии, мышь откроет меню
        }
        break;
      case 'farewell':
        break; // сессия завершена
    }
  }

  /** Цифра 1-9: прямой выбор клетки фокусом по действующей раскладке. */
  function handleDigit(digitChar) {
    if (uiContext !== 'board') {
      return;
    }
    var cell = NS.Input.digitCell(digitChar, game.settings.digitLayout);
    if (cell !== null) {
      setFocus(cell);
    }
  }

  /* --------------------------------------------------------- старт */

  function newGame() {
    game.newGame(); // события сами перерисуют поле
    setContext('board');
  }

  UI.init = function () {
    game = new NS.Game(NS.AI);
    game.onEvent = onGameEvent;
    buildBoard();
    initMenu();
    initSettings();
    initAbout();
    NS.Input.attach(handleAction, handleDigit);
    newGame(); // первая партия по настройкам по умолчанию («Легкий», «Я»)
  };
})(typeof window !== 'undefined' ? window : globalThis);
