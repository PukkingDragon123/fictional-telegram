"""Build the whole teahouse asset pack.

    python3 teahouse-assets/generator/build.py            # everything
    python3 teahouse-assets/generator/build.py --quick    # skip GIFs

Outputs go to teahouse-assets/ (layers/, props/, nature/, atlas/, preview/,
palette/, demo/, scene.json). Everything is deterministic (seeded)."""
import json
import math
import os
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)

from pixel import Canvas, RAMPS, PAL, text, FONT          # noqa: E402
import outside                                             # noqa: E402
import room                                                # noqa: E402
import counter                                             # noqa: E402
import fx                                                  # noqa: E402
import trees                                               # noqa: E402
import meadow                                              # noqa: E402
import propkit                                             # noqa: E402
import props_room12                                        # noqa: E402,F401
import props_room34                                        # noqa: E402,F401

F = 8
SCALE_HI = 4
LAYER_ORDER = ['wall', 'ceiling', 'counter_layer', 'floor', 'counter', 'front']


def mkdir(*p):
    d = os.path.join(ROOT, *p)
    os.makedirs(d, exist_ok=True)
    return d


def save(cv, *p, scale=1):
    path = os.path.join(ROOT, *p)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv.save(path, scale)
    return os.path.relpath(path, ROOT)


def sheet(frames, vertical=False):
    w, h = frames[0].w, frames[0].h
    cv = Canvas(w if vertical else w * len(frames), h * len(frames) if vertical else h)
    for i, fr in enumerate(frames):
        cv.blit(fr, 0 if vertical else i * w, i * h if vertical else 0)
    return cv


def as_frames(x):
    return x if isinstance(x, list) else [x]


def blend_alpha(dst, src):
    """Alpha-composite an RGBA overlay (light) onto an opaque canvas."""
    d = dst.a.astype(np.float32)
    s = src.a.astype(np.float32)
    al = s[:, :, 3:4] / 255.0
    d[:, :, :3] = d[:, :, :3] * (1 - al) + s[:, :, :3] * al
    out = dst.copy()
    out.a = np.clip(d, 0, 255).astype(np.uint8)
    return out


