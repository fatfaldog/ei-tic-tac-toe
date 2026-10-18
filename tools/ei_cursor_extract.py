#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Вырезание курсора игры «Проклятые Земли» из скриншота пользователя.

Источник: скриншот (148x148 PNG), на котором курсор лежит на чёрном фоне.
Алгоритм: связная область от яркого ядра (яркость > CORE), затем расширение
на смежный тёмный контур (яркость > OUTLINE); всё остальное -> прозрачным.
Выход: RGBA PNG с курсором, обрезанным по bbox, и hot-spot в острие.

Запуск: python3 tools/ei_cursor_extract.py <скриншот.png> <выход.png>
"""
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from png_decode import decode_png  # noqa: E402

CORE = 75      # яркость ядра курсора (клинок/золото)
OUTLINE = 22   # яркость контура (почти чёрный, но не фон)
SCALE = 2      # во сколько раз уменьшить вырезанный курсор (box-фильтр)


def downscale(rows, factor):
    """Box-фильтр с премультипликацией альфы (без ореолов по краям)."""
    h, w = len(rows), len(rows[0])
    nh, nw = h // factor, w // factor
    out = []
    for y in range(nh):
        row = []
        for x in range(nw):
            r = g = b = a_sum = 0.0
            for dy in range(factor):
                for dx in range(factor):
                    pr, pg, pb, pa = rows[y * factor + dy][x * factor + dx]
                    pa /= 255.0
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a_sum += pa
            n = factor * factor
            if a_sum > 0:
                row.append((round(r / a_sum), round(g / a_sum), round(b / a_sum),
                            round(255 * a_sum / n)))
            else:
                row.append((0, 0, 0, 0))
        out.append(row)
    return out


def trim(rows):
    """Обрезает пустые (полностью прозрачные) строки/столбцы."""
    h, w = len(rows), len(rows[0])
    xs = [x for y in range(h) for x in range(w) if rows[y][x][3] > 0]
    ys = [y for y in range(h) for x in range(w) if rows[y][x][3] > 0]
    if not xs:
        return rows
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    return [row[x0:x1 + 1] for row in rows[y0:y1 + 1]]


def lum(p):
    return 0.3 * p[0] + 0.6 * p[1] + 0.1 * p[2]


def extract(src, dst):
    px, w, h = decode_png(src)

    # 1) заливка по яркому ядру (> CORE) от всех ярких затравок
    seeds = [(x, y) for y in range(h) for x in range(w) if lum(px[y][x]) > CORE]
    assert seeds, 'нет ярких пикселей'
    region = set()
    stack = list(seeds)
    while stack:
        x, y = stack.pop()
        if (x, y) in region:
            continue
        if not (0 <= x < w and 0 <= y < h):
            continue
        if lum(px[y][x]) <= CORE:
            continue
        region.add((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]

    # 2) крупнейшая связная яркая компонента = сам курсор
    seen = set()
    comps = []
    for s in region:
        if s in seen:
            continue
        comp = set()
        st = [s]
        while st:
            c = st.pop()
            if c in seen or c not in region:
                continue
            seen.add(c)
            comp.add(c)
            st += [(c[0] + 1, c[1]), (c[0] - 1, c[1]), (c[0], c[1] + 1), (c[0], c[1] - 1)]
        comps.append(comp)
    main = max(comps, key=len)

    # 3) захват тёмного контура: три диляции соседями с яркостью > OUTLINE
    for _ in range(3):
        ring = set()
        for (x, y) in main:
            for n in [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]:
                if n not in main and 0 <= n[0] < w and 0 <= n[1] < h \
                        and lum(px[n[1]][n[0]]) > OUTLINE:
                    ring.add(n)
        main |= ring

    # 4) собрать RGBA во весь кадр, уменьшить и обрезать
    rows = []
    for y in range(h):
        row = []
        for x in range(w):
            if (x, y) in main:
                r, g, b, _ = px[y][x]
                row.append((r, g, b, 255))
            else:
                row.append((0, 0, 0, 0))
        rows.append(row)

    if SCALE > 1:
        rows = downscale(rows, SCALE)
    rows = trim(rows)
    ch, cw = len(rows), len(rows[0])

    # hot-spot: остриё = верхняя строка, в ней самый левый непрозрачный пиксель
    tip_y = min(y for y in range(ch) for x in range(cw) if rows[y][x][3] > 0)
    tip_x = min(x for x in range(cw) if rows[tip_y][x][3] > 0)
    n_px = sum(1 for row in rows for p in row if p[3] > 0)

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + \
            struct.pack('>I', __import__('zlib').crc32(c) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in rows)
    ihdr = struct.pack('>IIBBBBB', cw, ch, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
           chunk(b'IDAT', __import__('zlib').compress(raw, 9)) + chunk(b'IEND', b''))
    open(dst, 'wb').write(png)
    print(f'{dst}: {cw}x{ch}px (масштаб 1/{SCALE}), пикселей курсора {n_px}, '
          f'hot-spot (остриё) = ({tip_x}, {tip_y})')
    # ASCII для контроля
    for y in range(ch):
        line = ''
        for x in range(cw):
            r, g, b, a = rows[y][x]
            if a < 60:
                line += '.'
            else:
                l = lum((r, g, b))
                line += '@' if l < 45 else ('#' if l < 90 else ('+' if l < 150 else '*'))
        print(line)


if __name__ == '__main__':
    extract(sys.argv[1], sys.argv[2])
