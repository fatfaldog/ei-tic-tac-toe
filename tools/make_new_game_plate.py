#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Плита «Новая игра» из скриншота пользователя (references/new_game.png).

Серия та же, что у плиты-заголовка «Об авторе» (make_about_plate.py):
фон белый/чёрный, плита — тёмная тёплая фактура. Отличие источника —
над плитой мелкий огрызок (y[200..202]), поэтому границы берутся не по всему
контенту, а по крупнейшему связному Y-сегменту (y[211..547]).

Альфа: прозрачным становится всё ахроматически-светлое (белое) и всё
чисто-чёрное; фактура плиты остаётся.

Запуск: python3 tools/make_new_game_plate.py
"""
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from png_decode import decode_png  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'references/new_game.png')
DST = os.path.join(ROOT, 'web/assets/img/plate-new-game.png')
TARGET_W = 720   # 2x слота ~340px — retina-чёткость без мегабайтов


def clamp01(v):
    return max(0.0, min(1.0, v))


def is_plate(p):
    r, g, b = p[0], p[1], p[2]
    lum = 0.3 * r + 0.6 * g + 0.1 * b
    if lum > 236 and abs(r - g) < 12 and abs(g - b) < 12:
        return False           # белый фон
    if lum < 16 and abs(r - g) < 10 and abs(g - b) < 10:
        return False           # чёрный фон
    return True


def main_segment_bounds(px, w, h):
    """Границы крупнейшего связного по Y сегмента контента + X-границы в нём."""
    rows = [any(is_plate(px[y][x]) for x in range(0, w, 3)) for y in range(h)]
    segs, s = [], None
    for y in range(h):
        if rows[y] and s is None:
            s = y
        if not rows[y] and s is not None:
            segs.append((s, y - 1))
            s = None
    if s is not None:
        segs.append((s, h - 1))
    segs = [(a, b) for a, b in segs if b - a > 2]   # игнор однопиксельного шума
    top, bottom = max(segs, key=lambda ab: ab[1] - ab[0])
    cols = [any(is_plate(px[y][x]) for y in range(top, bottom + 1, 3))
            for x in range(w)]
    left = cols.index(True)
    right = w - 1 - cols[::-1].index(True)
    return left, top, right, bottom, segs


def scale(rows, n_w):
    """Билинейный RGBA-масштаб (premultiplied для корректной альфы)."""
    h, w = len(rows), len(rows[0])
    n_h = max(1, int(n_w * h / w))
    out = []
    for y in range(n_h):
        fy = (y + 0.5) * h / n_h - 0.5
        y0 = int(fy // 1)
        ty = fy - y0
        y0c = min(max(y0, 0), h - 1)
        y1c = min(max(y0 + 1, 0), h - 1)
        row = []
        for x in range(n_w):
            fx = (x + 0.5) * w / n_w - 0.5
            x0 = int(fx // 1)
            tx = fx - x0
            x0c = min(max(x0, 0), w - 1)
            x1c = min(max(x0 + 1, 0), w - 1)
            acc = [0.0] * 5
            for (yy, wy) in ((y0c, 1 - ty), (y1c, ty)):
                for (xx, wx) in ((x0c, 1 - tx), (x1c, tx)):
                    p = rows[yy][xx]
                    wgt = wy * wx
                    a = p[3] / 255.0
                    acc[0] += p[0] * a * wgt
                    acc[1] += p[1] * a * wgt
                    acc[2] += p[2] * a * wgt
                    acc[3] += a * wgt
                    acc[4] += wgt
            wsum = acc[4] or 1.0
            asum = acc[3] / wsum
            if asum > 0.001:
                row.append((min(255, int(acc[0] / wsum / asum)),
                            min(255, int(acc[1] / wsum / asum)),
                            min(255, int(acc[2] / wsum / asum)),
                            int(asum * 255)))
            else:
                row.append((0, 0, 0, 0))
        out.append(row)
    return out


def main():
    px, w, h = decode_png(SRC)
    left, top, right, bottom, segs = main_segment_bounds(px, w, h)
    print(f'сегменты: {segs}')
    print(f'плита: x[{left}..{right}] y[{top}..{bottom}] '
          f'({right - left + 1}x{bottom - top + 1})')

    rows = []
    for y in range(top, bottom + 1):
        row = []
        for x in range(left, right + 1):
            r, g, b, _ = px[y][x]
            lum = 0.3 * r + 0.6 * g + 0.1 * b
            achroma = max(abs(r - g), abs(g - b))
            # белый -> 0, чёрный -> 0, тёплая фактура -> 1
            a_white = clamp01((246 - lum) / 14.0)
            a_black = clamp01((lum - 14) / 14.0)
            a_warm = clamp01((achroma - 2) / 8.0)
            a = max(a_warm, min(a_white, a_black))
            row.append((r, g, b, int(a * 255)))
        rows.append(row)

    rows = scale(rows, TARGET_W)
    hh, ww = len(rows), len(rows[0])

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + \
            struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in rows)
    ihdr = struct.pack('>IIBBBBB', ww, hh, 8, 6, 0, 0, 0)
    open(DST, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
                          chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    n_vis = sum(1 for row in rows for p in row if p[3] > 128)
    print(f'{DST}: {ww}x{hh}, видимых {100 * n_vis // (ww * hh)}%, '
          f'{os.path.getsize(DST)} байт')

    # ASCII по альфе
    CH = ' .:*#@'
    step_y = max(1, hh // 16)
    step_x = max(1, ww // 96)
    for y in range(0, hh, step_y):
        line = ''
        for x in range(0, ww, step_x):
            a = rows[y][x][3]
            line += CH[min(5, a * 6 // 256)]
        print(line)


if __name__ == '__main__':
    main()