# ---------------------------------------------------------------- compose
class Scene:
    def __init__(self):
        t = time.time()
        self.outs = outside.all_layers()
        print(f'  outside layers   {time.time() - t:5.1f}s')
        t = time.time()
        self.shell = room.build_shell()
        counter.floor_shadows(self.shell)
        self.counter = counter.build_counter()
        self.fg = fx.foreground()
        self.light = fx.light()
        print(f'  room shell       {time.time() - t:5.1f}s')
        t = time.time()
        self.props = []
        for p in propkit.PROPS:
            fr = as_frames(p['fn']())
            self.props.append(dict(p, frames=fr, sx=p['x'] - 1, sy=p['y'] - 1))
        print(f'  {len(self.props)} props        {time.time() - t:5.1f}s')

    def outside_at(self, f, cam_x, width=room.W):
        """Outside layers as seen with the camera's left edge at cam_x."""
        cv = Canvas(width, room.H)
        for name, frames, fac in self.outs:
            fr = frames[f % len(frames)]
            origin = int(round(cam_x * (1 - fac)))
            x = origin % outside.OUT_W - outside.OUT_W
            while x < width:
                cv.blit(fr, x, 0)
                x += outside.OUT_W
        return cv

    def props_on(self, layer, f):
        for p in self.props:
            if p['layer'] == layer and p.get('preview', True):
                yield p['frames'][f % len(p['frames'])], p['sx'], p['sy']

    def compose(self, f=0, cams=None, light=True, fg=True):
        """Full 1920 panorama. cams = [(x_from, x_to, cam_x)] chooses which
        camera the parallax outside is rendered for in each x band (one band
        per window, so each window shows its 'centred' view)."""
        cams = cams or [(0, 1200, room.WIN_MAIN['x'] + room.WIN_MAIN['w'] // 2 - 240),
                        (1200, room.W, room.WIN_ROUND['cx'] - 240)]
        cv = Canvas(room.W, room.H)
        for (x0, x1, cam) in cams:
            o = self.outside_at(f, cam)
            cv.a[:, x0:x1] = o.a[:, x0:x1]
        self._interior(cv, f, fg)
        return blend_alpha(cv, self.light) if light else cv

    def _interior(self, cv, f, fg=True):
        cv.blit(self.shell, 0, 0)
        for layer in LAYER_ORDER:
            if layer == 'counter_layer':
                cv.blit(self.counter, 0, 0)
                continue
            for spr, x, y in self.props_on(layer, f):
                cv.blit(spr, x, y)
        if fg:
            cv.blit(self.fg[f % F], 0, 0)

    def view(self, f, cam_x, vw=480, light=True):
        """What the player sees: a vw-wide viewport at cam_x, with true
        parallax for the outside layers."""
        cv = Canvas(room.W, room.H)
        o = self.outside_at(f, cam_x)
        cv.a[:] = o.a
        self._interior(cv, f)
        if light:
            cv = blend_alpha(cv, self.light)
        return cv.crop(int(cam_x), 0, vw, room.H)


# ---------------------------------------------------------------- exports
def export_palette():
    d = mkdir('palette')
    names = list(PAL.keys())
    cols = []
    for ramp, cs in RAMPS.items():
        cols.append((ramp, cs))
    sw = 12
    cv = Canvas(sw * max(len(c) for _, c in cols) + 40, sw * len(cols))
    for r, (ramp, cs) in enumerate(cols):
        for i, c in enumerate(cs):
            cv.rect(40 + i * sw, r * sw, sw, sw, c)
        text(cv, 1, r * sw + 4, ramp[:9], 'white')
    bg = Canvas(cv.w, cv.h, fill='ink')
    bg.blit(cv, 0, 0)
    save(bg, 'palette', 'teahouse_palette.png', scale=3)
    uniq = []
    for _, cs in cols:
        for c in cs:
            if c not in uniq:
                uniq.append(c)
    with open(os.path.join(d, 'teahouse.hex'), 'w') as fh:
        fh.write('\n'.join('%02x%02x%02x' % c for c in uniq) + '\n')
    with open(os.path.join(d, 'teahouse.gpl'), 'w') as fh:
        fh.write('GIMP Palette\nName: Teahouse (bathhouse lacquer)\nColumns: 8\n#\n')
        for ramp, cs in cols:
            for i, c in enumerate(cs):
                fh.write('%3d %3d %3d\t%s%d\n' % (c[0], c[1], c[2], ramp, i))
    return len(uniq)


def export_layers(sc):
    info = []
    for name, frames, fac in sc.outs:
        rec = dict(name=name, file=save(frames[0], 'layers', 'outside', name + '.png'),
                   parallax=fac, tile_width=outside.OUT_W, frames=len(frames))
        if len(frames) > 1:
            rec['sheet'] = save(sheet(frames, vertical=True), 'layers', 'outside', name + '_sheet.png')
            rec['fps'] = 6
        info.append(rec)
    shell = save(sc.shell, 'layers', 'room', '10_room_shell.png')
    furnished = sc.shell.copy()
    for layer in ('wall', 'ceiling'):
        for spr, x, y in sc.props_on(layer, 0):
            furnished.blit(spr, x, y)
    info.append(dict(name='10_room_shell', file=shell, parallax=1.0, frames=1,
                     note='walls, ceiling, floor; window panes are transparent'))
    info.append(dict(name='11_room_shell_furnished', file=save(furnished, 'layers', 'room', '11_room_shell_furnished.png'),
                     parallax=1.0, frames=1, note='shell with every wall/ceiling prop baked in (alternative to 10)'))
    info.append(dict(name='20_counter', file=save(sc.counter, 'layers', 'room', '20_counter.png'),
                     parallax=1.0, frames=1, note='prep table + serving counter; draw customers before this'))
    info.append(dict(name='30_foreground', file=save(sc.fg[0], 'layers', 'room', '30_foreground.png'),
                     sheet=save(sheet(sc.fg, vertical=True), 'layers', 'room', '30_foreground_sheet.png'),
                     parallax=1.12, frames=F, fps=6, note='ivy + corner plants in front of everything'))
    info.append(dict(name='40_light_overlay', file=save(sc.light, 'layers', 'room', '40_light_overlay.png'),
                     parallax=1.0, frames=1, blend='normal (or screen)', note='only layer with partial alpha'))
    return info


def export_props(sc):
    recs = []
    for p in sc.props:
        fr = p['frames']
        base = p['name']
        rec = dict(name=base, room=p['room'], layer=p['layer'], x=p['sx'], y=p['sy'],
                   w=fr[0].w, h=fr[0].h, draggable=p['drag'], desc=p['desc'],
                   placed_by_default=p.get('preview', True),
                   file=save(fr[0], 'props', f'room{p["room"]}', base + '.png'))
        save(fr[0], 'props_4x', f'room{p["room"]}', base + '.png', scale=SCALE_HI)
        if len(fr) > 1:
            rec['frames'] = len(fr)
            rec['fps'] = p['fps'] or 6
            rec['sheet'] = save(sheet(fr), 'props', f'room{p["room"]}', base + '_sheet.png')
            save(sheet(fr), 'props_4x', f'room{p["room"]}', base + '_sheet.png', scale=SCALE_HI)
        recs.append(rec)
    return recs


def export_atlas(sc):
    """Shelf-pack every prop frame into one atlas + JSON (for engines)."""
    items = []
    for p in sc.props:
        for i, fr in enumerate(p['frames']):
            items.append((p['name'], i, fr))
    items.sort(key=lambda it: -it[2].h)
    W = 1024
    x = y = row_h = 0
    pos = []
    for name, i, fr in items:
        if x + fr.w + 1 > W:
            x, y = 0, y + row_h + 1
            row_h = 0
        pos.append((name, i, fr, x, y))
        x += fr.w + 1
        row_h = max(row_h, fr.h)
    H = y + row_h + 1
    atlas = Canvas(W, H)
    frames = {}
    for name, i, fr, x, y in pos:
        atlas.blit(fr, x, y)
        frames.setdefault(name, []).append(dict(i=i, x=x, y=y, w=fr.w, h=fr.h))
    save(atlas, 'atlas', 'props_atlas.png')
    meta = {}
    for p in sc.props:
        fl = sorted(frames[p['name']], key=lambda d: d['i'])
        meta[p['name']] = dict(frames=[{k: d[k] for k in 'xywh'} for d in fl], fps=p['fps'] or (6 if len(fl) > 1 else 0),
                               room=p['room'], layer=p['layer'], scene=[p['sx'], p['sy']],
                               draggable=p['drag'], desc=p['desc'])
    with open(os.path.join(ROOT, 'atlas', 'props_atlas.json'), 'w') as fh:
        json.dump(dict(image='props_atlas.png', size=[W, H], props=meta), fh, indent=1)
    return W, H


def export_nature():
    """Stand-alone animated nature sprites (reuse them anywhere)."""
    recs = []
    builders = [('tree_sakura', trees.tree_sakura), ('tree_black_pine', trees.tree_pine),
                ('tree_red_maple', trees.tree_maple), ('tree_wisteria', trees.tree_wisteria),
                ('tree_willow', trees.tree_willow), ('tree_oak', trees.tree_oak),
                ('tree_tall_bushy', trees.tree_bushy), ('tree_windswept', trees.tree_windswept)]
    tree_frames = []
    for name, fn in builders:
        T = fn()
        fr = T.frames()
        tree_frames.append((name, fr))
        recs.append(dict(name=name, w=T.w, h=T.h, base=list(T.base), frames=F, fps=6,
                         file=save(fr[0], 'nature', 'trees', name + '.png'),
                         sheet=save(sheet(fr), 'nature', 'trees', name + '_sheet.png')))
    import random
    rng = random.Random(77)
    flower_frames = []
    for k in meadow.KINDS:
        fr = meadow.flower_plant(rng, k, h=16)
        flower_frames.append((k, fr))
        recs.append(dict(name='flower_' + k, w=fr[0].w, h=fr[0].h, frames=F, fps=6,
                         sheet=save(sheet(fr), 'nature', 'flowers', 'flower_' + k + '_sheet.png')))
    for i in range(6):
        fr = meadow.tuft(rng, 8 + i * 2, 5 + i)
        recs.append(dict(name=f'grass_tuft_{i}', w=fr[0].w, h=fr[0].h, frames=F, fps=6,
                         sheet=save(sheet(fr), 'nature', 'grass', f'grass_tuft_{i}_sheet.png')))
    fr = meadow.susuki(rng, 30)
    recs.append(dict(name='susuki_pampas', w=fr[0].w, h=fr[0].h, frames=F, fps=6,
                     sheet=save(sheet(fr), 'nature', 'grass', 'susuki_pampas_sheet.png')))
    for k, frs in fx.leaf_particles().items():
        recs.append(dict(name='particle_' + k, w=frs[0].w, h=frs[0].h, frames=len(frs), fps=8,
                         sheet=save(sheet(frs), 'nature', 'particles', 'particle_' + k + '_sheet.png')))
    # contact sheet
    total_w = sum(fr[0].w for _, fr in tree_frames) + 8 * len(tree_frames)
    cv = Canvas(total_w, 200, fill=(126, 160, 186))
    x = 4
    for name, fr in tree_frames:
        cv.blit(fr[0], x, 196 - fr[0].h)
        x += fr[0].w + 8
    save(cv, 'preview', 'trees_sheet.png', scale=2)
    return recs, tree_frames, flower_frames


def label_sheet(sc):
    """Contact sheet of every prop with its name (pixel font)."""
    cells = []
    for p in sc.props:
        fr = p['frames'][0]
        cells.append((p['name'], fr))
    W = 1100
    x = y = 0
    row_h = 0
    pos = []
    for name, fr in cells:
        cw = max(fr.w, len(name) * 4) + 8
        ch = fr.h + 10
        if x + cw > W:
            x, y = 0, y + row_h
            row_h = 0
        pos.append((name, fr, x, y))
        x += cw
        row_h = max(row_h, ch)
    cv = Canvas(W, y + row_h + 4, fill='wood1')
    for name, fr, x, y in pos:
        cv.blit(fr, x + 4, y + 2)
        text(cv, x + 4, y + fr.h + 4, name.replace('_', ' ')[:40], 'paper3')
    save(cv, 'preview', 'props_contact_sheet.png', scale=2)


def export_previews(sc, gifs=True):
    full = sc.compose(0)
    save(full, 'preview', 'teahouse_full_1x.png')
    save(full, 'preview', 'teahouse_full_3x.png', scale=3)
    for i in range(4):
        save(full.crop(i * 480, 0, 480, 270), 'preview', f'room_{i + 1}_4x.png', scale=4)
    bare = sc.compose(0, light=False, fg=False)
    save(bare, 'preview', 'teahouse_no_fx_1x.png')
    if not gifs:
        return
    # window close-up: everything that moves, 8-frame loop
    cam = room.WIN_MAIN['x'] + room.WIN_MAIN['w'] // 2 - 240
    ims = [sc.view(f, cam).image(2) for f in range(F)]
    ims[0].save(os.path.join(ROOT, 'preview', 'room2_window_anim.gif'), save_all=True,
                append_images=ims[1:], duration=150, loop=0, optimize=True)
    cam = 1440
    ims = [sc.view(f, cam).image(2) for f in range(F)]
    ims[0].save(os.path.join(ROOT, 'preview', 'room4_bedroom_anim.gif'), save_all=True,
                append_images=ims[1:], duration=150, loop=0, optimize=True)
    # a slow pan across all four rooms showing the parallax
    # (no light overlay here: palette-exact frames keep the GIF small)
    ims = []
    steps = 44
    for k in range(steps + 1):
        t = k / steps
        cam = int((0.5 - 0.5 * math.cos(math.pi * t)) * (room.W - 480))
        ims.append(sc.view(k % F, cam, light=False).image(2))
    ims = [im.convert('RGB') for im in ims]
    ims[0].save(os.path.join(ROOT, 'preview', 'pan_parallax.webp'), save_all=True,
                append_images=ims[1:] + ims[::-1][1:], duration=90, loop=0, lossless=True, method=4)


def export_scene_json(layer_info, prop_recs, nature_recs, ncolors):
    scene = dict(
        name='Old Rundown Teahouse',
        native_resolution=[room.W, room.H],
        viewport=[480, 270],
        recommended_scale='integer (4x -> 1920x1080), nearest-neighbour filtering',
        rooms=[dict(id=1, name='prep & boiling', x=[0, 480]),
               dict(id=2, name='seating & window', x=[480, 960]),
               dict(id=3, name='tea ritual', x=[960, 1440]),
               dict(id=4, name="traveler's bedroom", x=[1440, 1920])],
        windows=dict(main=room.WIN_MAIN, round=room.WIN_ROUND),
        surfaces=dict(prep_table_top_y=props_room12.TABLE_Y, prep_table_shelf_y=props_room12.UNDER_Y,
                      counter_top_y=props_room12.COUNTER_Y, window_sill_y=props_room12.SILL_Y,
                      wall_shelf_room1_y=props_room12.SHELF_Y, teaware_shelf_room3_y=props_room34.SHELF3_Y,
                      floor_y=room.FLOOR),
        draw_order=['layers/outside/* (parallax, tile horizontally)', '10_room_shell',
                    'props: wall', 'props: ceiling', '<customers>', '20_counter', 'props: floor',
                    'props: counter', 'props: front', '30_foreground', '40_light_overlay'],
        parallax_note='screen_x = -camera_x * parallax (tile outside layers every tile_width px)',
        palette_colors=ncolors,
        layers=layer_info,
        props=prop_recs,
        nature=nature_recs,
    )
    with open(os.path.join(ROOT, 'scene.json'), 'w') as fh:
        json.dump(scene, fh, indent=1)
    d = mkdir('demo')
    with open(os.path.join(d, 'scene.js'), 'w') as fh:
        fh.write('window.SCENE = ' + json.dumps(scene) + ';\n')


def main():
    quick = '--quick' in sys.argv
    t0 = time.time()
    print('building scene...')
    sc = Scene()
    print('exporting...')
    ncol = export_palette()
    layers = export_layers(sc)
    props = export_props(sc)
    export_atlas(sc)
    nat, _, _ = export_nature()
    label_sheet(sc)
    export_previews(sc, gifs=not quick)
    export_scene_json(layers, props, nat, ncol)
    print(f'done in {time.time() - t0:.1f}s -> {ROOT}')


if __name__ == '__main__':
    main()
