"""Минимальный PNG-декодер (8-бит, цветовые типы 0/2/3/4/6, без interlace).
Используется только для анализа скриншота курсора; stdlib only."""
import struct
import zlib


def decode_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'не PNG'
    pos = 8
    ihdr = None
    plte = b''
    trns = b''
    idat = b''
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if tag == b'IHDR':
            ihdr = struct.unpack('>IIBBBBB', chunk)
        elif tag == b'PLTE':
            plte = chunk
        elif tag == b'tRNS':
            trns = chunk
        elif tag == b'IDAT':
            idat += chunk
        elif tag == b'IEND':
            break
    w, h, depth, ctype, comp, filt, inter = ihdr
    assert depth == 8 and inter == 0, (depth, inter)
    nch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    stride = w * nch
    raw = zlib.decompress(idat)
    # unfilter
    out = bytearray()
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        for x in range(stride):
            a = line[x - nch] if x >= nch else 0
            b = prev[x]
            c = prev[x - nch] if x >= nch else 0
            if f == 0:
                v = line[x]
            elif f == 1:
                v = (line[x] + a) & 0xFF
            elif f == 2:
                v = (line[x] + b) & 0xFF
            elif f == 3:
                v = (line[x] + (a + b) // 2) & 0xFF
            elif f == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                v = (line[x] + pr) & 0xFF
            else:
                raise ValueError('фильтр ' + str(f))
            line[x] = v
        out += line
        prev = line
    # в (r,g,b,a)
    px = [[(0, 0, 0, 0)] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * nch
            if ctype == 6:
                px[y][x] = tuple(out[i:i + 4])
            elif ctype == 2:
                px[y][x] = (out[i], out[i + 1], out[i + 2], 255)
            elif ctype == 0:
                v = out[i]
                px[y][x] = (v, v, v, 255)
            elif ctype == 4:
                px[y][x] = (out[i], out[i], out[i], out[i + 1])
            elif ctype == 3:
                idx = out[i]
                r, g, b = plte[idx * 3:idx * 3 + 3]
                a = trns[idx] if idx < len(trns) else 255
                px[y][x] = (r, g, b, a)
    return px, w, h


if __name__ == '__main__':
    import sys
    px, w, h = decode_png(sys.argv[1])
    n_opaque = sum(1 for row in px for p in row if p[3] > 0)
    print(f'{w}x{h}, непрозрачных пикселей: {n_opaque}/{w*h}')
