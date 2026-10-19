/* Крестики-нолики по ПЗшному — UI-слой (capabilities: game-ui + game-input).
 * DOM: окно, поле, меню, модальные окна «Настройки» и «Об авторе»,
 * оверлей результата. Оркестрация партии — Krestiki.Game (engine.js).
 * Ввод: мышь (как раньше) + клавиатура/геймпад через Krestiki.Input —
 * единая модель фокуса и контекстная диспетчеризация (design.md D2).
 */
(function (global) {
  'use strict';

  var NS = global.Krestiki = global.Krestiki || {};

  /* Сетка поля — РЕГУЛЯРНАЯ, ОТ ЦЕНТРА (алгоритм пользователя):
   * центральная клетка идеально между четырьмя внутренними линиями
   * (центр 212 x 204.5 в экранных координентах), остальные — на одинаковом
   * шаге: колонки через 120 (линии X=152 и X=272 ложатся ровно в середины
   * промежутков), строки через 123 (линии Y=143 и Y=266). Клетки одинаковые
   * 106x109, зазор ~3px до каждой внутренней линии с обеих сторон; текстуры
   * меток (96x94, 93x112) влезают целиком. Внешние рамки поля клетки
   * задевают — это допустимо (приёмка). */
  var CELLS = [
    { x: 39,  y: 27,  w: 106, h: 109 }, { x: 159, y: 27,  w: 106, h: 109 }, { x: 279, y: 27,  w: 106, h: 109 },
    { x: 39,  y: 150, w: 106, h: 109 }, { x: 159, y: 150, w: 106, h: 109 }, { x: 279, y: 150, w: 106, h: 109 },
    { x: 39,  y: 273, w: 106, h: 109 }, { x: 159, y: 273, w: 106, h: 109 }, { x: 279, y: 273, w: 106, h: 109 }
  ];

  /* Текст «Об авторе» — современная редакция (change redesign-about-window):
   * автор и благодарности сохранены, стилистика обновлена, мёртвая ссылка
   * ei-census заменена проектом-наследником «Вселенная Аллодов».
   * Текст живёт здесь, а не в layout.json — к DFM отношения не имеет. */
  var ABOUT_LINES = [
    'Автор — fatfaldog',
    'Тестирование — PPyatachok',
    '',
    'Отдельная благодарность:',
    'ksaont, Morgens',
    'и проекту «Вселенная Аллодов»',
    'allods.gipat.ru'
  ];

  /* Тексты исходов — ДОСЛОВНО из оригинального exe (литералы в .data@0x72390,
   * извлекаются в layout.json -> resultTexts; см. change restore-original-result-texts).
   * «ПоЗдравляю» — врезанная аббревиатура ПЗ, не опечатка.
   * Единственная адаптация (design D2): форумный код «:tease:» (колобки Nival)
   * заменён на UTF-эмодзи-аналог 😜. */
  var RESULT_TEXTS = {
    playerWon: 'Вы выиграли. ПоЗдравляю!!!!!',
    computerWon: 'Комп вас уделал \u{1F61C}',
    draw: 'Ничья!!!!'
  };

  var UI = NS.UI = {};
  var game = null;
  var cellEls = [];

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ фокус */

  var focusCell = null;        // 0..8 | null — единый фокус клетки (мышь+клавиатура)
  var uiContext = 'board';     // board | menu | settings | about | result | farewell

  /** Чистая функция вида фокуса (design.md D3):
   *  ghost / ghost-nought — пустая клетка в очередь игрока (призрак текущего
   *  знака игрока: крестика или нолика — change first-mover-plays-crosses);
   *  glow  — пустая в очередь компьютера; invalid — занятая;
   *  dim   — партия не идёт или ввод в другом контексте. */
  function focusView(cellIdx, board, side, status, context, playerMark) {
    if (context !== 'board' || status !== 'playing') {
      return 'dim';
    }
    if (board[cellIdx]) {
      return 'invalid';
    }
    if (side !== 'player') {
      return 'glow';
    }
    // призрак — текущий знак игрока: крестик или нолик (first-mover-plays-crosses)
    return playerMark === 'O' ? 'ghost-nought' : 'ghost';
  }

  function currentFocusView() {
    if (focusCell === null || !game) {
      return null;
    }
    return focusView(focusCell, game.engine.board, game.engine.current,
      game.engine.status, uiContext, game.engine.playerMark);
  }

  function renderFocus() {
    var view = currentFocusView();
    for (var i = 0; i < 9; i++) {
      cellEls[i].classList.remove('focused', 'ghost', 'ghost-nought', 'invalid', 'dim');
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
      btn.tabIndex = -1;   // фокус — собственный менеджер, не Tab (правка приёмки)
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
      focusCell = null; // новая партия — фокус сбрасывается
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
    // Tab-фокус на пунктах меню: Enter/Space открывают их (правка приёмки)
    [$('menu-game'), $('mi-about')].forEach(function (item) {
      item.addEventListener('keydown', function (e) {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
          e.preventDefault();
          item.click();
        }
      });
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

  /* Диалог-список с черновиком (change redesign-settings-window):
   * открытие копирует настройки; циклы меняют черновик (и фон-существо рамки —
   * живое превью); плита галочки применяет, крестик/Esc/B отбрасывают. */
  var SETTING_KEYS = ['level', 'first', 'digitLayout'];
  var SETTING_LABELS = {
    level: { easy: 'Легкий', hard: 'Тяжелый' },
    first: { player: 'Я', computer: 'Комп' },
    digitLayout: { reading: 'Читающая', numpad: 'Нумпад' }
  };
  var SETTING_VALUE_IDS = { level: 'set-val-level', first: 'set-val-first', digitLayout: 'set-val-layout' };
  var SETTING_ROW_IDS = ['set-row-level', 'set-row-first', 'set-row-layout'];
  var settingsDraft = null;
  var settingsPos = 0;   // 0..2 — строки, 3 — плита OK, 4 — плита X

  function renderSettings() {
    if (!settingsDraft) {
      return;
    }
    for (var i = 0; i < SETTING_KEYS.length; i++) {
      $(SETTING_VALUE_IDS[SETTING_KEYS[i]]).innerHTML =
        SETTING_LABELS[SETTING_KEYS[i]][settingsDraft[SETTING_KEYS[i]]];
    }
    var frame = $('settings-frame');
    frame.classList.remove('easy', 'hard');
    frame.classList.add(settingsDraft.level === 'hard' ? 'hard' : 'easy');
    for (var r = 0; r < SETTING_ROW_IDS.length; r++) {
      $(SETTING_ROW_IDS[r]).classList.remove('kbd-active');
      if (settingsPos === r) { $(SETTING_ROW_IDS[r]).classList.add('kbd-active'); }
    }
    $('set-ok').classList.remove('kbd-active');
    $('set-cancel').classList.remove('kbd-active');
    if (settingsPos === 3) { $('set-ok').classList.add('kbd-active'); }
    if (settingsPos === 4) { $('set-cancel').classList.add('kbd-active'); }
  }

  function cycleSetting(key) {
    if (!settingsDraft) {
      return;
    }
    var d = settingsDraft;
    if (key === 'level') { d.level = d.level === 'easy' ? 'hard' : 'easy'; }
    if (key === 'first') { d.first = d.first === 'player' ? 'computer' : 'player'; }
    if (key === 'digitLayout') {
      d.digitLayout = d.digitLayout === 'reading' ? 'numpad' : 'reading';
    }
    renderSettings();
  }

  /* Модальность окон «Настройки»/«Об авторе»: главное окно (меню + поле)
   * переводится в inert — Tab-цикл и мышь не покидают диалог (правка приёмки) */
  function setMainWindowInert(on) {
    var w = $('game-window');
    if (on) { w.setAttribute('inert', ''); }
    else { w.removeAttribute('inert'); }
  }

  function openSettings() {
    settingsDraft = {
      level: game.settings.level,
      first: game.settings.first,
      digitLayout: game.settings.digitLayout
    };
    settingsPos = 0;
    $('settings-modal').hidden = false;
    setMainWindowInert(true);
    // фокус сразу внутри диалога: Tab стартует со строк, а не с меню
    var firstRow = $(SETTING_ROW_IDS[0]);
    if (firstRow && typeof firstRow.focus === 'function') {
      firstRow.focus();
    }
    setContext('settings');
    renderSettings();
  }

  function closeSettings() {
    $('settings-modal').hidden = true;
    settingsDraft = null;
    setMainWindowInert(false);
    setContext('board');
  }

  function applySettingsOk() {
    if (!settingsDraft) {
      return; // защита от двойного срабатывания (native click + клавиатура)
    }
    var gameplayChanged = settingsDraft.level !== game.settings.level ||
      settingsDraft.first !== game.settings.first;
    game.applySettings(settingsDraft); // раскладка действует немедленно
    closeSettings();
    if (gameplayChanged) {
      newGame(); // геймплейные настройки — сразу новой партией (design D1)
    }
  }

  function initSettings() {
    // Tab-фокус синхронизируется с выбором (settingsPos): Tab по строкам
    // и плитам двигает и подсветку выбора (правка приёмки)
    SETTING_ROW_IDS.forEach(function (rowId, i) {
      $(rowId).addEventListener('focus', function () {
        if (settingsDraft) {
          settingsPos = i;
          renderSettings();
        }
      });
    });
    $('set-ok').addEventListener('focus', function () {
      if (settingsDraft) { settingsPos = 3; renderSettings(); }
    });
    $('set-cancel').addEventListener('focus', function () {
      if (settingsDraft) { settingsPos = 4; renderSettings(); }
    });
    SETTING_ROW_IDS.forEach(function (rowId, i) {
      $(rowId).addEventListener('click', function () {
        settingsPos = i;
        cycleSetting(SETTING_KEYS[i]);
      });
    });
    $('set-ok').addEventListener('click', applySettingsOk);
    $('set-cancel').addEventListener('click', closeSettings);
  }

  /* -------------------------------------------------------- об авторе */

  function openAbout() {
    // текст уже в разметке (about-line) — здесь только показ;
    // плита-галочка НЕ подсвечивается по умолчанию (правка приёмки)
    $('about-modal').hidden = false;
    setMainWindowInert(true); // модально: Tab/мышь не уходят на поле и меню
    setContext('about');
  }

  function closeAbout() {
    $('about-modal').hidden = true;
    setMainWindowInert(false);
    setContext('board');
  }

  function initAbout() {
    $('about-ok').addEventListener('click', closeAbout);
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
        if (action === 'UP' && settingsPos > 0) {
          settingsPos--; renderSettings();
        } else if (action === 'DOWN' && settingsPos < 4) {
          settingsPos++; renderSettings();
        } else if (action === 'CONFIRM') {
          if (settingsPos < 3) {
            cycleSetting(SETTING_KEYS[settingsPos]);
          } else if (settingsPos === 3) {
            applySettingsOk();
          } else {
            closeSettings();
          }
        } else if (action === 'BACK') {
          closeSettings(); // отмена без применения
        }
        break;
      case 'about':
        // единственная интерактивная позиция — плита-галочка (kbd-active),
        // CONFIRM и BACK закрывают (design D4)
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

  UI.RESULT_TEXTS = RESULT_TEXTS;  // доступ для тестов

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
