"""Game-ready sprite zips: the current art only, PNG only (no text files, no GIFs, no readmes).

    python3 teahouse-assets/generator/export_game_assets.py OUT_DIR

Writes OUT_DIR/<n>_<name>.zip, each under 30 MiB:
  1_teahouse_building_and_decor   the teahouse seen from outside (96 frames, two colour looks), the four
                                  rooms' layers, every decor prop at 1x and 3x
  2_characters_creatures          Uncle Pong, the fire spirit, the axolotl-frog, the bell dragon, the
                                  goat-dragon in flight
  3_traveler_kit                  the plush, charm, tea kit, bags and papers, each worn / dirty / repaired
  4_nature_plants                 trees, shrubs, flowers, grass, falling leaves, in both colour looks
  5_tiles_and_textures            seamless 64 px tiles (floors, walls, roof, ground, water, mats, paper)
  6_menu_scroll_and_ui            the wide scrolling menu's planes and the signboard / buttons / cursor
  7_window_views_a, 8_window_views_b   the view through the windows in every season and weather

A sheet's file name carries its geometry, so nothing else is needed to cut it up:
    <name>_<frames>f_<w>x<h>[_<cols>c].png     frames of w x h, laid out left to right (then down, cols per row)
A scroll plane also carries its place:  ..._x<X>_y<Y>_p<parallax*100>.png  (top-left on the 640x360 screen, and
how fast it moves against the camera; tiling planes repeat every 1280 px).
The pack's own colours are `pack_colours/`; the summer-afternoon look the menu uses is `summer_afternoon/`.
The alien lucky cat is left out."""
import json
import os
import shutil
import sys
import zipfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
import golden_palette as G                                  # noqa: E402

G.use('afternoon')
SCENE = json.load(open(os.path.join(ROOT, 'scene.json')))
LEFT_OUT = ('alien_lucky_cat',)
CHARACTERS = ('uncle_pong', 'fire_spirit', 'black_axolotl', 'dragon_')
MiB = 1 << 20


def P(*a):
    return os.path.join(ROOT, *a)


def load(path):
    return np.asarray(Image.open(path).convert('RGBA'))


def save(arr, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr).save(path, optimize=True)


def swapped(arr):
    return G.swap(arr)


def base_of(path):
    """The single-frame file a sheet belongs to: strip _sheet / _strip, then trailing _words until a png exists
    (or the _f0 frame the animated signboard keeps)."""
    d, fn = os.path.split(path)
    stem = fn[:-4]
    for suf in ('_sheet', '_strip'):
        if stem.endswith(suf):
            stem = stem[:-len(suf)]
    parts = stem.split('_')
    while parts:
        for cand in ('.png', '_f0.png'):
            c = os.path.join(d, '_'.join(parts) + cand)
            if os.path.exists(c) and not c.endswith(('_sheet.png', '_strip.png')):
                return c
        parts.pop()
    return None


def count_frames(a, w, h):
    """Cells that hold anything, up to the last one (so a half-empty last row is counted right)."""
    cols, rows = a.shape[1] // w, a.shape[0] // h
    last = 0
    for i in range(cols * rows):
        r, c = divmod(i, cols)
        if (a[r * h:(r + 1) * h, c * w:(c + 1) * w, 3] > 0).any():
            last = i + 1
    return last, cols


def tag(n, w, h, cols):
    return f'_{n}f_{w}x{h}' + (f'_{cols}c' if cols < n else '')


def sheet_name(src, a, scale_w=None):
    """Name for a sheet from the frame size of its base file."""
    b = base_of(src)
    stem = os.path.basename(src)[:-4]
    for suf in ('_sheet', '_strip'):
        if stem.endswith(suf):
            stem = stem[:-len(suf)]
    if b is None:
        return None
    h0, w0 = Image.open(b).size[1], Image.open(b).size[0]
    n, cols = count_frames(a, w0, h0)
    return stem + tag(n, w0, h0, cols) + '.png'


def emit(src, dst_dir, swap=False):
    """Copy one png (a sheet gets its geometry in its name)."""
    a = load(src)
    fn = os.path.basename(src)
    if fn.endswith(('_sheet.png', '_strip.png')):
        if not (a[..., 3] > 0).any():                  # an empty "hidden" state is nothing to draw
            return
        nm = sheet_name(src, a)
        fn = nm or fn
    if swap:
        a = swapped(a)
    save(a, os.path.join(dst_dir, fn))


