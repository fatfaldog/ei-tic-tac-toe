# Tasks

## 1. Воркфлоу публикации

- [x] 1.1 Создать `.github/workflows/deploy-pages.yml`: триггеры `push` в `main` по путям `web/**` и самому воркфлоу + `workflow_dispatch`; permissions `contents: read`, `pages: write`, `id-token: write`; шаги: checkout → `configure-pages` → `rsync -a web/ site/ --exclude tests` (+ контроль наличия `web/.nojekyll` в `site/`) → `upload-pages-artifact(path: site)` → `deploy-pages`. Проверка: YAML синтаксически валиден (python yaml), структура шагов соответствует D1–D2 design.md.
- [x] 1.2 Добавить маркер `web/.nojekyll` (пустой файл) и убедиться, что `rsync`-шаг воркфлоу переносит его в `site/`. Проверка: файл существует локально; упомянут в шаге копирования (копируется вместе с `web/`).

## 2. README

- [x] 2.1 Написать `README.md` в корне репозитория: что за проект (порт Delphi-игры «Крестики-нолики по ПЗшному» 2006 г. на web), как играть локально (открыть `web/index.html`), **пошаговое включение GitHub Pages** (Settings → Pages → Build and deployment → Source: GitHub Actions → первый запуск воркфлоу), URL игры `https://fatfaldog.github.io/ei-tic-tac-toe/`, как обновляется сайт (push в `main` в `web/`), проверка «тесты не публикуются» (404 на `/tests/engine-tests.html`), упоминание MIT-лицензии. Проверка: все шаги инструкции воспроизводимы по тексту, URL и имена файлов совпадают с реальными.

## 3. Приёмка публикации

- [ ] 3.1 Закоммитить и запушить новые файлы в `origin/main`. Проверка: `git status` чист, коммит виден на GitHub; прогон воркфлоу появился во вкладке Actions.
- [ ] 3.2 После включения пользователем Pages (по README) — прогнать деплой (`workflow_dispatch` при необходимости) и проверить публикацию: `curl -s -o /dev/null -w '%{http_code}' https://fatfaldog.github.io/ei-tic-tac-toe/` → 200; `/tests/engine-tests.html` → 404; страница в браузере играет (партия, настройки, «Об авторе»). Проверка: оба кода ответа и ручная проверка игры пройдены.
