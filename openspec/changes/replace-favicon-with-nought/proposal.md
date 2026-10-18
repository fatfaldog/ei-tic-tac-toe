# Proposal

## Why

Текущая иконка (`web/assets/icon.ico`, 766 байт) — MAINICON из exe, стандартная заглушка Delphi-проекта, не имеющая отношения к игре. Игре нужен узнаваемый значок: нолик — одна из двух меток игры.

## What Changes

- Новая иконка выводится из собственной текстуры нолика игры (`cell-a.jpg`, набор A из exe): вырезается центральная часть с кольцом и конвертируется в favicon (PNG с прозрачностью + .ico для совместимости, 32×32 и 16×16).
- `web/index.html` подключает иконку с учётом предпочтения браузеров (PNG) с откатом на ICO.
- Старый `icon.ico` из поставки удаляется; экстрактор перестаёт его писать (иконка теперь производный ассет, как курсор).

## Capabilities

### New Capabilities
(нет)

### Modified Capabilities
(нет — спеки не описывают favicon; визуальное поведение игры не меняется)

## Impact

- Новый инструмент `tools/make_favicon.py` (sips + stdlib, как `ei_cursor_extract.py`): JPEG → PNG с альфой (вырезание кольца по яркости) → многослойный .ico.
- Правятся: `web/index.html` (ссылки), `tools/extract_assets.py` (не писать MAINICON в поставку; фиксация решения в layout.json), добавляются `web/assets/img/favicon-*.png` и `web/assets/img/favicon.ico`.
- `.openspec.yaml`: `skip_specs: true` (изменение ассетов, требований нет).
