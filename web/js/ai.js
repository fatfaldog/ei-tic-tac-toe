/* Крестики-нолики по ПЗшному — компьютерный оппонент (capability: computer-opponent).
 *
 * Уровни (design.md D4):
 *  easyMove: 1) завершить свою линию из двух O; 2) заблокировать линию из двух X;
 *            3) случайная пустая клетка;
 *  hardMove: минимакс с мемоизацией по позиции; при равных лучших ходах —
 *            случайный выбор среди них (идеальная игра, не проигрывает).
 * Компьютер всегда играет 'O', игрок — 'X'.
 */
(function (global) {
  'use strict';

  var NS = global.Krestiki = global.Krestiki || {};
  var LINES = NS.LINES;

  function emptyCells(board) {
    var out = [];
    for (var i = 0; i < 9; i++) {
      if (!board[i]) {
        out.push(i);
      }
    }
    return out;
  }

  /** Клетка, завершающая линию из двух знаков mark (+1 пустой), или null. */
  function completingCell(board, mark) {
    for (var i = 0; i < LINES.length; i++) {
      var l = LINES[i];
      var markCount = 0, emptyIdx = -1;
      for (var j = 0; j < 3; j++) {
        if (board[l[j]] === mark) {
          markCount++;
        } else if (board[l[j]] === null) {
          emptyIdx = l[j];
        }
      }
      if (markCount === 2 && emptyIdx !== -1) {
        return emptyIdx;
      }
    }
    return null;
  }

  function randomOf(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /* --------------------------------------------------------------- Легкий */

  function easyMove(board) {
    var win = completingCell(board, 'O');       // 1) выигрыш
    if (win !== null) {
      return win;
    }
    var block = completingCell(board, 'X');     // 2) блок
    if (block !== null) {
      return block;
    }
    return randomOf(emptyCells(board));         // 3) случайно
  }
  NS.easyMove = easyMove;

  /* --------------------------------------------------------------- Тяжелый */

  var memo = Object.create(null);

  /**
   * Минимакс: оценка позиции с хода стороны side ('O' компьютер максимизирует).
   * Возвращает { score, moves: [лучшие ходы] }. score: +10 - глубина (победа O),
   * -10 + глубина (победа X), 0 (ничья) — глубина нужна, чтобы выигрывать быстрее.
   */
  function minimax(board, side, depth) {
    var key = board.map(function (c) { return c || '-'; }).join('') + side;
    if (memo[key] !== undefined) {
      return memo[key];
    }
    var win = NS.findLine(board);
    if (win) {
      var s = win.side === 'O' ? 10 - depth : -10 + depth;
      return (memo[key] = { score: s, moves: [] });
    }
    if (emptyCells(board).length === 0) {
      return (memo[key] = { score: 0, moves: [] });
    }
    var best = null;
    var bestMoves = [];
    var empties = emptyCells(board);
    for (var i = 0; i < empties.length; i++) {
      var idx = empties[i];
      board[idx] = side;
      var sub = minimax(board, side === 'O' ? 'X' : 'O', depth + 1);
      board[idx] = null;
      var score = sub.score;
      if (best === null || (side === 'O' ? score > best : score < best)) {
        best = score;
        bestMoves = [idx];
      } else if (score === best) {
        bestMoves.push(idx);
      }
    }
    return (memo[key] = { score: best, moves: bestMoves });
  }

  function hardMove(board) {
    var res = minimax(board.slice(), 'O', 0);
    if (res.moves.length === 0) {
      throw new Error('hardMove: нет доступных ходов');
    }
    return randomOf(res.moves);
  }
  NS.hardMove = hardMove;

  /** Все оптимальные ходы компьютера в позиции (для тестов полного перебора). */
  NS.hardMoves = function (board) {
    return minimax(board.slice(), 'O', 0).moves.slice();
  };

  /* ------------------------------------------------------------- Обёртка */

  var AI = {
    pickMove: function (level, board) {
      return level === 'hard' ? hardMove(board) : easyMove(board);
    }
  };
  NS.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
