# Tasks

- [x] 1.1 В `web/js/ui.js` вызвать `applyFitScale()` при изменении видимости полосы (в `applySettingsOk` рядом с `renderStatusBar()`; старт уже корректен — `renderStatusBar` в init идёт до rAF-замера)
- [x] 1.2 Смоук: узкий viewport (deferTimers не нужен) — старт с «Статус: Выкл» в localStorage, замер transform; включение полосы через настройки → transform изменился (масштаб пересчитан); обратное выключение → вернулось
- [x] 1.3 Прогнать смоук и логические тесты; коммит, пуш, бейдж, деплой
