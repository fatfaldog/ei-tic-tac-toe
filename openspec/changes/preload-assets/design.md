# Design

## Context

См. proposal.md — Why. Все изображения — CSS-фоны (`url()` в style.css), JS картинок не создаёт; `display:none` у скрытых модалок не даёт браузеру запрашивать их фоны. Список ленивых (по grep CSS + разметки): `cell-a/b.jpg` (знаки, первый ход), `assets/cursors/ei-arrow.png` (курсор, первый ховер), `plate-settings/settings-bg-1/2/plate-about/about-bg/plate-result` + `plate-confirm/cancel` (окна). `plate-new-game.png` в CSS не упоминается — мёртвый.

## Goals / Non-Goals

**Goals:**
- Нулевой поп-ин: к моменту первого использования файл уже в кэше.
- Прогрев не блокирует и не ломает ничего; работает на Pages и `file://`.

**Non-Goals:**
- Splash-экран/индикатор загрузки — не нужен, объём ~830 КБ.
- Preload шрифтов и favicon (браузер грузит сам).
- Изменение вёрстки/спрайты/打包 — без них.

## Decisions

1. **`new Image().src` из JS, не CSS-хитрости.** Альтернативы отвергнуты: `<link rel="preload">` на каждый файл раздувает head и не даёт двухфазность; div с `visibility:hidden` и фонами — вёрсточный хак, ломаемый рефакторингом. `Image()` греет именно HTTP-кэш, откуда фоны и берутся.
2. **Две фазы.** Фаза 1 (критично для первоначального состояния) — синхронно в `UI.init()`: `cell-a.jpg`, `cell-b.jpg`, `cursors/ei-arrow.png`, `plate-confirm.png`, `plate-cancel.png` (окно результата наступает быстро — после первой партии). Фаза 2 — по `window` `load` + `requestIdleCallback` (fallback `setTimeout(…, 1500)` при отсутствии API): `plate-settings.png`, `settings-bg-1.jpg`, `settings-bg-2.jpg`, `plate-about.png`, `about-bg.jpg`, `plate-result.png`. `main-bg.jpg` в списки не входит — он и так грузится видимым фоном окна.
3. **Устойчивость.** На каждый `Image` вешается пустой `onerror` — битый путь/`file://`-особенность не выбросят необработанную ошибку; прогрев не влияет на логику.
4. **Тестируемость.** Списки фаз экспортируются (`UI.PRELOAD_CRITICAL`, `UI.PRELOAD_BACKGROUND`) — смоук проверяет полноту (все файлы существуют в `web/assets/`, `plate-new-game.png` в списках нет и самого файла нет) и что прогрев в DOM-стабе не падает (`createElement('img')` стаба безвреден, `src` просто присваивается).
5. **Мёртвый ассет.** `web/assets/img/plate-new-game.png` удаляется из дерева; `references/new_game.png` и `tools/make_new_game_plate.py` остаются — при необходимости файл восстанавливается командой генератора.

## Risks / Trade-offs

- `requestIdleCallback` отсутствует в старых Safari — fallback таймером закрывает.
- Двойной запрос при гонке «CSS запросил фон раньше прогрева» — безвреден: браузер дедуплицирует по кэшу.
- На `file://` кэш-семантика отличается, но локально файлы и так мгновенны; прогрев просто безвреден.
