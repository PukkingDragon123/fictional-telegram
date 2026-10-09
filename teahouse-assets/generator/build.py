"""Build the whole teahouse asset pack (v3, 640x360 per room).

    python3 teahouse-assets/generator/build.py            # everything
    python3 teahouse-assets/generator/build.py --quick    # skip GIF/WebP previews

Outputs go to teahouse-assets/. Everything is deterministic (seeded)."""
import json
import math
import os
import shutil
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)

from pixel import Canvas, RAMPS, PAL, text                 # noqa: E402
import layout as LY                                        # noqa: E402
import outside                                             # noqa: E402
import room                                                # noqa: E402
import counter                                             # noqa: E402
import fx                                                  # noqa: E402
import trees                                               # noqa: E402
import meadow                                              # noqa: E402
import propkit                                             # noqa: E402
import shadows                                             # noqa: E402
import props_cook                                          # noqa: E402,F401
import props_seating                                       # noqa: E402,F401
import props_ritual                                        # noqa: E402,F401
import props_bedroom                                       # noqa: E402,F401
import cloth_props                                         # noqa: E402,F401
import npc                                                 # noqa: E402,F401

SCALE_HI = 3
LAYER_ORDER = ['wall', 'ceiling', 'counter_layer', 'npc', 'floor', 'counter', 'front']
PREVIEW_FPS = 12
LAYER_FPS = 6
OUTPUT_DIRS = ['layers', 'props', 'props_3x', 'props_4x', 'nature', 'atlas', 'preview', 'palette']


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


def blend_alpha(dst, src):
    d = dst.a.astype(np.float32)
    s = src.a.astype(np.float32)
    al = s[:, :, 3:4] / 255.0
    d[:, :, :3] = d[:, :, :3] * (1 - al) + s[:, :, :3] * al
    out = dst.copy()
    out.a = np.clip(d, 0, 255).astype(np.uint8)
    return out


def frame_at(frames, fps, t):
    return frames[int(t * fps) % len(frames)] if len(frames) > 1 else frames[0]


