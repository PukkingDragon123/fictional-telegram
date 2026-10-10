"""Pack the built assets into a clean, game-ready zip.

    python3 teahouse-assets/generator/package.py OUT.zip

Layout of the zip:

    Old_Rundown_Teahouse/
      README.txt
      scene.json              every prop's default spot, layers, draw order (paths match this layout)
      backgrounds/window_view the scrolling view through the windows
      backgrounds/rooms       room shell, counter, foreground posts, light overlay
      props/1x/<room>/        props placed in the scene
      props/1x/extras/<room>/ props you can drag in (not placed by default)
      props/3x/...            the same at 3x
      sprite_atlas/           every prop frame in one png + json
      nature/  palette/  previews/  demo/
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
SKIP_PREVIEWS = ('uncle_pong', 'teahouse_no_fx')

README = """OLD RUNDOWN TEAHOUSE - pixel art pack
=====================================

Four rooms of an old teahouse seen from inside, plus everything in them as
separate drag-and-drop props.

  1 cook room       stone furnace with a live fire spirit, recipe board,
                    apothecary chest, prep table
  2 seating room    lattice window onto the garden, lanterns, clock
  3 tea room        empty corkboard, bell-shaped window,
                    brass bell, lucky cat. Ring the bell and the old rock
                    wyvern comes up to the window.
  4 bedroom         silk bed, desk, bookcase, moon window

Size: each room is 640x360 (the whole strip is 2560x360). Scale up by whole
numbers with nearest-neighbour: 3x = 1920x1080. A 3x copy of every prop is in
props/3x.


Putting a room together (back to front)
---------------------------------------
  1. backgrounds/window_view/00..05, each scrolled at its own speed
     (the "parallax" value in scene.json) and repeated every 1280 px
  2. props on layer "outside" (the wyvern)
  3. backgrounds/rooms/room_shell.png
  4. props on layer "wall", then "ceiling"
  5. backgrounds/rooms/counter_furnace_table.png
  6. props on layer "npc", then "floor", "counter", "front"
  7. backgrounds/rooms/foreground_posts.png
  8. backgrounds/rooms/light_overlay.png

scene.json has the x/y of every prop (top-left, in scene pixels), the layer it
goes on, its frame count and fps, and the surfaces things stand on.


Animated props
--------------
Anything that moves has a *_sheet.png next to it: frames side by side, all
the same size. Props with more than one animation (the fire spirit, the bell,
the wyvern) have one sheet per animation, e.g. dragon_peek_peek_sheet.png and
dragon_peek_rest_sheet.png.

The bell is clickable in scene.json ("on_click"): play the bell's "ring" and
the wyvern's "peek" once. Use the wyvern's "rest" loop if you want it to stay.


Extras
------
props/1x/extras holds things that are drawn but not placed in the scene: the
tea set and cups, tea jars, the towel and tea runner, the kettle and pot, the
wind chime, notes for the corkboard, bedroom clutter, and Uncle Pong.


Also in here
------------
  sprite_atlas/   all prop frames packed into one image + json
  nature/         loose trees, flowers, grass, falling leaves
  palette/        the colours (.gpl for Aseprite/GIMP, .hex)
  previews/       each room at 1920x1080, animated gifs, the wyvern drawing
                  process, a labelled sheet of every prop
  demo/           open demo/index.html in a browser to drag things around
"""


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
    # scene + demo
    with open(os.path.join(base, 'scene.json'), 'w') as fh:
        json.dump(scene, fh, indent=1)
    os.makedirs(os.path.join(base, 'demo'), exist_ok=True)
    shutil.copy2(os.path.join(ROOT, 'demo', 'index.html'), os.path.join(base, 'demo', 'index.html'))
    with open(os.path.join(base, 'demo', 'scene.js'), 'w') as fh:
        fh.write('window.SCENE = ' + json.dumps(scene) + ';\n')
    with open(os.path.join(base, 'README.txt'), 'w') as fh:
        fh.write(README)
    _zip(tmp, out)
    lite = out.replace('.zip', '_mobile.zip')
    # phone-friendly copy: 1x art, backgrounds, scene and the still previews only (no 3x, no gifs, no demo)
    for d in ('props/3x', 'demo', 'sprite_atlas'):
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
