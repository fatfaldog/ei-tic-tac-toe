#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Конвертация текстур меток (JPEG с чёрной подложкой) в PNG с альфа-каналом.

Яркость пикселя становится его прозрачностью: чёрная подложка исчезает,
остаются только светлые штрихи крестика/кольца. Метка перестаёт перекрывать
фон (узорную рамку) своим чёрным ковриком.

Зависимость: macOS `sips` (декод JPEG), остальное — stdlib.
Запуск: python3 tools/mark_alpha.py <вход.jpg> <выход.png>
"""
import os
import struct
import subprocess
import sys
import tempfile
import zlib


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
            px[y][x] = (b[j + 2], b[j + 1], b[j])  # BMP: BGR
    return px, w, h


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


def convert(src, dst, lo=12, k=2.2):
    """Альфа линейно растёт от яркости lo до насыщения (255/k + lo)."""
    px, w, h = jpeg_to_pixels(src)
    rows = []
    n_opaque = 0
    for y in range(h):
        row = []
        for x in range(w):
            r, g, b = px[y][x]
            lum = 0.3 * r + 0.6 * g + 0.1 * b
            a = max(0, min(255, int((lum - lo) * k)))
            if a > 0:
                n_opaque += 1
            row.append((r, g, b, a))
        rows.append(row)
    write_png(dst, rows)
    print(f'{dst}: {w}x{h}, видимых пикселей {n_opaque}/{w * h} '
          f'({100 * n_opaque // (w * h)}%)')


if __name__ == '__main__':
    convert(sys.argv[1], sys.argv[2])
