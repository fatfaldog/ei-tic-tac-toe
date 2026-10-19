# Tasks

## 1. Прогрев

- [x] 1.1 В `web/js/ui.js`: списки `PRELOAD_CRITICAL` (cell-a, cell-b, ei-arrow, plate-confirm, plate-cancel) и `PRELOAD_BACKGROUND` (plate-settings, settings-bg-1, settings-bg-2, plate-about, about-bg, plate-result); функция `preloadImages(list)` через `new Image()` с пустым `onerror`; вызов критичной фазы в `UI.init()`, фоновой — по `load` + `requestIdleCallback` (fallback `setTimeout`); экспорт списков в `NS.UI`
- [x] 1.2 Удалить `web/assets/img/plate-new-game.png` (ссылок в `web/` нет; генератор и исходник в `references/` остаются)

## 2. Тесты

- [x] 2.1 В `tools/ui_smoke.js`: прогрев в стабе не падает; все файлы обоих списков существуют в `web/assets/`; `plate-new-game.png` отсутствует и ни в одном списке
- [x] 2.2 Прогнать смоук и логические тесты, поправить красное

## 3. Приёмка и публикация

- [x] 3.1 Живая приёмка: открыть игру с пустым кэшем (DevTools → Network → Disable cache / инкогнито) — первый ход, ховер, открытие всех окон без поп-ина; Network показывает прогрев фоном
- [x] 3.2 Коммит, пуш, проверка деплоя GitHub Pages, финальная приёмка на опубликованной версии