def emit_dir(src_dir, dst_dir, swap=False, skip=lambda fn: False, rel=False):
    for dp, _, files in os.walk(src_dir):
        for fn in sorted(files):
            if not fn.endswith('.png') or skip(fn):
                continue
            sub = os.path.relpath(dp, src_dir) if rel else ''
            emit(os.path.join(dp, fn), os.path.join(dst_dir, sub), swap)


def is_character(name):
    return name.startswith(CHARACTERS)


def is_left_out(fn):
    return fn.startswith(LEFT_OUT)


def zip_dir(src, out):
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, allowZip64=False) as z:
        for dp, dirs, files in os.walk(src):
            dirs.sort()
            rel = os.path.relpath(dp, src)
            if rel != '.':
                zi = zipfile.ZipInfo(rel.replace(os.sep, '/') + '/')
                zi.external_attr = (0o40755 << 16) | 0x10
                z.writestr(zi, b'')
            for fn in sorted(files):
                zi = zipfile.ZipInfo.from_file(os.path.join(dp, fn), os.path.join(rel, fn).replace('./', '').replace(os.sep, '/'))
                zi.compress_type = zipfile.ZIP_DEFLATED
                zi.external_attr = 0o100644 << 16
                z.writestr(zi, open(os.path.join(dp, fn), 'rb').read())
    mb = os.path.getsize(out) / MiB
    print(f'{os.path.basename(out)}: {mb:.1f} MiB')
    assert mb < 29.5, 'too big to send'


# ------------------------------------------------------------------ the zips
def teahouse_exterior(dst):
    d = P('main_menu_wide', 'teahouse_big')
    m = json.load(open(os.path.join(d, 'teahouse.json')))
    n, w, h, cols = m['frames'], m['w'], m['h'], m['sheet_cols']
    name = 'teahouse' + tag(n, w, h, cols) + '.png'
    sheet = load(os.path.join(d, 'teahouse_sheet.png'))
    f0 = load(os.path.join(d, 'teahouse.png'))
    for look, fn in (('pack_colours', lambda a: a), ('summer_afternoon', swapped)):
        save(fn(sheet), os.path.join(dst, 'teahouse_exterior', look, name))
        save(fn(f0), os.path.join(dst, 'teahouse_exterior', look, f'teahouse_still_{w}x{h}.png'))


def pack_props(dst, characters):
    for scale, folder in ((1, 'props'), (3, 'props_3x')):
        for room in sorted(os.listdir(P(folder))):
            for fn in sorted(os.listdir(P(folder, room))):
                if not fn.endswith('.png') or is_left_out(fn) or is_character(fn) != characters:
                    continue
                emit(P(folder, room, fn), os.path.join(dst, f'{scale}x', room))


def room_layers(dst):
    emit_dir(P('layers', 'room'), os.path.join(dst, 'rooms'))


def zip1(out, tmp):
    d = os.path.join(tmp, '1')
    teahouse_exterior(d)
    room_layers(d)
    pack_props(os.path.join(d, 'decor_props'), characters=False)
    zip_dir(d, os.path.join(out, '1_teahouse_building_and_decor.zip'))


def zip2(out, tmp):
    d = os.path.join(tmp, '2')
    pack_props(os.path.join(d, 'props_characters'), characters=True)
    fl = P('sprites', 'goat_dragon_flight')
    for fn in sorted(os.listdir(fl)):
        if not fn.endswith('_sheet.png'):
            continue
        scale = 3 if '_3x_' in fn or fn.endswith('_3x_sheet.png') else 1
        anim = fn.replace('goat_dragon_', '').replace('_3x', '').replace('_sheet.png', '')
        fr0 = sorted(os.listdir(os.path.join(fl, 'frames_3x' if scale == 3 else 'frames', anim)))
        im0 = Image.open(os.path.join(fl, 'frames_3x' if scale == 3 else 'frames', anim, fr0[0]))
        a = load(os.path.join(fl, fn))
        n, cols = count_frames(a, im0.width, im0.height)
        save(a, os.path.join(d, 'goat_dragon_flight', f'{scale}x', f'goat_dragon_{anim}' + tag(n, im0.width, im0.height, cols) + '.png'))
    zip_dir(d, os.path.join(out, '2_characters_creatures.zip'))


