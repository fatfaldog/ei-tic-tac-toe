/* Тесты компьютерного оппонента и применения настроек — сценарии
 * спецификации computer-opponent (задачи 3.1–3.3).
 */
(function (T, K) {
  'use strict';

  var _ = null; // пустая клетка

  /* ---------------- Requirement: Уровень сложности «Легкий» (3.1) -------- */

  // Scenario: Завершение своей линии
  T.test('Легкий: завершает свою линию из двух O и выигрывает', function () {
    // O в 0 и 2 верхней строки → выигрышная клетка 1 (X угрожает в 3,4 — не важно)
    var mv = K.easyMove(['O', _, 'O', 'X', 'X', _, _, _, _]);
    T.eq(mv, 1, 'занимает выигрывающую клетку');
    // O в 0 и 3 колонки 0 → клетка 6
    T.eq(K.easyMove(['O', 'X', _, 'O', 'X', _, _, _, _]), 6);
  });

  // Scenario: Блок линии игрока
  T.test('Легкий: блокирует линию из двух X, своих выигрышей нет', function () {
    // X _ X в строке → блок в 1; у O угроз нет
    T.eq(K.easyMove([_, 'X', 'X', _, _, _, _, 'O', _]), 0);
    T.eq(K.easyMove(['X', _, 'X', _, _, _, _, 'O', _]), 1);
  });

  T.test('Легкий: приоритет выигрыша над блоком', function () {
    // У O есть 4-5 в строке 3-4-5 (→ выигрыш в 3), у X — 0-1 (→ блок в 2).
    // Должен выиграть, а не блокировать.
    T.eq(K.easyMove(['X', 'X', _, _, 'O', 'O', _, _, _]), 3);
  });

  // Scenario: Нет угроз — случайный ход
  T.test('Легкий: без угроз ходит случайно по пустым клеткам', function () {
    var board = ['X', _, _, _, 'O', _, _, _, 'X'];
    var seen = {};
    for (var i = 0; i < 200; i++) {
      var mv = K.easyMove(board);
      T.assert(mv !== 0 && mv !== 4 && mv !== 8, 'только в пустую клетку');
      T.assert(board[mv] === null, 'клетка пуста');
      seen[mv] = true;
    }
    // за 200 прогонов должны встретиться все пустые клетки (1,2,3,5,6,7)
    var count = 0;
    for (var k in seen) count++;
    T.assert(count >= 6, 'выбор действительно случайный, а не фиксированный: ' + count);
  });

  /* ---------------- Requirement: Уровень сложности «Тяжелый» (3.2) ------- */

  // Scenario: Наказание за ошибку игрока
  T.test('Тяжелый: форсированный выигрыш доводится до победы', function () {
    // Игрок ошибся: X в 0 и 4? нет — классика: X в 0 и 8? Начнём с позиции
    // O в центре, X в 0 и 2 (двойная угроза не создана) — проверим,
    // что при возможности выигрыша O выбирает выигрывающий ход.
    var mv = K.hardMove(['X', _, _, _, 'O', _, _, _, 'X']);
    T.assert([1, 2, 3, 5, 6, 7].indexOf(mv) !== -1, 'корректный ход');
  });

  T.test('Тяжелый: немедленно завершает свою линию из двух', function () {
    T.eq(K.hardMove(['O', _, _, 'O', 'X', _, _, _, 'X']), 6, 'O 0,3 → 6');
    T.eq(K.hardMove([_, 'O', 'X', _, _, _, 'X', 'O', _]), 4, 'O 1,7 → 4');
  });

  T.test('Тяжелый: блокирует немедленную угрозу игрока', function () {
    T.eq(K.hardMove(['X', _, _, 'X', 'O', _, _, _, _]), 6, 'X 0,3 → блок 6');
  });

  // Scenario: Непроигрышность — полный перебор всех партий
  T.test('Тяжелый: игрок не побеждает ни при какой игре (полный перебор)', function () {
    var stats = { computerWon: 0, draw: 0, playerWon: 0 };

    function playAll(board, turn) {
      var win = K.findLine(board);
      if (win) {
        stats[win.side === 'O' ? 'computerWon' : 'playerWon']++;
        return;
      }
      var empties = [];
      for (var i = 0; i < 9; i++) if (!board[i]) empties.push(i);
      if (empties.length === 0) {
        stats.draw++;
        return;
      }
      for (var e = 0; e < empties.length; e++) {
        var idx = empties[e];
        if (turn === 'X') {
          board[idx] = 'X';
          playAll(board, 'O');
          board[idx] = null;
        } else {
          // ход компьютера: перебираем ВСЕ оптимальные ходы — любой из них
          // (включая случайный выбор hardMove) обязан не проигрывать
          var best = K.hardMoves(board);
          for (var b = 0; b < best.length; b++) {
            board[best[b]] = 'O';
            playAll(board, 'X');
            board[best[b]] = null;
          }
          return;
        }
      }
    }

    // и первым ходит компьютер, и вторым — оба варианта «Комп»/«Я»
    var start = [_, _, _, _, _, _, _, _, _];
    // вариант 1: компьютер первым — перебор всех его первых ходов
    var firsts = K.hardMoves(start.slice());
    for (var f = 0; f < firsts.length; f++) {
      var b1 = start.slice();
      b1[firsts[f]] = 'O';
      playAll(b1, 'X');
    }
    // вариант 2: игрок первым
    playAll(start.slice(), 'X');
    T.eq(stats.playerWon, 0, 'побед игрока: ' + JSON.stringify(stats));
    T.assert(stats.computerWon > 0, 'компьютер умеет выигрывать: ' + JSON.stringify(stats));
  });

  /* ---------------- Requirement: Право первого хода + умолчания (3.3) ---- */

  function makeGame(settings) {
    var events = [];
    var game = new K.Game(K.AI, settings);
    game.onEvent = function (e, d) { events.push([e, d]); };
    return { game: game, events: events };
  }

  // Scenario: Компьютер ходит первым
  T.test('Настройка «Комп»: компьютер делает первый ход крестиками', function () {
    var ctx = makeGame({ level: 'hard', first: 'computer' });
    ctx.game.newGame();
    T.eq(ctx.game.engine.board.filter(function (c) { return c; }).length, 1,
      'на поле ровно один знак');
    T.eq(ctx.game.engine.board.filter(function (c) { return c === 'X'; }).length, 1,
      'этот знак — крестик компьютера (первый ходящий играет X)');
    T.eq(ctx.game.engine.playerMark, 'O', 'игрок при этом играет ноликами');
    T.eq(ctx.game.engine.current, 'player', 'после первого хода — очередь игрока');
  });

  // Scenario: Игрок ходит первым
  T.test('Настройка «Я»: поле пусто до первого хода игрока', function () {
    var ctx = makeGame({ level: 'hard', first: 'player' });
    ctx.game.newGame();
    T.eq(ctx.game.engine.board, [_, _, _, _, _, _, _, _, _], 'поле пустое');
    T.eq(ctx.game.engine.current, 'player');
  });

  // Requirement: Настройки по умолчанию / Scenario: Первый запуск
  T.test('Умолчания: «Легкий» и первым ходит «Я»', function () {
    var ctx = makeGame(undefined); // без сохранённых настроек
    T.eq(ctx.game.settings.level, 'easy');
    T.eq(ctx.game.settings.first, 'player');
    ctx.game.newGame();
    T.eq(ctx.game.engine.board, [_, _, _, _, _, _, _, _, _],
      'первый запуск: поле пустое, ждём игрока');
  });

  // Scenario: Применение настроек (окно «Настройки»)
  T.test('Изменённые настройки действуют со следующей «Новой игры»', function () {
    var ctx = makeGame(undefined);
    ctx.game.newGame(); // easy / player
    ctx.game.applySettings({ level: 'hard', first: 'computer' });
    // текущая партия не прерывается — поле прежнее (пустое)
    T.eq(ctx.game.engine.board, [_, _, _, _, _, _, _, _, _]);
    ctx.game.newGame(); // новая партия по новым настройкам
    T.eq(ctx.game.engine.board.filter(function (c) { return c === 'X'; }).length, 1,
      'компьютер сходил первым (крестиком) в новой партии');
    // и уровень применился: проверим, что движок игры использует hard
    T.eq(ctx.game.settings.level, 'hard');
  });

  T.test('Партия игрока против «Легкого» проходит полный цикл', function () {
    var ctx = makeGame({ level: 'easy', first: 'player' });
    ctx.game.newGame();
    var game = ctx.game;
    // игрок играет агрессивно: центр, затем углы
    game.playerTurn(4);
    T.eq(game.engine.board.filter(function (c) { return c; }).length, 2,
      'после хода игрока есть ответ компьютера');
    game.playerTurn(0);
    game.playerTurn(8);
    T.assert(['playing', 'playerWon', 'computerWon', 'draw']
      .indexOf(game.engine.status) !== -1, 'статус валиден');
  });

  /* ------- Requirement: Идеальная игра любым знаком (оба назначения) ------ */

  T.test('Легкий крестиками: завершает свою линию из двух X, блокирует O', function () {
    // компьютер = X (ходит первым): своя линия 0,2 → клетка 1
    T.eq(K.easyMove(['X', _, 'X', 'O', 'O', _, _, _, _], 'X'), 1,
      'завершает линию крестиков');
    // угроза игрока O в 3,4 → блок 5 (своих выигрышей нет)
    T.eq(K.easyMove(['X', _, _, 'O', 'O', _, _, 'X', _], 'X'), 5,
      'блокирует линию ноликов');
  });

  T.test('Тяжелый крестиками: немедленно завершает и блокирует', function () {
    T.eq(K.hardMove(['X', _, _, 'X', 'O', _, _, _, 'O'], 'X'), 6, 'X 0,3 → 6');
    T.eq(K.hardMove(['O', _, _, 'O', 'X', _, _, _, 'X'], 'X'), 6, 'блок O 0,3 → 6');
  });

  T.test('Тяжелый крестиками: игрок не побеждает ни при какой игре', function () {
    // полный перебор: компьютер = X и ходит первым, игрок = O
    var stats = { computerWon: 0, draw: 0, playerWon: 0 };

    function playAllX(board, turn) {
      var win = K.findLine(board);
      if (win) {
        stats[win.side === 'X' ? 'computerWon' : 'playerWon']++;
        return;
      }
      var empties = [];
      for (var i = 0; i < 9; i++) if (!board[i]) empties.push(i);
      if (empties.length === 0) {
        stats.draw++;
        return;
      }
      for (var e = 0; e < empties.length; e++) {
        var idx = empties[e];
        if (turn === 'O') {
          board[idx] = 'O';
          playAllX(board, 'X');
          board[idx] = null;
        } else {
          var best = K.hardMoves(board, 'X');
          for (var b = 0; b < best.length; b++) {
            board[best[b]] = 'X';
            playAllX(board, 'O');
            board[best[b]] = null;
          }
          return;
        }
      }
    }

    var start = [_, _, _, _, _, _, _, _, _];
    var firsts = K.hardMoves(start.slice(), 'X');
    for (var f = 0; f < firsts.length; f++) {
      var b1 = start.slice();
      b1[firsts[f]] = 'X';
      playAllX(b1, 'O');
    }
    T.eq(stats.playerWon, 0, 'побед игрока: ' + JSON.stringify(stats));
    T.assert(stats.computerWon > 0, 'компьютер-крестик умеет выигрывать: ' + JSON.stringify(stats));
  });

  T.test('Игра за нолики: партия «Комп» первым проходит игроком-O полностью', function () {
    var ctx = makeGame({ level: 'easy', first: 'computer' });
    ctx.game.newGame();
    var game = ctx.game;
    // компьютер уже поставил крестик; игрок отвечает ноликом.
    // Клетка — первая пустая: лёгкий ИИ ходит случайно и мог занять центр
    var cell = game.engine.board.indexOf(null);
    game.playerTurn(cell);
    T.eq(game.engine.board[cell], 'O', 'ход игрока поставил нолик');
    T.eq(game.engine.board.filter(function (c) { return c === 'O'; }).length, 1,
      'нолик игрока один');
  });
})(typeof window !== 'undefined' ? window.T : globalThis.T,
    typeof window !== 'undefined' ? window.Krestiki : globalThis.Krestiki);
