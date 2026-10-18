#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Извлечение ресурсов из old_compiled/Krestiki.exe для web-версии.

Пайплайн (чистый Python stdlib, exe открывается только на чтение):
  PE-заголовки -> секция .rsrc -> ресурсы RCDATA (формы Delphi, бинарный DFM/TPF0)
  -> компоненты и их свойства (координаты, подписи, Picture.Data)
  -> JPEG-ассеты, курсоры .cur, иконка, layout.json.

Идемпотентен: повторный запуск перезаписывает те же файлы тем же содержимым.
Выход: web/assets/  (см. design.md D2, change port-krestiki-to-web).
"""
import json
import os
import struct
import sys
import zlib

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXE = os.path.join(REPO, 'old_compiled', 'Krestiki.exe')
OUT = os.path.join(REPO, 'web', 'assets')

# ---------------------------------------------------------------- PE / .rsrc

class Reader:
    def __init__(self, blob):
        self.b = blob
        self.i = 0

    def byte(self):
        v = self.b[self.i]
        self.i += 1
        return v

    def peek(self):
        return self.b[self.i]

    def read(self, n):
        v = self.b[self.i:self.i + n]
        self.i += n
        return v


def load_resources(blob):
    """Возвращает список (тип, имя, файловое_смещение, размер) ресурсов PE."""
    e_lfanew = struct.unpack_from('<I', blob, 0x3C)[0]
    _sig, _mach, nsec, _ts, _sp, _ns, opt_size, _ch = struct.unpack_from(
        '<IHHIIIHH', blob, e_lfanew)
    opt_off = e_lfanew + 24
    magic = struct.unpack_from('<H', blob, opt_off)[0]
    dd_off = opt_off + (96 if magic == 0x10b else 112)
    res_rva, _res_size = struct.unpack_from('<II', blob, dd_off + 2 * 8)

    secs = []
    for i in range(nsec):
        raw = blob[opt_off + opt_size + i * 40:opt_off + opt_size + i * 40 + 40]
        vsize, vaddr, rsize, roff = struct.unpack_from('<IIII', raw, 8)
        secs.append((vaddr, vsize, roff, rsize))

    def rva2off(rva):
        for vaddr, vsize, roff, rsize in secs:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return roff + (rva - vaddr)
        raise ValueError('rva вне секций: %#x' % rva)

    rs = rva2off(res_rva)

    def read_dir(off):
        n_named, n_id = struct.unpack_from('<HH', blob, off + 12)
        out = []
        for i in range(n_named + n_id):
            name_f, entry = struct.unpack_from('<II', blob, off + 16 + i * 8)
            if name_f & 0x80000000:
                noff = rs + (name_f & 0x7FFFFFFF)
                ln = struct.unpack_from('<H', blob, noff)[0]
                nm = blob[noff + 2:noff + 2 + ln * 2].decode('utf-16-le', 'replace')
            else:
                nm = name_f
            out.append((nm, entry))
        return out

    found = []

    def walk(off, path):
        for nm, entry in read_dir(off):
            if entry & 0x80000000:
                walk(rs + (entry & 0x7FFFFFFF), path + [nm])
            else:
                data_rva, size = struct.unpack_from('<II', blob, rs + entry)
                found.append((path[0], path[1], rva2off(data_rva), size))

    walk(rs, [])
    return found

# ------------------------------------------------------------ бинарный DFM


def dfm_str(r):
    ln = r.byte()
    return r.read(ln)


def dfm_value(r):
    t = r.byte()
    if t == 2:
        return ('int', struct.unpack('<b', r.read(1))[0])
    if t == 3:
        return ('int', struct.unpack('<h', r.read(2))[0])
    if t == 4:
        return ('int', struct.unpack('<i', r.read(4))[0])
    if t == 19:
        r.read(8)
        return ('int64', None)
    if t in (6, 7):
        return ('str', dfm_str(r))
    if t == 12:
        return ('lstr', r.read(struct.unpack('<i', r.read(4))[0]))
    if t == 20:
        return ('utf8', r.read(struct.unpack('<i', r.read(4))[0]))
    if t == 18:
        ln = struct.unpack('<i', r.read(4))[0]
        return ('wstr', r.read(ln * 2))
    if t == 10:
        return ('binary', r.read(struct.unpack('<i', r.read(4))[0]))
    if t == 11:
        elems = []
        while True:
            s = dfm_str(r)
            if not s:
                break
            elems.append(s)
        return ('set', elems)
    if t == 13:
        return ('nil', None)
    if t == 8:
        return ('bool', False)
    if t == 9:
        return ('bool', True)
    if t == 5:
        r.read(10)
        return ('ext', None)
    if t == 15:
        r.read(4)
        return ('single', None)
    if t in (16, 17, 21):
        r.read(8)
        return ('double', None)
    if t == 1:
        items = []
        while r.peek() != 0:
            items.append(dfm_value(r))
        r.byte()
        return ('list', items)
    if t == 14:
        items = []
        while r.peek() != 0:
            items.append(dfm_value(r))
        r.byte()
        return ('collection', items)
    raise ValueError('неизвестный тип DFM %d at %#x' % (t, r.i - 1))


def dfm_object(r):
    if r.peek() >= 0xF0:  # ffInherited/ffChildPos
        flags = r.byte()
        if flags & 2:
            t = r.byte()
            if t == 2:
                r.read(1)
            elif t == 3:
                r.read(2)
            elif t == 4:
                r.read(4)
    cls = dfm_str(r).decode('cp1251', 'replace')
    name = dfm_str(r).decode('cp1251', 'replace')
    props = []
    while r.peek() != 0:
        pn = dfm_str(r).decode('cp1251', 'replace')
        props.append((pn, dfm_value(r)))
    r.byte()
    children = []
    while r.peek() != 0:
        children.append(dfm_object(r))
    if r.i < len(r.b):
        r.byte()
    return {'cls': cls, 'name': name, 'props': props, 'children': children}


def value_text(v):
    """Человекочитаемое значение свойства для layout.json."""
    k, val = v
    if k in ('utf8',):
        return val.decode('utf-8', 'replace')
    if k == 'wstr':
        return val.decode('utf-16-le', 'replace')
    if k in ('str',):
        try:
            return val.decode('cp1251')
        except UnicodeDecodeError:
            return val.decode('cp1251', 'replace')
    if k == 'lstr':
        return '<двоичные данные %d байт>' % len(val)
    if k == 'set':
        return [x.decode('cp1251', 'replace') for x in val]
    if k in ('bool', 'int'):
        return val
    if k == 'list':
        return [value_text(x) for x in val]
    if k == 'collection':
        return [value_text(x) for x in val]
    return None


def plain_props(node):
    """Свойства без бинарных данных (для layout.json)."""
    out = {}
    for pn, v in node['props']:
        if v[0] == 'binary':
            continue
        out[pn] = value_text(v)
    return out

# --------------------------------------------------------------- ассеты


def picture_jpeg(payload):
    """Picture.Data: [len][класс графики][4 байта размера][данные]."""
    ln = payload[0]
    gclass = payload[1:1 + ln].decode('latin-1')
    size = struct.unpack('<i', payload[1 + ln:5 + ln])[0]
    data = payload[5 + ln:]
    if len(data) != size:
        raise ValueError('размер Picture.Data не совпал: %d != %d' % (len(data), size))
    return gclass, data


def group_to_cur(group_data, member_by_id):
    """GROUP_CURSOR/GROUP_ICON + RT_CURSOR/RT_ICON -> файл .cur/.ico.

    Запись в group-ресурсе (GRPICONDIRENTRY) — 14 байт, последний элемент nID (WORD).
    Запись в файле (ICONDIRENTRY) — 16 байт, последний элемент imageOffset (DWORD).
    Для курсоров поля planes/bitCount несут координаты hot-spot (X, Y).

    Особенность исходника: данные RT_CURSOR начинаются с 4-байтового префикса
    Borland/Delphi перед BITMAPINFOHEADER — в файле .cur его быть не должно,
    поэтому префикс срезается (и размер в записи уменьшается на 4).
    """
    _res, typ, count = struct.unpack_from('<HHH', group_data, 0)
    entries = []
    datas = []
    off = 6 + 16 * count
    for i in range(count):
        w, h, cc, r, hx, hy, bsize, rid = struct.unpack_from(
            '<BBBBHHIH', group_data, 6 + i * 14)
        data = member_by_id[rid]
        if typ == 2 and data[:4] != b'\x28\x00\x00\x00' and data[4:8] == b'\x28\x00\x00\x00':
            data = data[4:]
            bsize -= 4
        if h == 0:  # в ICO/cur height=0 означает 256; реальный размер — 32
            h = 32
        entry = struct.pack('<BBBBHHII', w, h, cc, r, hx, hy, bsize, off)
        entries.append(entry)
        datas.append(data)
        off += bsize
    return group_data[:6] + b''.join(entries) + b''.join(datas)


def extract_result_texts(blob):
    """Оригинальные тексты исходов партии: cp1251-литералы PChar в .data
    (найдены по смещению 0x723e4; в первой разведке пропущены — скан обрывался
    по счётчику). Урок: не обрывать скан, фильтровать мусор содержательными
    маркерами; страховка — прямой поиск байтового паттерна ':tease:' (D1).
    Возвращает {playerWon, computerWon, draw, sourceOffset} или None."""
    import re
    found = []
    for m in re.finditer(rb'[ -~\xC0-\xFF\xA8\xB8]{8,}', blob):
        try:
            s = m.group().decode('cp1251')
        except UnicodeDecodeError:
            continue
        low = s.lower()
        if ('выиграл' in low or 'ичья' in low or 'уделал' in low) and \
                sum(1 for c in s if 'а' <= c <= 'я' or 'А' <= c <= 'Я') >= 4:
            found.append((m.start(), s))
    if not found and b':tease:' not in blob:
        return None  # тексты не найдены — пайплайн не падает (design D1)
    uniq = []
    for off, s in found:
        if s not in [u[1] for u in uniq]:
            uniq.append((off, s))
    out = {}
    for off, s in uniq:
        low = s.lower()
        if 'выиграл' in low:
            out['playerWon'] = s
        elif 'уделал' in low:
            out['computerWon'] = s
        elif 'ичья' in low:
            out['draw'] = s
    if len(out) < 3:
        return None
    out['sourceOffset'] = hex(uniq[0][0])
    return out


IMG_NAMES = {    ('TFORM1', 'Image1'): 'main-bg.jpg',
    # наборы клеток: 9 компонентов DFM -> один файл на набор (change
    # dedupe-cell-assets; в оригинале каждая клетка имела собственный TImage
    # с той же картинкой). Остальные компоненты наборов склеиваются ниже.
    ('TFORM1', 'Image2'): 'cell-a.jpg',    # набор A (нолики), Image2..Image10
    ('TFORM1', 'Image11'): 'cell-b.jpg',   # набор B (крестики), Image11..Image19
    ('TSETTINGSW', 'Image1'): 'settings-bg-1.jpg',
    ('TSETTINGSW', 'Image2'): 'settings-bg-2.jpg',
    ('TABOUTAVTOR', 'Image1'): 'about-bg.jpg',
}

# компоненты DFM, склеиваемые в один файл набора (дубликаты по построению)
IMAGE_SETS = {
    'cell-a.jpg': ['Image2', 'Image3', 'Image4', 'Image5', 'Image6',
                   'Image7', 'Image8', 'Image9', 'Image10'],
    'cell-b.jpg': ['Image11', 'Image12', 'Image13', 'Image14', 'Image15',
                   'Image16', 'Image17', 'Image18', 'Image19'],
}


def main():
    blob = open(EXE, 'rb').read()
    res = load_resources(blob)

    by_type = {}
    for rtype, name, off, size in res:
        by_type.setdefault(rtype, []).append((name, off, size))

    os.makedirs(os.path.join(OUT, 'img'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'cursors'), exist_ok=True)

    layout = {'forms': {}, 'images': {}, 'cursors': []}

    # --- формы (RCDATA с TPF0) и картинки из Picture.Data
    forms_raw = {}
    for name, off, size in by_type.get(10, []):
        if not isinstance(name, str):
            continue
        data = blob[off:off + size]
        if not data.startswith(b'TPF0'):
            continue
        forms_raw[name] = data
        r = Reader(data)
        r.read(4)
        tree = dfm_object(r)

        def walk_nodes(node):
            yield node
            for c in node['children']:
                for x in walk_nodes(c):
                    yield x

        for node in walk_nodes(tree):
            for pn, v in node['props']:
                if pn.startswith('Picture') and v[0] == 'binary':
                    gclass, jpg = picture_jpeg(v[1])
                    if gclass != 'TJPEGImage':
                        raise ValueError('неожиданный класс графики %s у %s.%s' %
                                         (gclass, name, node['name']))
                    out_name = IMG_NAMES.get((name, node['name']))
                    if out_name is None:
                        continue
                    path = os.path.join(OUT, 'img', out_name)
                    open(path, 'wb').write(jpg)
                    # инвентарь: файл + склеенные компоненты набора (если набор)
                    entry = {'form': name, 'component': node['name'],
                             'bytes': len(jpg)}
                    members = IMAGE_SETS.get(out_name)
                    if members:
                        entry['set'] = [m for m in members if m != node['name']]
                    layout['images'][out_name] = entry
                    break

        # дерево формы для layout.json
        def to_json(node):
            j = {'cls': node['cls'], 'name': node['name'], 'props': plain_props(node)}
            if node['children']:
                j['children'] = [to_json(c) for c in node['children']]
            return j

        layout['forms'][name] = to_json(tree)

    # --- курсоры exe: в поставку игры НЕ входят (монохромные дубликаты
    # дефолтных курсоров ранних Windows — по решению пользователя);
    # в layout.json оставляем только инвентаризацию с расшифровкой.
    CURSOR_DESCR = {
        32761: 'кисть с вытянутым указательным пальцем',
        32762: 'песочные часы',
        32763: 'стрелочка с кучей листочков под ней',
        32764: 'вертикальный-ресайз',
        32765: 'горизонтальный-ресайз',
        32766: 'стрелочка с одним листочком под ней',
        32767: 'перечёркнутый кружок (действие невозможно)',
    }
    cursor_meta = []
    for name, off, size in by_type.get(12, []):
        group = blob[off:off + size]
        w, h = struct.unpack_from('<BB', group, 6)
        cursor_meta.append({'resource': str(name), 'width': w or 32,
                            'height': h or 32, 'hotspotOriginal': [1, 1],
                            'what': CURSOR_DESCR.get(name, '?'),
                            'shipped': False})
    layout['cursors'] = sorted(cursor_meta, key=lambda c: c['resource'])
    layout['cursors'] = sorted(cursor_meta, key=lambda c: int(c['resource']))

    # --- иконка exe: в поставку НЕ входит (стандартная Delphi-заглушка;
    # favicon игры — производный ассет из текстуры нолика, tools/make_favicon.py,
    # change replace-favicon-with-nought); инвентаризация остаётся
    layout['icon'] = {'resource': 'MAINICON', 'what': 'стандартная Delphi-заглушка',
                      'shipped': False}

    # --- порядок клеток главной формы (Left/Top/Width/Height TImage и TPanel)
    cells = []
    main = layout['forms']['TFORM1']
    for child in main['children']:
        p = child['props']
        if child['cls'] in ('TImage', 'TPanel') and 'Left' in p:
            cells.append({'cls': child['cls'], 'name': child['name'],
                          'rect': [p.get('Left'), p.get('Top'),
                                   p.get('Width'), p.get('Height')]})
    layout['mainCells'] = cells

    # --- оригинальные тексты исходов партии (change restore-original-result-texts)
    layout['resultTexts'] = extract_result_texts(blob)

    json_path = os.path.join(OUT, 'layout.json')
    # Карта состояний клетки -> ассет (исправленная классификация):
    #  пустая клетка = чёрная TPanel (clBtnText, BevelOuter=bvNone, OnClick):
    #    по модели VCL оконная TPanel всегда рисуется НАД TImage, поэтому
    #    изначально видны чёрные панели; при ходе панель скрывалась и
    #    открывала изображение метки под ней;
    #  набор A (93x112, яркое кольцо r=0.2-0.5) = НОЛИК компьютера;
    #  набор B (96x94, симметричные диагональные лучи) = КРЕСТИК игрока.
    # Первоначальная гипотеза «A=пустая плита, B=X, O дорисовывался кодом»
    # опровергнута просмотром: A отрисовывается как нолик.
    layout['cellStateMap'] = {
        'empty': {'asset': None, 'render': 'black-panel',
                  'note': 'чёрная TPanel оригинала (clBtnText, bvNone), ассет не нужен'},
        'cross': {'asset': 'img/cell-b.jpg',
                  'note': 'крестик игрока: все 9 JPEG набора B побайтово одинаковы'},
        'nought': {'asset': 'img/cell-a.jpg',
                   'note': 'нолик компьютера: все 9 JPEG набора A побайтово одинаковы'},
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(layout, f, ensure_ascii=False, indent=1)

    # --- отчёт
    n_img = len([f for f in os.listdir(os.path.join(OUT, 'img')) if f.endswith('.jpg')])
    n_cur_png = len([f for f in os.listdir(os.path.join(OUT, 'cursors'))
                     if f.endswith('.png')])
    print('Формы:', ', '.join(sorted(forms_raw)))
    print('JPEG:', n_img, '(ожидалось 6: фон, клетка-A, клетка-B, фоны настроек x2, об авторе)')
    print('Курсоры в поставке (PNG):', n_cur_png, '(ожидался 1: ei-arrow.png)')
    print('layout.json:', os.path.getsize(json_path), 'байт')
    if n_img != 6 or n_cur_png != 1:
        print('ОШИБКА: количество ассетов не соответствует инвентарю', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
