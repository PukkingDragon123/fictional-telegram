"""Pack the built assets into a clean, game-ready zip.

    python3 teahouse-assets/generator/package.py OUT.zip

Layout of the zip:

    Old_Rundown_Teahouse/
      scene.json              every prop's default spot, layers, draw order (paths match this layout)
      backgrounds/window_view the scrolling view through the windows
      backgrounds/rooms       room shell, counter, foreground posts, light overlay
      props/1x/<room>/        props placed in the scene
      props/1x/extras/<room>/ props you can drag in (not placed by default)
      props/3x/...            the same at 3x
      sprite_atlas/           every prop frame in one png + json
      nature/  palette/  previews/

No readme, demo page, descriptions or labelled sheets: just the art and the scene data.
"""
import json
import os
import shutil
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP = 'Old_Rundown_Teahouse'
ROOMS = {1: '1_cook_room', 2: '2_seating_room', 3: '3_tea_room', 4: '4_bedroom'}
ROOM_LAYERS = {'10_room_shell': 'room_shell', '11_room_shell_furnished': 'room_shell_with_wall_props',
               '20_counter': 'counter_furnace_table', '30_foreground': 'foreground_posts',
               '40_light_overlay': 'light_overlay'}
SKIP_PREVIEWS = ('uncle_pong', 'teahouse_no_fx', 'props_contact_sheet', 'wyvern_process', 'trees_sheet')



def _zip(tmp, out):
    """Plain zip that every unzipper opens, phones included: deflate only,
    ASCII names, an entry for every folder, sensible permissions."""
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, allowZip64=False) as z:
        for dp, dirs, files in os.walk(tmp):
            dirs.sort()
            rel = os.path.relpath(dp, tmp)
            if rel != '.':
                zi = zipfile.ZipInfo(rel.replace(os.sep, '/') + '/')
                zi.external_attr = (0o40755 << 16) | 0x10
                z.writestr(zi, '')
            for f in sorted(files):
                full = os.path.join(dp, f)
                zi = zipfile.ZipInfo.from_file(full, os.path.relpath(full, tmp).replace(os.sep, '/'))
                zi.compress_type = zipfile.ZIP_DEFLATED
                zi.external_attr = 0o644 << 16
                with open(full, 'rb') as fh:
                    z.writestr(zi, fh.read())


def main(out):
    scene = json.load(open(os.path.join(ROOT, 'scene.json')))
    tmp = tempfile.mkdtemp()
    base = os.path.join(tmp, TOP)
    moves = {}

    def put(src_rel, dst_rel):
        src = os.path.join(ROOT, src_rel)
        if not os.path.exists(src):
            return None
        dst = os.path.join(base, dst_rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        moves[src_rel] = dst_rel
        return dst_rel

    # backgrounds
    for L in scene['layers']:
        for key in ('file', 'sheet'):
            if key not in L:
                continue
            src = L[key]
            name = os.path.basename(src)
            if src.startswith('layers/outside/'):
                L[key] = put(src, 'backgrounds/window_view/' + name)
            else:
                stem = name.replace('_sheet.png', '').replace('.png', '')
                nice = ROOM_LAYERS.get(stem, stem)
                L[key] = put(src, 'backgrounds/rooms/' + nice + ('_sheet.png' if name.endswith('_sheet.png') else '.png'))
    # props, placed and extras, at 1x and 3x
    for p in scene['props']:
        room = ROOMS.get(p['room'], 'room%d' % p['room'])
        sub = room if p.get('placed_by_default', True) else 'extras/' + room
        for key, val in list(p.items()):
            if isinstance(val, str) and val.startswith('props/'):
                name = os.path.basename(val)
                p[key] = put(val, 'props/1x/%s/%s' % (sub, name))
                put(val.replace('props/', 'props_3x/', 1), 'props/3x/%s/%s' % (sub, name))
            elif key == 'anims' and isinstance(val, dict):
                for an in val.values():
                    for k2, v2 in list(an.items()):
                        if isinstance(v2, str) and v2.startswith('props/'):
                            name = os.path.basename(v2)
                            an[k2] = put(v2, 'props/1x/%s/%s' % (sub, name))
                            put(v2.replace('props/', 'props_3x/', 1), 'props/3x/%s/%s' % (sub, name))
    # loose files that are not in scene.json (extra sheets) follow their prop's folder
    for room_dir in sorted(os.listdir(os.path.join(ROOT, 'props'))):
        for name in sorted(os.listdir(os.path.join(ROOT, 'props', room_dir))):
            rel = 'props/%s/%s' % (room_dir, name)
            if rel in moves:
                continue
            ri = int(room_dir.replace('room', ''))
            stem = name.split('_sheet')[0].replace('.png', '')
            owner = next((p for p in scene['props'] if p['room'] == ri and stem.startswith(p['name'])), None)
            placed = owner.get('placed_by_default', True) if owner else False
            sub = ROOMS[ri] if placed else 'extras/' + ROOMS[ri]
            put(rel, 'props/1x/%s/%s' % (sub, name))
            put(rel.replace('props/', 'props_3x/', 1), 'props/3x/%s/%s' % (sub, name))
    # nature, atlas, palette, previews
    for n in scene.get('nature', []):
        for key in ('file', 'sheet'):
            if key in n:
                n[key] = put(n[key], n[key])
    for folder, dest in (('nature', 'nature'), ('palette', 'palette'), ('atlas', 'sprite_atlas')):
        for dp, _, files in os.walk(os.path.join(ROOT, folder)):
            for f in files:
                rel = os.path.relpath(os.path.join(dp, f), ROOT)
                if rel not in moves:
                    put(rel, dest + rel[len(folder):])
    for f in sorted(os.listdir(os.path.join(ROOT, 'preview'))):
        if not f.startswith(SKIP_PREVIEWS):
            put('preview/' + f, 'previews/' + f)
    # scene data only: positions, sizes, layers, frames - no descriptions or notes
    for key in [k for k in scene if k.endswith('_note') or k in ('perspective', 'recommended_scale')]:
        del scene[key]
    for p in scene['props']:
        p.pop('desc', None)
    for L in scene['layers']:
        L.pop('note', None)
    with open(os.path.join(base, 'scene.json'), 'w') as fh:
        json.dump(scene, fh, indent=1)
    _zip(tmp, out)
    lite = out.replace('.zip', '_mobile.zip')
    # phone-friendly copy: 1x art, backgrounds, scene and the still previews only (no 3x, no gifs, no demo)
    for d in ('props/3x', 'sprite_atlas'):
        shutil.rmtree(os.path.join(base, d), ignore_errors=True)
    for f in os.listdir(os.path.join(base, 'previews')):
        if not f.endswith('.png') or f.startswith(('props_contact', 'teahouse_full_1x', 'trees_sheet')):
            os.remove(os.path.join(base, 'previews', f))
    _zip(tmp, lite)
    print('wrote', lite)
    shutil.rmtree(tmp)
    print('wrote', out)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'Old_Rundown_Teahouse.zip'))
