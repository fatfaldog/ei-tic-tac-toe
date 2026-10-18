/* Крестики-нолики по ПЗшному — UI-слой (capability: game-ui).
 * DOM: окно, поле, меню, модальные окна «Настройки» и «Об авторе»,
 * оверлей результата. Оркестрация партии — Krestiki.Game (engine.js).
 */
(function (global) {
  'use strict';

  var NS = global.Krestiki = global.Krestiki || {};

  /* Координаты клеток (набор A, TImage Image2..Image10) — сгенерировано из
   * web/assets/layout.json; размеры 97x97 у всех. */
  var CELLS = [
    { x: 45,  y: 36  }, { x: 168, y: 32  }, { x: 278, y: 32  },
    { x: 48,  y: 152 }, { x: 168, y: 152 }, { x: 280, y: 152 },
    { x: 48,  y: 272 }, { x: 168, y: 272 }, { x: 280, y: 272 }
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
      // Ходы мимо очереди/в занятые клетки движок игнорирует сам
      game.playerTurn(parseInt(t.getAttribute('data-index'), 10));
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
  }

  /* ---------------------------------------------------------- оверлеи */

  function showResult(status) {
    $('result-text').innerHTML = RESULT_TEXTS[status] || '';
    $('result-overlay').hidden = false;
  }

  function hideResult() {
    $('result-overlay').hidden = true;
  }

  /* ------------------------------------------------------------- меню */

  function initMenu() {
    // «Игра» — раскрытие/закрытие выпадающего списка
    var menuGame = $('menu-game');
    function closeDropdown() { menuGame.classList.remove('open'); }
    menuGame.addEventListener('click', function (e) {
      if (e.target.closest('.dd-item')) {
        return; // клики по пунктам обрабатываются отдельно
      }
      menuGame.classList.toggle('open');
      e.stopPropagation();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#menu-game')) {
        closeDropdown();
      }
    });

    $('mi-new-game').addEventListener('click', function () {
      closeDropdown();
      newGame();
    });
    $('mi-settings').addEventListener('click', function () {
      closeDropdown();
      openSettings();
    });
    $('mi-exit').addEventListener('click', function () {
      closeDropdown();
      exitGame();
    });
    $('mi-about').addEventListener('click', openAbout);

    $('result-new-game').addEventListener('click', newGame);
  }

  /** «Выход»: закрыть вкладку, если браузер разрешает; иначе — прощальный экран. */
  function exitGame() {
    $('farewell').hidden = false;
    window.close();
  }

  /* ------------------------------------------------------- настройки */

  function openSettings() {
    // отражаем действующие настройки в чекбоксах
    $('cb-easy').checked = game.settings.level === 'easy';
    $('cb-hard').checked = game.settings.level === 'hard';
    $('cb-player-first').checked = game.settings.first === 'player';
    $('cb-computer-first').checked = game.settings.first === 'computer';
    $('settings-modal').hidden = false;
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
    $('settings-close').addEventListener('click', function () {
      $('settings-modal').hidden = true;
    });
  }

  /* -------------------------------------------------------- об авторе */

  function openAbout() {
    $('about-text').textContent = ABOUT_TEXT;
    $('about-modal').hidden = false;
  }

  function initAbout() {
    $('about-close').addEventListener('click', function () {
      $('about-modal').hidden = true;
    });
    // клик по фону закрывает окно
    $('about-modal').addEventListener('click', function (e) {
      if (e.target === $('about-modal')) { $('about-modal').hidden = true; }
    });
    $('settings-modal').addEventListener('click', function (e) {
      if (e.target === $('settings-modal')) { $('settings-modal').hidden = true; }
    });
  }

  /* --------------------------------------------------------- старт */

  function newGame() {
    game.newGame(); // события сами перерисуют поле
  }

  UI.init = function () {
    game = new NS.Game(NS.AI);
    game.onEvent = onGameEvent;
    buildBoard();
    initMenu();
    initSettings();
    initAbout();
    newGame(); // первая партия по настройкам по умолчанию («Легкий», «Я»)
  };
})(typeof window !== 'undefined' ? window : globalThis);
