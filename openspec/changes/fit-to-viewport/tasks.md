# Tasks

## 1. Фундамент и скейлер

- [x] 1.1 В `web/index.html` добавить `<meta name="viewport" content="width=device-width, initial-scale=1">` в `<head>`
- [x] 1.2 В `web/js/ui.js`: чистая `fitScale(w, h) = min(w/421, h/446, 1)` (округление до 4 знаков) + `applyFitScale()` — вешает `transform: scale(s)` на `.scene`; вызов из `UI.init()` и пассивный слушатель `resize`; экспорт `fitScale` в `NS.UI`
- [x] 1.3 В `web/css/style.css`: `.scene { transform-origin: center center; }` (комментарий: масштабирование под экран)

## 2. Тесты

- [x] 2.1 В `tools/ui_smoke.js`: `fitScale` для типовых размеров — 390×844 → ~0.926 (портрет), 844×390 → ~0.874 (ландшафт), 1920×1080 → 1 (десктоп), 419×460 → ~0.995 (iframe-сниппет); потолок 1:1; `applyFitScale` в стабе не падает и ставит transform
- [x] 2.2 Прогнать смоук и логические тесты, поправить красное

## 3. Приёмка и публикация

- [x] 3.1 Живая приёмка: Desktop Safari/Chrome responsive mode (390×844, 844×390) — вписано, окна целиком; реальный телефон по URL Pages; десктоп-окно обычного размера — визуально неотличимо от текущего
- [x] 3.2 Коммит, пуш, зелёный бейдж Tests, деплой Pages, финальная приёмка на опубликованной версии
