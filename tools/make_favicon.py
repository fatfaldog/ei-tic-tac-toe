#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Favicon из текстуры нолика игры (change replace-favicon-with-nought).

Кроп кольца из web/assets/img/cell-a.jpg (центр ~(50,50)), альфа по
яркости+теплоте (фон текстуры тёмный и холодный, кольцо — светлое тёплое),
масштаб в 32x32 и 16x16 (PNG RGBA) + двухслойный .ico.

Зависимости: macOS sips (масштабирование), остальное — stdlib.
Запуск: python3 tools/make_favicon.py
"""
import os
import struct
import subprocess
import sys
import tempfile
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from png_decode import decode_png  # noqa: E402  (для 32x32 из sips)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'web/assets/img/cell-a.jpg')
OUT = os.path.join(ROOT, 'web/assets/img')

# кроп кольца: центр текстуры (50, 50), квадрат 70x70
CX, CY, HALF = 50, 50, 35


def jpeg_to_pixels(jpeg_path):
    tmp = tempfile.mktemp(suffix='.bmp', dir='/private/var/folders/r9/6bg32d116c774ftfkxq8mnd00000gp/T/opencode')
    r = subprocess.run(['sips', '-s', 'format', 'bmp', jpeg_path, '--out', tmp],
                       capture_output=True)
    if r.returncode != 0:
        raise RuntimeError('sips: ' + r.stderr.decode())
    b = open(tmp, 'rb').read()
    os.unlink(tmp)
    off = struct.unpack_from('<I', b, 10)[0]
    w = struct.unpack_from('<i', b, 18)[0]
    h = struct.unpack_from('<i', b, 22)[0]
    topdown = h < 0
    h = abs(h)
    row = (w * 3 + 3) // 4 * 4
    px = [[(0, 0, 0)] * w for _ in range(h)]
    for i in range(h):
        y = i if topdown else h - 1 - i
        base = off + i * row
        for x in range(w):
            j = base + x * 3
            px[y][x] = (b[j + 2], b[j + 1], b[j])  # RGB
    return px, w, h


def clamp01(v):
    return max(0.0, min(1.0, v))


def crop_alpha(px):
    """Кроп 70x70 с центром кольца + альфа (яркость ИЛИ теплота)."""
    out = []
    for y in range(CY - HALF, CY + HALF):
        row = []
        for x in range(CX - HALF, CX + HALF):
            r, g, b = px[y][x]
            lum = 0.3 * r + 0.6 * g + 0.1 * b
            warm = g - b
            a = max(clamp01((lum - 46) / 34.0),    # яркость: тёмный фон -> 0
                    clamp01((warm - 6) / 10.0))    # теплота: холодный фон -> 0
            row.append((r, g, b, int(a * 255)))
        out.append(row)
    return out


def write_png(path, rows):
    h, w = len(rows), len(rows[0])

    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + \
            struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in rows)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
                           chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    return w, h


def write_ico(path, png32, png16):
    """Многослойный .ico из PNG (Vista+ формат: PNG-слои допустимы)."""
    def entry(size, png, offset):
        return struct.pack('<BBBBHHII', size % 256, 0, 0, 0, 1, 32, len(png), offset)

    header = struct.pack('<HHH', 0, 1, 2)
    body = png32 + png16
    e1 = entry(32, png32, 6 + 16 * 2)
    e2 = entry(16, png16, 6 + 16 * 2 + len(png32))
    open(path, 'wb').write(header + e1 + e2 + body)


def scale(rows, n):
    """Билинейный RGBA-масштаб (по альфе — premultiply для корректности)."""
    h, w = len(rows), len(rows[0])
    out = []
    for y in range(n):
        fy = (y + 0.5) * h / n - 0.5
        y0 = int(fy // 1)
        ty = fy - y0
        y0c = min(max(y0, 0), h - 1)
        y1c = min(max(y0 + 1, 0), h - 1)
        row = []
        for x in range(n):
            fx = (x + 0.5) * w / n - 0.5
            x0 = int(fx // 1)
            tx = fx - x0
            x0c = min(max(x0, 0), w - 1)
            x1c = min(max(x0 + 1, 0), w - 1)
            acc = [0.0] * 8  # r,g,b,a premult + вес
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
            # нормируем premultiplied -> straight
            wsum = acc[4] or 1.0
            asum = acc[3] / wsum
            if asum > 0.001:
                r = min(255, int(acc[0] / wsum / asum))
                g = min(255, int(acc[1] / wsum / asum))
                b = min(255, int(acc[2] / wsum / asum))
                row.append((r, g, b, int(asum * 255)))
            else:
                row.append((0, 0, 0, 0))
        out.append(row)
    return out


def main():
    px, w, h = jpeg_to_pixels(SRC)
    crop = crop_alpha(px)

    rows32 = scale(crop, 32)
    rows16 = scale(crop, 16)

    write_png(os.path.join(OUT, 'favicon-32.png'), rows32)
    write_png(os.path.join(OUT, 'favicon-16.png'), rows16)

    def png_bytes(rows):
        def chunk(tag, data):
            c = tag + data
            return struct.pack('>I', len(data)) + c + \
                struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
        raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in rows)
        ihdr = struct.pack('>IIBBBBB', len(rows[0]), len(rows), 8, 6, 0, 0, 0)
        return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) +
                chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

    write_ico(os.path.join(OUT, 'favicon.ico'), png_bytes(rows32), png_bytes(rows16))

    for f in ('favicon-32.png', 'favicon-16.png', 'favicon.ico'):
        p = os.path.join(OUT, f)
        print(f, os.path.getsize(p), 'байт')

    # контроль: ASCII 32x32 по альфе
    CH = ' .:*#@'
    for row in rows32:
        print(''.join(CH[min(5, p[3] * 6 // 256)] for p in row))


if __name__ == '__main__':
    main()
