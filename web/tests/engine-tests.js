/* Тесты движка — сценарии спецификации tic-tac-toe-game.
 * Знаки параметризованы правом первого хода (change first-mover-plays-crosses):
 * первый ходящий играет крестиками. */
(function (T, K) {
  'use strict';

  function fresh(first) {
    return new K.Engine(first || 'player');
  }

  // Requirement: Игровое поле 3×3 / Scenario: Начало партии
  T.test('Начало партии: все 9 клеток пустые', function () {
    var e = fresh();
    T.eq(e.board.length, 9, 'поле из 9 клеток');
    T.eq(e.board, [null, null, null, null, null, null, null, null, null], 'все пустые');
    T.eq(e.status, 'playing');
  });

  // Requirement: Фиксированные знаки сторон / Scenario: Знаки сторон (игрок первым)
  T.test('Игрок первым: игрок — X, компьютер — O', function () {
    var e = fresh('player');
    T.eq(e.playerMark, 'X');
    T.eq(e.computerMark, 'O');
    T.assert(e.playerMove(4), 'ход игрока принят');
    T.eq(e.board[4], 'X', 'игрок поставил крестик');
    T.assert(e.computerMove(0), 'ответ компьютера принят');
    T.eq(e.board[0], 'O', 'компьютер поставил нолик');
  });

  // Requirement: Фиксированные знаки сторон / Scenario: Компьютер ходит первым
  T.test('Компьютер первым: компьютер — X, игрок — O', function () {
    var e = fresh('computer');
    T.eq(e.computerMark, 'X', 'первый ходящий — крестики');
    T.eq(e.playerMark, 'O');
    T.assert(e.computerMove(4), 'первый ход компьютера принят');
    T.eq(e.board[4], 'X', 'компьютер поставил крестик');
    T.assert(e.playerMove(0), 'ответ игрока принят');
    T.eq(e.board[0], 'O', 'игрок поставил нолик');
  });

  // Requirement: Фиксированные знаки сторон / Scenario: Смена знаков между партиями
  T.test('Смена расклада знаков между партиями', function () {
    var e = fresh('computer');
    e.computerMove(4); e.playerMove(0);
    T.eq(e.playerMark, 'O');
    // та же партия — знаки не меняются
    T.eq(e.board[4], 'X'); T.eq(e.board[0], 'O');
    // смена настройки на «Я» (новый Engine) — игрок снова крестик
    var e2 = fresh('player');
    T.eq(e2.playerMark, 'X');
    T.eq(e2.computerMark, 'O');
  });

  // Requirement: Ходы в пустые клетки / Scenario: Ход игрока в пустую клетку
  T.test('Ход в пустую клетку принят, очередь переходит', function () {
    var e = fresh();
    T.assert(e.playerMove(0), 'ход принят');
    T.eq(e.board[0], e.playerMark);
    T.eq(e.current, 'computer', 'очередь у компьютера');
  });

  // Requirement: Ходы в пустые клетки / Scenario: Попытка хода в занятую клетку
  T.test('Ход в занятую клетку (свою и чужую) игнорируется', function () {
    var e = fresh();
    e.playerMove(4);                 // знак игрока в центре
    T.assert(!e.playerMove(4), 'повторный ход в свою клетку отклонён');
    e.computerMove(0);               // знак компьютера в углу
    T.assert(!e.playerMove(0), 'ход в клетку компьютера отклонён');
    T.eq(e.current, 'player', 'очередь не изменилась');
    T.eq(e.board[4], 'X');
    T.eq(e.board[0], 'O');
  });

  // Requirement: Очерёдность ходов / Scenario: Очередь компьютера
  T.test('После хода игрока компьютер делает один ответный ход', function () {
    var e = fresh();
    e.playerMove(1);
    T.eq(e.current, 'computer', 'очередь компьютера');
    e.computerMove(2);
    T.eq(e.current, 'player', 'после ответа — снова игрок');
  });

  // Requirement: Очерёдность ходов / Scenario: Ход во время очереди компьютера
  T.test('Ход игрока во время очереди компьютера игнорируется', function () {
    var e = fresh('computer');
    T.eq(e.current, 'computer', 'первым ходит компьютер');
    T.assert(!e.playerMove(0), 'ход игрока в чужую очередь отклонён');
    T.eq(e.board, [null, null, null, null, null, null, null, null, null],
      'поле не изменилось');
    T.eq(e.current, 'computer', 'очередь осталась у компьютера');
  });

  // Requirement: Определение победы / Scenario: Победа игрока
  T.test('Победа игрока: ряд из трёх его знаков завершает партию', function () {
    var e = fresh();
    e.playerMove(0); e.computerMove(3);
    e.playerMove(1); e.computerMove(4);
    e.playerMove(2); // верхняя горизонталь
    T.eq(e.status, 'playerWon');
    T.eq(e.winnerLine, [0, 1, 2], 'победная линия определена');
    T.assert(!e.computerMove(5), 'ход после победы игнорируется');
    T.assert(!e.playerMove(5), 'ход игрока после победы тоже игнорируется');
  });

  // Requirement: Определение победы / Scenario: Победа игрока ноликами
  T.test('Победа игрока ноликами (компьютер ходит первым)', function () {
    var e = fresh('computer');
    e.computerMove(0); e.playerMove(3);
    e.computerMove(1); e.playerMove(4);
    e.computerMove(8); e.playerMove(5); // вертикаль 3-4-5 ноликами игрока
    T.eq(e.status, 'playerWon', 'победа игрока при его знаке O');
    T.eq(e.winnerLine, [3, 4, 5]);
  });

  // Requirement: Определение победы / Scenario: Победа компьютера крестиками
  T.test('Победа компьютера крестиками (компьютер ходит первым)', function () {
    var e = fresh('computer');
    e.computerMove(0); e.playerMove(1);
    e.computerMove(4); e.playerMove(2);
    e.computerMove(8); // диагональ 0-4-8 крестиками компьютера
    T.eq(e.status, 'computerWon', 'победа компьютера при его знаке X');
    T.eq(e.winnerLine, [0, 4, 8]);
  });

  // Requirement: Определение победы / Scenario: Победа компьютера
  T.test('Победа компьютера: ряд из трёх O завершает партию', function () {
    var e = fresh();
    e.playerMove(0); e.computerMove(2);
    e.playerMove(1); e.computerMove(4);
    e.playerMove(7); e.computerMove(6); // диагональ 2-4-6
    T.eq(e.status, 'computerWon');
    T.eq(e.winnerLine, [2, 4, 6]);
    T.assert(!e.playerMove(8), 'ходы после победы запрещены');
  });

  T.test('Победа фиксируется в момент образования линии', function () {
    var e = fresh();
    e.playerMove(0); e.computerMove(1);
    e.playerMove(4); e.computerMove(2);
    T.eq(e.status, 'playing', 'двух знаков недостаточно');
    e.playerMove(8); // диагональ 0-4-8
    T.eq(e.status, 'playerWon', 'третий знак мгновенно завершает');
  });

  // Requirement: Ничья / Scenario: Поле заполнено без победной линии
  T.test('Ничья: поле заполнено, линии нет', function () {
    // Строгая последовательность p,c,p,c,... дающая ничью X O X / X O O / O X X:
    // p:0 c:1 p:2 c:5 p:3 c:4 p:7 c:6 p:8
    var e = fresh('player');
    var seq = [0, 1, 2, 5, 3, 4, 7, 6, 8];
    for (var i = 0; i < seq.length; i++) {
      var ok = (i % 2 === 0) ? e.playerMove(seq[i]) : e.computerMove(seq[i]);
      T.assert(ok, 'ход ' + i + ' принят');
    }
    T.eq(e.board, ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']);
    T.eq(e.status, 'draw', 'все клетки заняты, линии нет — ничья');
    T.assert(!e.playerMove(8), 'ходы после ничьей игнорируются');
  });

  // Requirement: Новая партия / Scenario: Перезапуск после завершённой партии
  T.test('Новая игра сбрасывает поле, очерёдность и знаки по настройке', function () {
    var e = fresh('player');
    e.playerMove(0); e.computerMove(4); e.playerMove(1); e.computerMove(8);
    e.reset();
    T.eq(e.board, [null, null, null, null, null, null, null, null, null],
      'поле очищено');
    T.eq(e.status, 'playing', 'партия заново идёт');
    T.eq(e.current, 'player', 'первым снова игрок');
    T.eq(e.playerMark, 'X', 'знаки переназначены');
    var e2 = fresh('computer');
    e2.computerMove(0);
    e2.reset();
    T.eq(e2.current, 'computer', 'при first=computer первым снова компьютер');
    T.eq(e2.computerMark, 'X', 'компьютер снова крестиками');
  });
})(typeof window !== 'undefined' ? window.T : globalThis.T,
    typeof window !== 'undefined' ? window.Krestiki : globalThis.Krestiki);