# ---------------------------------------------------------------- scene
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
        print(f'  room + fx        {time.time() - t:5.1f}s')
        t = time.time()
        self.props = []
        surfaces = [LY.SHELF1_Y, LY.SHELF3_Y, LY.SILL_Y]
        for p in propkit.PROPS:
            out = p['fn']()
            if isinstance(out, dict):
                anims = {}
                dx = 0
                for k, v in out.items():
                    anims[k], dx = shadows.apply(p, v, surfaces)
                frames = next(iter(anims.values()))
            else:
                frames = out if isinstance(out, list) else [out]
                frames, dx = shadows.apply(p, frames, surfaces)
                anims = None
            self.props.append(dict(p, frames=frames, anims=anims, sx=p['x'] - 1 - dx, sy=p['y'] - 1,
                                   fps=p['fps'] or (6 if len(frames) > 1 else 0)))
        print(f'  {len(self.props)} props        {time.time() - t:5.1f}s')

    def outside_at(self, t, cam_x, width=LY.W):
        cv = Canvas(width, LY.H)
        for name, frames, fac in self.outs:
            fr = frame_at(frames, LAYER_FPS, t)
            origin = int(round(cam_x * (1 - fac)))
            x = origin % outside.OUT_W - outside.OUT_W
            while x < width:
                cv.blit(fr, x, 0)
                x += outside.OUT_W
        return cv

    def _interior(self, cv, t, fg=True):
        cv.blit(self.shell, 0, 0)
        for layer in LAYER_ORDER:
            if layer == 'counter_layer':
                cv.blit(self.counter, 0, 0)
                continue
            for p in self.props:
                if p['layer'] == layer and p.get('preview', True):
                    cv.blit(frame_at(p['frames'], p['fps'], t), p['sx'], p['sy'])
        if fg:
            cv.blit(frame_at(self.fg, LAYER_FPS, t), 0, 0)

    def compose(self, t=0.0, light=True, fg=True):
        """Full panorama; each window shows the outside as seen with the
        camera centred on it."""
        cams = [(0, 1600, LY.WIN_MAIN['x'] + LY.WIN_MAIN['w'] // 2 - LY.SW // 2),
                (1600, LY.W, LY.WIN_ROUND['cx'] - LY.SW // 2)]
        cv = Canvas(LY.W, LY.H)
        for (x0, x1, cam) in cams:
            o = self.outside_at(t, cam)
            cv.a[:, x0:x1] = o.a[:, x0:x1]
        self._interior(cv, t, fg)
        return blend_alpha(cv, frame_at(self.light, LAYER_FPS, t)) if light else cv

    def view(self, t, cam_x, light=True):
        cv = Canvas(LY.W, LY.H)
        cv.a[:] = self.outside_at(t, cam_x).a
        self._interior(cv, t)
        if light:
            cv = blend_alpha(cv, frame_at(self.light, LAYER_FPS, t))
        return cv.crop(int(cam_x), 0, LY.SW, LY.H)


# ---------------------------------------------------------------- exports
def export_palette():
    sw = 14
    cols = list(RAMPS.items())
    cv = Canvas(sw * max(len(c) for _, c in cols) + 46, sw * len(cols), fill='ink')
    for r, (ramp, cs) in enumerate(cols):
        for i, c in enumerate(cs):
            cv.rect(46 + i * sw, r * sw, sw, sw, c)
        text(cv, 1, r * sw + 5, ramp[:10], 'white', script='latin')
    save(cv, 'palette', 'teahouse_palette.png', scale=3)
    uniq = []
    for _, cs in cols:
        for c in cs:
            if c not in uniq:
                uniq.append(c)
    d = os.path.join(ROOT, 'palette')
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
            rec['fps'] = LAYER_FPS
        info.append(rec)
    furnished = sc.shell.copy()
    for p in sc.props:
        if p['layer'] in ('wall', 'ceiling') and p.get('preview', True):
            furnished.blit(p['frames'][0], p['sx'], p['sy'])
    info += [
        dict(name='10_room_shell', file=save(sc.shell, 'layers', 'room', '10_room_shell.png'), parallax=1.0, frames=1,
             note='walls, ceiling, floor; window panes are transparent'),
        dict(name='11_room_shell_furnished', file=save(furnished, 'layers', 'room', '11_room_shell_furnished.png'),
             parallax=1.0, frames=1, note='shell with every wall/ceiling prop baked in (frame 0)'),
        dict(name='20_counter', file=save(sc.counter, 'layers', 'room', '20_counter.png'), parallax=1.0, frames=1,
             note='stone furnace + prep table + serving counter; draw NPCs (layer npc) after this'),
        dict(name='30_foreground', file=save(sc.fg[0], 'layers', 'room', '30_foreground.png'),
             sheet=save(sheet(sc.fg, vertical=True), 'layers', 'room', '30_foreground_sheet.png'),
             parallax=1.0, frames=len(sc.fg), fps=LAYER_FPS, note='posts between the rooms, ivy, corner plants'),
        dict(name='40_light_overlay', file=save(sc.light[0], 'layers', 'room', '40_light_overlay.png'),
             sheet=save(sheet(sc.light, vertical=True), 'layers', 'room', '40_light_overlay_sheet.png'),
             parallax=1.0, frames=len(sc.light), fps=LAYER_FPS, blend='normal (or screen)',
             note='only layer with partial alpha; the hearth glow flickers'),
    ]
    return info


def export_props(sc):
    recs = []
    for p in sc.props:
        fr = p['frames']
        base = p['name']
        d = f'room{p["room"]}'
        rec = dict(name=base, room=p['room'], layer=p['layer'], x=p['sx'], y=p['sy'], w=fr[0].w, h=fr[0].h,
                   draggable=p['drag'], desc=p['desc'], placed_by_default=p.get('preview', True),
                   file=save(fr[0], 'props', d, base + '.png'))
        save(fr[0], 'props_3x', d, base + '.png', scale=SCALE_HI)
        if len(fr) > 1:
            rec['frames'] = len(fr)
            rec['fps'] = p['fps']
            rec['sheet'] = save(sheet(fr), 'props', d, base + '_sheet.png')
            save(sheet(fr), 'props_3x', d, base + '_sheet.png', scale=SCALE_HI)
        if p['anims']:
            rec['anims'] = {}
            for an, afr in p['anims'].items():
                rec['anims'][an] = dict(frames=len(afr), fps=p['fps'],
                                        sheet=save(sheet(afr), 'props', d, f'{base}_{an}_sheet.png'))
                save(sheet(afr), 'props_3x', d, f'{base}_{an}_sheet.png', scale=SCALE_HI)
        recs.append(rec)
    return recs


def export_atlas(sc):
    items = []
    for p in sc.props:
        anims = p['anims'] or {'default': p['frames']}
        for an, frs in anims.items():
            for i, fr in enumerate(frs):
                items.append((p['name'], an, i, fr))
    items.sort(key=lambda it: -it[3].h)
    Wd = 2048
    x = y = row_h = 0
    pos = []
    for name, an, i, fr in items:
        if x + fr.w + 1 > Wd:
            x, y, row_h = 0, y + row_h + 1, 0
        pos.append((name, an, i, fr, x, y))
        x += fr.w + 1
        row_h = max(row_h, fr.h)
    Hd = y + row_h + 1
    atlas = Canvas(Wd, Hd)
    rects = {}
    for name, an, i, fr, x, y in pos:
        atlas.blit(fr, x, y)
        rects.setdefault(name, {}).setdefault(an, []).append((i, dict(x=x, y=y, w=fr.w, h=fr.h)))
    save(atlas, 'atlas', 'props_atlas.png')
    meta = {}
    for p in sc.props:
        anims = {an: [r for _, r in sorted(v, key=lambda q: q[0])] for an, v in rects[p['name']].items()}
        meta[p['name']] = dict(anims=anims, fps=p['fps'], room=p['room'], layer=p['layer'],
                               scene=[p['sx'], p['sy']], draggable=p['drag'], desc=p['desc'])
    with open(os.path.join(ROOT, 'atlas', 'props_atlas.json'), 'w') as fh:
        json.dump(dict(image='props_atlas.png', size=[Wd, Hd], props=meta), fh, indent=1)


def export_nature():
    import random
    recs = []
    builders = [('tree_black_pine', lambda: trees.tree_pine(2, k=1.25)),
                ('tree_oak', lambda: trees.tree_oak(4, k=1.5)),
                ('tree_oak_jade', lambda: trees.tree_oak(12, trees.JADE, k=1.2)),
                ('tree_willow', lambda: trees.tree_willow(7, k=1.4)),
                ('tree_windswept_jade', lambda: trees.tree_windswept(6, trees.JADE, k=1.5)),
                ('tree_tall_bushy', lambda: trees.tree_bushy(5, k=1.4)),
                ('tree_tall_bushy_jade', lambda: trees.tree_bushy(9, trees.JADE, k=1.1)),
                ('tree_windswept', lambda: trees.tree_windswept(3, k=1.3))]
    tree_frames = []
    for name, fn in builders:
        T = fn()
        fr = T.frames()
        tree_frames.append((name, fr))
        recs.append(dict(name=name, w=T.w, h=T.h, base=list(T.base), frames=len(fr), fps=LAYER_FPS,
                         file=save(fr[0], 'nature', 'trees', name + '.png'),
                         sheet=save(sheet(fr), 'nature', 'trees', name + '_sheet.png')))
    rng = random.Random(77)
    for k in meadow.KINDS:
        fr = meadow.flower_plant(rng, k, h=18)
        recs.append(dict(name='flower_' + k, w=fr[0].w, h=fr[0].h, frames=len(fr), fps=LAYER_FPS,
                         sheet=save(sheet(fr), 'nature', 'flowers', 'flower_' + k + '_sheet.png')))
    for i in range(6):
        fr = meadow.tuft(rng, 10 + i * 2, 6 + i)
        recs.append(dict(name=f'grass_tuft_{i}', w=fr[0].w, h=fr[0].h, frames=len(fr), fps=LAYER_FPS,
                         sheet=save(sheet(fr), 'nature', 'grass', f'grass_tuft_{i}_sheet.png')))
    fr = meadow.susuki(rng, 34)
    recs.append(dict(name='susuki_pampas', w=fr[0].w, h=fr[0].h, frames=len(fr), fps=LAYER_FPS,
                     sheet=save(sheet(fr), 'nature', 'grass', 'susuki_pampas_sheet.png')))
    for k, frs in fx.leaf_particles().items():
        recs.append(dict(name='particle_' + k, w=frs[0].w, h=frs[0].h, frames=len(frs), fps=8,
                         sheet=save(sheet(frs), 'nature', 'particles', 'particle_' + k + '_sheet.png')))
    total_w = sum(fr[0].w for _, fr in tree_frames) + 8 * len(tree_frames)
    cv = Canvas(total_w, 270, fill=(126, 160, 186))
    x = 4
    for name, fr in tree_frames:
        cv.blit(fr[0], x, 266 - fr[0].h)
        x += fr[0].w + 8
    save(cv, 'preview', 'trees_sheet.png', scale=2)
    return recs


def label_sheet(sc):
    cells = [(p['name'], p['frames'][0]) for p in sc.props]
    W = 1280
    x = y = row_h = 0
    pos = []
    for name, fr in cells:
        cw, ch = max(fr.w, len(name) * 4) + 10, fr.h + 12
        if x + cw > W:
            x, y, row_h = 0, y + row_h, 0
        pos.append((name, fr, x, y))
        x += cw
        row_h = max(row_h, ch)
    cv = Canvas(W, y + row_h + 4, fill='wood1')
    for name, fr, x, y in pos:
        cv.blit(fr, x + 5, y + 2)
        text(cv, x + 5, y + fr.h + 5, name.replace('_', ' ')[:44], 'paper3', script='latin')
    save(cv, 'preview', 'props_contact_sheet.png', scale=2)


def gif(frames, path, ms):
    ims = [f.image(2) for f in frames]
    ims[0].save(os.path.join(ROOT, 'preview', path), save_all=True, append_images=ims[1:], duration=ms, loop=0,
                optimize=True)


def export_previews(sc, anims=True):
    full = sc.compose(0)
    save(full, 'preview', 'teahouse_full_1x.png')
    save(full, 'preview', 'teahouse_full_2x.png', scale=2)
    for i in range(4):
        save(full.crop(i * LY.SW, 0, LY.SW, LY.H), 'preview', f'room_{i + 1}_3x.png', scale=3)
    save(sc.compose(0, light=False, fg=False), 'preview', 'teahouse_no_fx_1x.png')
    # fire spirit talking, close up
    fs = next(p for p in sc.props if p['name'] == 'fire_spirit')
    for an, frs in fs['anims'].items():
        ims = [f.image(5) for f in frs]
        ims[0].save(os.path.join(ROOT, 'preview', f'fire_spirit_{an}.gif'), save_all=True, append_images=ims[1:],
                    duration=90, loop=0)
    pong = next(p for p in sc.props if p['name'] == 'uncle_pong')
    for an, frs in pong['anims'].items():
        ims = [f.image(4) for f in frs]
        ims[0].save(os.path.join(ROOT, 'preview', f'uncle_pong_{an}.gif'), save_all=True, append_images=ims[1:],
                    duration=125, loop=0, disposal=2)
    cells = list(pong['anims'].items())
    w, h = pong['frames'][0].w, pong['frames'][0].h
    sheet_cv = Canvas(w * 3, (h + 12) * 2, fill='hinoki2')
    for i, (an, frs) in enumerate(cells):
        x, y = (i % 3) * w, (i // 3) * (h + 12)
        sheet_cv.blit(frs[4 if an != 'idle' else 0], x, y)
        text(sheet_cv, x + w // 2 - len(an) * 2, y + h + 3, an.upper(), 'wood0', script='latin')
    save(sheet_cv, 'preview', 'uncle_pong_moods.png', scale=3)
    cat = next(p for p in sc.props if p['name'] == 'alien_lucky_cat')
    ims = [f.image(5) for f in cat['frames']]
    ims[0].save(os.path.join(ROOT, 'preview', 'alien_lucky_cat.gif'), save_all=True, append_images=ims[1:],
                duration=110, loop=0)
    if not anims:
        return
    n = 24                                      # 2 s at 12 fps: every loop (8 or 12 frames) closes
    for name, cam in (('room1_cook_anim.gif', 0), ('room2_window_anim.gif', LY.SW), ('room3_ritual_anim.gif', 2 * LY.SW),
                      ('room4_bedroom_anim.gif', 3 * LY.SW)):
        gif([sc.view(k / PREVIEW_FPS, cam) for k in range(n)], name, 1000 // PREVIEW_FPS)
    ims = []
    steps = 60
    for k in range(steps + 1):
        u = k / steps
        cam = int((0.5 - 0.5 * math.cos(math.pi * u)) * (LY.W - LY.SW))
        ims.append(sc.view(k / PREVIEW_FPS, cam, light=False).image(2).convert('RGB'))
    ims[0].save(os.path.join(ROOT, 'preview', 'pan_parallax.webp'), save_all=True,
                append_images=ims[1:] + ims[::-1][1:], duration=80, loop=0, lossless=True, method=4)


def export_scene_json(layer_info, prop_recs, nature_recs, ncolors):
    scene = dict(
        name='Old Rundown Teahouse', version=3,
        native_resolution=[LY.W, LY.H], viewport=[LY.SW, LY.SH],
        recommended_scale='integer (3x -> 1920x1080), nearest-neighbour filtering',
        eye_line_y=LY.EYE_Y,
        rooms=LY.ROOMS,
        windows=dict(main=LY.WIN_MAIN, round=LY.WIN_ROUND),
        surfaces=dict(prep_table_top_y=LY.TABLE_Y, prep_table_shelf_y=LY.TABLE_SHELF_Y, counter_top_y=LY.COUNTER_Y,
                      window_sill_y=LY.SILL_Y, apothecary_chest_top_room1_y=LY.CHEST_TOP_Y, teaware_shelf_room3_y=LY.SHELF3_Y,
                      floor_y=LY.FLOOR, hearth_firebox=counter.FIREBOX),
        draw_order=['layers/outside/* (parallax, tile horizontally)', '10_room_shell', 'props: wall',
                    'props: ceiling', '20_counter', 'props: npc (customers sit behind the counter)', 'props: floor',
                    'props: counter', 'props: front', '30_foreground', '40_light_overlay'],
        perspective=dict(note='each room is a one-point perspective box; vanishing point at the room centre on '
                              'the eye line', back_wall_inset=LY.BX, wall_top_y=LY.WALL_TOP, ceiling_y=LY.CEIL_Y,
                         vanishing_points=[list(LY.vp(i)) for i in range(4)]),
        npc_note='NPC sprites end at the counter back edge (y=%d); slide them along x to seat them' % LY.COUNTER['back'],
        parallax_note='screen_x = -camera_x * parallax (tile outside layers every tile_width px)',
        palette_colors=ncolors, layers=layer_info, props=prop_recs, nature=nature_recs)
    with open(os.path.join(ROOT, 'scene.json'), 'w') as fh:
        json.dump(scene, fh, indent=1)
    os.makedirs(os.path.join(ROOT, 'demo'), exist_ok=True)
    with open(os.path.join(ROOT, 'demo', 'scene.js'), 'w') as fh:
        fh.write('window.SCENE = ' + json.dumps(scene) + ';\n')


def main():
    quick = '--quick' in sys.argv
    t0 = time.time()
    for d in OUTPUT_DIRS:                       # stale files from older builds go
        shutil.rmtree(os.path.join(ROOT, d), ignore_errors=True)
    print('building scene...')
    sc = Scene()
    print('exporting...')
    ncol = export_palette()
    layers = export_layers(sc)
    props = export_props(sc)
    export_atlas(sc)
    nat = export_nature()
    label_sheet(sc)
    export_previews(sc, anims=not quick)
    export_scene_json(layers, props, nat, ncol)
    print(f'done in {time.time() - t0:.1f}s -> {ROOT}')


if __name__ == '__main__':
    main()