def zip3(out, tmp):
    d = os.path.join(tmp, '3')
    kit = P('traveler_kit')
    for item in sorted(os.listdir(kit)):
        ip = os.path.join(kit, item)
        js = os.path.join(ip, item + '.json')
        if not os.path.isdir(ip) or item == 'viewer' or not os.path.exists(js):
            continue
        rec = json.load(open(js))
        if os.path.exists(os.path.join(ip, item + '.png')):
            emit(os.path.join(ip, item + '.png'), os.path.join(d, item))
        for anim, r in rec.get('animations', {}).items():
            sp = os.path.join(ip, r['sheet'])
            if os.path.exists(sp):
                a = load(sp)
                cols = a.shape[1] // r['frame_w']
                save(a, os.path.join(d, item, f'{item}_{anim}' + tag(r['frames'], r['frame_w'], r['frame_h'], cols) + '.png'))
    zip_dir(d, os.path.join(out, '3_traveler_kit.zip'))


def zip4(out, tmp):
    d = os.path.join(tmp, '4')
    for look, sw in (('pack_colours', False), ('summer_afternoon', True)):
        for n in SCENE['nature']:
            for key in ('file', 'sheet'):
                if n.get(key):
                    emit(P(n[key]), os.path.join(d, look, os.path.dirname(n[key])[len('nature/'):]), sw)
    zip_dir(d, os.path.join(out, '4_nature_plants.zip'))


def zip5(out, tmp):
    import tile_textures as T
    d = os.path.join(tmp, '5')
    for look, sw in (('pack_colours', None), ('summer_afternoon', swapped)):
        T.save_all(os.path.join(d, look), sw)
    T.contact(os.path.join(d, 'tiling_preview_3x3.png'), n=3)
    zip_dir(d, os.path.join(out, '5_tiles_and_textures.zip'))


def zip6(out, tmp):
    d = os.path.join(tmp, '6')
    wide = P('main_menu_wide')
    sc = json.load(open(os.path.join(wide, 'scene.json')))
    for order, name in enumerate(sc['draw_order']):
        m = json.load(open(os.path.join(wide, 'layers', name, name + '.json')))
        a = load(os.path.join(wide, 'layers', name, m['sheet']))
        cols = m['sheet_cols']
        fn = (f'{order:02d}_{name}' + tag(m['frames'], m['w'], m['h'], cols) +
              f"_x{m['x']}_y{m['y']}_p{int(round(m['parallax'] * 100))}.png")
        save(a, os.path.join(d, 'scroll_planes', fn))
    skip = lambda fn: fn == 'buttons_sheet.png' or fn.endswith('_f0.png')
    emit_dir(P('main_menu_wide', 'ui'), os.path.join(d, 'ui', 'summer_afternoon'), skip=skip)
    emit_dir(P('main_menu', 'ui'), os.path.join(d, 'ui', 'pack_colours'),
             skip=lambda fn: skip(fn) or fn.startswith('menu_preview'))
    shutil.copy(P('main_menu_wide', 'preview', 'still_1_3x.png'), os.path.join(d, 'menu_still_1920x1080.png'))
    zip_dir(d, os.path.join(out, '6_menu_scroll_and_ui.zip'))


def window_views(tmp, name, seasons, with_base):
    d = os.path.join(tmp, name)
    if with_base:
        emit_dir(P('layers', 'outside'), os.path.join(d, 'summer', 'outside'))
    for s in seasons:
        sd = P('seasons', s)
        if os.path.isdir(os.path.join(sd, 'layers')):
            emit_dir(os.path.join(sd, 'layers'), os.path.join(d, s), rel=True)
        for folder in ('props', 'props_3x'):
            if os.path.isdir(os.path.join(sd, folder)):
                emit_dir(os.path.join(sd, folder), os.path.join(d, s, folder), rel=True,
                         skip=is_left_out)
    return d


def main(out):
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, '_staging')
    shutil.rmtree(tmp, ignore_errors=True)
    for z in (zip1, zip2, zip3, zip4, zip5, zip6):
        z(out, tmp)
    zip_dir(window_views(tmp, '7', ('spring', 'autumn', 'winter'), True), os.path.join(out, '7_window_views_a.zip'))
    zip_dir(window_views(tmp, '8', ('rain', 'eclipse', 'bloodmoon'), False), os.path.join(out, '8_window_views_b.zip'))
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'game_assets'))
