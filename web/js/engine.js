/* Крестики-нолики по ПЗшному — движок правил (capability: tic-tac-toe-game).
 *
 * Чистая логика без DOM (design.md D4). Знаки назначаются по праву первого
 * хода (change first-mover-plays-crosses): первый ходящий играет крестиками
 * ('X'), второй — ноликами ('O'). Все сценарии — в specs/tic-tac-toe-game/spec.md.
 *
 * Здесь же — Krestiki.Game: оркестратор партии (движок + ИИ + настройки),
 * тоже без DOM; UI (ui.js/main.js) подписывается на события.
 */
(function (global) {
  'use strict';

  var NS = global.Krestiki = global.Krestiki || {};

  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // горизонтали
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // вертикали
    [0, 4, 8], [2, 4, 6]               // диагонали
  ];
  NS.LINES = LINES;

  /** Оценка позиции: 'X' | 'O' при собранной линии (с самой линией) или null. */
  function findLine(board) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i];
      if (board[l[0]] && board[l[0]] === board[l[1]] && board[l[1]] === board[l[2]]) {
        return { side: board[l[0]], line: l };
      }
    }
    return null;
  }
  NS.findLine = findLine;

  /** Движок партии. whoFirst: 'player' | 'computer'. */
  function Engine(whoFirst) {
    this.whoFirst = whoFirst === 'computer' ? 'computer' : 'player';
    this.reset();
  }

  Engine.prototype.reset = function () {
    this.board = [null, null, null, null, null, null, null, null, null];
    // текущая сторона: 'player' | 'computer'
    this.current = this.whoFirst;
    // знаки по праву первого хода: ходящий первым — крестики (design D1)
    this.playerMark = this.whoFirst === 'player' ? 'X' : 'O';
    this.computerMark = this.whoFirst === 'player' ? 'O' : 'X';
    // 'playing' | 'playerWon' | 'computerWon' | 'draw'
    this.status = 'playing';
    this.winnerLine = null;
  };

  Engine.prototype.sideMark = function (side) {
    return side === 'player' ? this.playerMark : this.computerMark;
  };

  Engine.prototype.canMove = function (side, index) {
    return this.status === 'playing' &&
      (side === 'player' || side === 'computer') &&
      this.current === side &&
      index >= 0 && index <= 8 &&
      this.board[index] === null;
  };

  /** Ход стороны в клетку. Возвращает true, если ход принят. */
  Engine.prototype.move = function (side, index) {
    if (!this.canMove(side, index)) {
      return false; // занятая клетка, не та очередь или партия завершена — игнор
    }
    this.board[index] = this.sideMark(side);
    var win = findLine(this.board);
    if (win) {
      this.status = win.side === this.playerMark ? 'playerWon' : 'computerWon';
      this.winnerLine = win.line;
    } else if (this.board.indexOf(null) === -1) {
      this.status = 'draw';
    } else {
      this.current = side === 'player' ? 'computer' : 'player';
    }
    return true;
  };

  /** Ход игрока (только в свою очередь). */
  Engine.prototype.playerMove = function (index) {
    return this.move('player', index);
  };

  /** Ход компьютера (только в свою очередь). */
  Engine.prototype.computerMove = function (index) {
    return this.move('computer', index);
  };

  NS.Engine = Engine;

  /* ------------------------------------------------------------------ *
   * Оркестратор партии: настройки по умолчанию (specs/computer-opponent),
   * применение их к новой партии, автоматический ход компьютера.
   * settings: { level: 'easy'|'hard', first: 'player'|'computer',
   *   digitLayout: 'reading'|'numpad', showDigits: boolean }
   * ai: объект с методом pickMove(level, board, marks) — внедряется (ai.js);
   * marks = { my: знак компьютера, opp: знак игрока }.
   */
  function Game(ai, settings) {
    this.ai = ai;
    // умолчания при первом запуске; digitLayout — раскладка клавиш 1-9 (game-input),
    // showDigits — показ номеров клеток на поле (cell-number-hints),
    // animate — проявление знаков и темп (settings-graphics-group)
    this.settings = { level: 'easy', first: 'player', digitLayout: 'reading', showDigits: true, animate: true, statusBar: true };
    if (settings) {
      this.applySettings(settings);
    }
    this.onEvent = null; // callback(event, data)
    this.engine = null;
  }

  Game.prototype.applySettings = function (settings) {
    if (settings) {
      if (settings.level === 'easy' || settings.level === 'hard') {
        this.settings.level = settings.level;
      }
      if (settings.first === 'player' || settings.first === 'computer') {
        this.settings.first = settings.first;
      }
      if (settings.digitLayout === 'reading' || settings.digitLayout === 'numpad') {
        this.settings.digitLayout = settings.digitLayout;
      }
      if (typeof settings.showDigits === 'boolean') {
        this.settings.showDigits = settings.showDigits;
      }
      if (typeof settings.animate === 'boolean') {
        this.settings.animate = settings.animate;
      }
      if (typeof settings.statusBar === 'boolean') {
        this.settings.statusBar = settings.statusBar;
      }
    }
  };

  Game.prototype.emit = function (event, data) {
    if (typeof this.onEvent === 'function') {
      this.onEvent(event, data);
    }
  };

  /** Новая партия по действующим настройкам. Если первым ходит
   *  компьютер — сразу делает первый ход в пустое поле. */
  Game.prototype.newGame = function () {
    this.engine = new Engine(this.settings.first);
    this.emit('newgame', { first: this.settings.first,
      playerMark: this.engine.playerMark, computerMark: this.engine.computerMark });
    if (this.settings.first === 'computer') {
      this.computerTurn();
    }
  };

  /** Ход игрока; при успехе (и если партия продолжается) — ответ компьютера. */
  Game.prototype.playerTurn = function (index) {
    if (!this.engine) {
      return false;
    }
    if (!this.engine.playerMove(index)) {
      return false; // очередь не та / клетка занята / партия завершена
    }
    this.emit('move', { side: 'player', index: index, mark: this.engine.playerMark });
    if (this.engine.status === 'playing') {
      this.computerTurn();
    } else {
      this.emitGameOver();
    }
    return true;
  };

  /** Ход компьютера через ИИ выбранного уровня. */
  Game.prototype.computerTurn = function () {
    var marks = { my: this.engine.computerMark, opp: this.engine.playerMark };
    var index = this.ai.pickMove(this.settings.level, this.engine.board, marks);
    if (!this.engine.computerMove(index)) {
      throw new Error('ИИ выбрал недопустимый ход: ' + index);
    }
    this.emit('move', { side: 'computer', index: index, mark: this.engine.computerMark });
    if (this.engine.status !== 'playing') {
      this.emitGameOver();
    }
  };

  Game.prototype.emitGameOver = function () {
    this.emit('gameover', { status: this.engine.status, line: this.engine.winnerLine });
  };

  NS.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
