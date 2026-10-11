"""How it was drawn: layered files and timelapses of the work, the way a
digital painter works in a layers app.

    python3 teahouse-assets/generator/artist_process.py OUT_DIR

For the goat-dragon and for each room this writes
  - a layered .psd (opens in Procreate, Photoshop, Krita, GIMP...): rough
    layers kept but hidden, the way an artist leaves them, the finished art
    split into its working layers
  - a timelapse .gif of the piece being made, with the canvas and a layers
    panel: strokes going down one by one, and the human parts of the job -
    a stroke erased and drawn again, an undo, an idea sketched and hidden,
    a colour filled then changed, a part moved, a prop added then deleted,
    flipping the canvas to check, layers faded down and switched off

Not part of the build or the asset zip."""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np                                      # noqa: E402
from PIL import Image, ImageDraw, ImageFont             # noqa: E402
from pixel import Canvas, PAL                            # noqa: E402

UI_BG = (38, 38, 42)
PANEL = (52, 52, 58)
ROW = (64, 64, 72)
ACTIVE = (46, 110, 196)
TEXT = (220, 220, 226)
DIM = (140, 140, 150)
FONT = ImageFont.load_default()


# ---------------------------------------------------------------- the document
class Doc:
    def __init__(self, w, h, paper):
        self.w, self.h = w, h
        self.layers = []
        self.active = 0
        self.add('Paper', fill=paper)
        self.flip = False

    def add(self, name, img=None, fill=None, opacity=1.0, visible=True, hidden_in_file=False):
        a = np.zeros((self.h, self.w, 4), np.uint8) if img is None else img.copy()
        if fill is not None:
            a[..., :3] = fill
            a[..., 3] = 255
        self.layers.append(dict(name=name, a=a, opacity=opacity, visible=visible, hidden_in_file=hidden_in_file))
        self.active = len(self.layers) - 1
        return self.layers[-1]

    def get(self, name):
        for i, L in enumerate(self.layers):
            if L['name'] == name:
                return L
        raise KeyError(name)

    def select(self, name):
        for i, L in enumerate(self.layers):
            if L['name'] == name:
                self.active = i

    def remove(self, name):
        self.layers = [L for L in self.layers if L['name'] != name]
        self.active = min(self.active, len(self.layers) - 1)

    def composite(self):
        out = np.zeros((self.h, self.w, 3), float)
        for L in self.layers:
            if not L['visible']:
                continue
            al = L['a'][..., 3:4].astype(float) / 255.0 * L['opacity']
            out = out * (1 - al) + L['a'][..., :3].astype(float) * al
        img = out.clip(0, 255).astype(np.uint8)
        return img[:, ::-1] if self.flip else img


def _rgb(name):
    return PAL[name] if isinstance(name, str) else name


def put_mask(L, m, color, alpha=255):
    L['a'][m, :3] = _rgb(color)
    L['a'][m, 3] = alpha


def put_from(L, src, m):
    L['a'][m] = src[m]


def erase(L, m):
    L['a'][m] = 0


# ---------------------------------------------------------------- the recorder (canvas + layers panel)
class Recorder:
    def __init__(self, doc, scale, title, panel_w=210):
        self.doc, self.s, self.title, self.pw = doc, scale, title, panel_w
        self.frames = []
        self.durations = []

    def snap(self, action='', cursor=None, tool='brush', color=None, hold=1, ms=110):
        d = self.doc
        cw, ch = d.w * self.s, d.h * self.s
        W, H = cw + self.pw + 24, ch + 52
        img = Image.new('RGB', (W, H), UI_BG)
        dr = ImageDraw.Draw(img)
        # top bar: title, tool, colour
        dr.rectangle([0, 0, W, 26], fill=(30, 30, 33))
        dr.text((10, 7), self.title, fill=TEXT, font=FONT)
        tx = W - self.pw - 10
        for k, t in enumerate(('brush', 'smudge', 'eraser', 'fill', 'move')):
            x = tx - (5 - k) * 46
            dr.rectangle([x, 5, x + 40, 21], fill=ACTIVE if t == tool else ROW)
            dr.text((x + 4, 8), t, fill=TEXT, font=FONT)
        if color is not None:
            dr.ellipse([W - 34, 4, W - 14, 22], fill=tuple(_rgb(color)), outline=TEXT)
        # canvas
        comp = Image.fromarray(d.composite()).resize((cw, ch), Image.NEAREST)
        img.paste(comp, (12, 38))
        dr.rectangle([11, 37, 12 + cw, 38 + ch], outline=(20, 20, 22))
        if cursor is not None:
            cx, cy = cursor
            if d.flip:
                cx = d.w - cx
            px, py = 12 + cx * self.s, 38 + cy * self.s
            r = 3 * self.s if tool != 'eraser' else 5 * self.s
            dr.ellipse([px - r, py - r, px + r, py + r], outline=(255, 255, 255))
            dr.ellipse([px - r - 1, py - r - 1, px + r + 1, py + r + 1], outline=(0, 0, 0))
        if action:
            dr.rectangle([16, 42, 22 + 7 * len(action), 58], fill=(20, 20, 22))
            dr.text((20, 45), action, fill=(255, 220, 120), font=FONT)
        if d.flip:
            dr.text((12 + cw - 90, 45), 'flipped', fill=(255, 140, 140), font=FONT)
        # layers panel (top of the stack first, as in a layers app)
        x0 = 24 + cw
        dr.rectangle([x0, 38, x0 + self.pw - 4, 38 + ch], fill=PANEL)
        dr.text((x0 + 8, 42), 'Layers', fill=TEXT, font=FONT)
        rows = list(enumerate(d.layers))[::-1]
        rh = 30
        max_rows = (ch - 30) // rh
        if len(rows) > max_rows:                                # keep the active layer in view
            ai = [k for k, (i, _) in enumerate(rows) if i == d.active]
            start = max(0, min(len(rows) - max_rows, (ai[0] if ai else 0) - max_rows // 2))
            rows = rows[start:start + max_rows]
        for k, (i, L) in enumerate(rows):
            y = 60 + k * rh
            dr.rectangle([x0 + 4, y, x0 + self.pw - 8, y + rh - 3], fill=ACTIVE if i == d.active else ROW)
            th = Image.fromarray(L['a']).resize((36, 24), Image.NEAREST)
            chk = Image.new('RGB', (36, 24), (200, 200, 200))
            cd = ImageDraw.Draw(chk)
            for yy in range(0, 24, 6):
                for xx in range(0, 36, 6):
                    if (xx // 6 + yy // 6) % 2:
                        cd.rectangle([xx, yy, xx + 5, yy + 5], fill=(240, 240, 240))
            chk.paste(th, (0, 0), th)
            img.paste(chk, (x0 + 8, y + 2))
            nm = L['name'] if len(L['name']) < 20 else L['name'][:19] + '.'
            dr.text((x0 + 50, y + 4), nm, fill=TEXT if L['visible'] else DIM, font=FONT)
            if L['opacity'] < 0.99:
                dr.text((x0 + 50, y + 15), '%d%%' % int(L['opacity'] * 100), fill=DIM, font=FONT)
            bx = x0 + self.pw - 26
            dr.rectangle([bx, y + 8, bx + 12, y + 20], outline=TEXT, fill=ACTIVE if L['visible'] else ROW)
            if L['visible']:
                dr.line([bx + 2, y + 14, bx + 5, y + 18, bx + 10, y + 10], fill=TEXT)
        for _ in range(hold):
            self.frames.append(img)
            self.durations.append(ms)

    def save_gif(self, path):
        # one shared palette over the frames, no dithering
        picks = self.frames[::max(1, len(self.frames) // 10)]
        strip = Image.new('RGB', (picks[0].width, picks[0].height * len(picks)))
        for i, f in enumerate(picks):
            strip.paste(f, (0, i * f.height))
        pal = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in self.frames]
        q[0].save(path, save_all=True, append_images=q[1:], duration=self.durations, loop=0, optimize=True)


def save_psd(doc, path, scale):
    from psd_tools import PSDImage
    from psd_tools.api.layers import PixelLayer
    W, H = doc.w * scale, doc.h * scale
    psd = PSDImage.new('RGBA', (W, H))
    for L in doc.layers:
        im = Image.fromarray(L['a']).resize((W, H), Image.NEAREST)
        lay = PixelLayer.frompil(im, psd, L['name'], 0, 0)
        lay.opacity = int(round(255 * L['opacity']))
        lay.visible = bool(L['visible']) and not L.get('hidden_in_file')
        psd.append(lay)
    psd.save(path)


# ---------------------------------------------------------------- strokes, the way a hand puts them down
def wobbly_line(w, h, pts, rng, wob=0.8, width=1):
    """A hand-drawn stroke through pts: it bows a little and overshoots."""
    im = Image.new('L', (w, h), 0)
    dense = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0)))
        for k in range(n):
            t = k / n
            dense.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    dense.append(pts[-1])
    ph = rng.uniform(0, 6)
    out = [(x + wob * math.sin(i * 0.15 + ph), y + wob * math.cos(i * 0.12 + ph)) for i, (x, y) in enumerate(dense)]
    ImageDraw.Draw(im).line(out, fill=1, width=width)
    return np.array(im, bool), out


def tip(m):
    ys, xs = np.nonzero(m)
    if not len(ys):
        return None
    i = np.argmax(xs + ys * 0.3)
    return (xs[i], ys[i])


def centre(m):
    ys, xs = np.nonzero(m)
    return (xs.mean(), ys.mean()) if len(ys) else None


def chunks(m, n, key='x', rng=None):
    """Split a mask into n pieces in drawing order (a sweep or patches)."""
    ys, xs = np.nonzero(m)
    if not len(ys):
        return []
    if key == 'x':
        order = xs + ys * 0.15
    elif key == 'light':
        order = xs + ys
    else:
        # big loose brush passes: a smooth blobby field plus a slow left-to-right drift,
        # so each step covers a few soft-edged areas rather than a regular pattern
        rs = rng if rng is not None else np.random.RandomState(0)
        H, W = m.shape
        cell = 36
        gh, gw = H // cell + 2, W // cell + 2
        g = rs.rand(gh, gw)
        fy, fx = ys / cell, xs / cell
        y0, x0 = fy.astype(int), fx.astype(int)
        ty, tx = fy - y0, fx - x0
        ty, tx = ty * ty * (3 - 2 * ty), tx * tx * (3 - 2 * tx)
        field = (g[y0, x0] * (1 - tx) * (1 - ty) + g[y0, x0 + 1] * tx * (1 - ty)
                 + g[y0 + 1, x0] * (1 - tx) * ty + g[y0 + 1, x0 + 1] * tx * ty)
        order = field + 0.9 * xs / W + rs.rand(len(xs)) * 0.04
    idx = np.argsort(order)
    out = []
    for k in range(n):
        part = idx[k * len(idx) // n:(k + 1) * len(idx) // n]
        mm = np.zeros_like(m)
        mm[ys[part], xs[part]] = True
        out.append(mm)
    return out


# ---------------------------------------------------------------- the goat-dragon
def goat(out_dir):
    import wyvern as V
    rng = random.Random(7)
    s = V._state(lid=0.5, look=-1)
    s['oy'] = 0
    V.set_pose(0.0)
    P = V.draw(s, stages=True)
    a = P['a']
    fin = P['final'].copy()
    V.jewelry(a, fin)
    w, h = V.W, V.H
    # an earlier idea: the same head held flat, like the first wyvern
    V.ANG = math.radians(-18)
    V.POLL = (66.0, 56.0)
    P_old = V.draw(dict(s), stages=True)
    V.set_pose(0.0)

    def arr(cv):
        return cv.a.copy()
    flats, render, tex, final = arr(P['flats']), arr(P['render']), arr(P['texture']), arr(fin)
    solid = flats[..., 3] > 0

    def differs(x, y):
        return (x[..., 3] > 0) & ((x[..., :3].astype(int) - y[..., :3].astype(int)) != 0).any(-1)
    lum = lambda x: x[..., :3].astype(int).sum(-1)
    shadow_m = differs(render, flats) & (lum(render) < lum(flats))
    light_m = differs(render, flats) & (lum(render) >= lum(flats))
    tex_m = differs(tex, render)
    fin_m = differs(final, tex) | ((final[..., 3] > 0) & (tex[..., 3] == 0))

    doc = Doc(w, h, PAL['paper4'])
    rec = Recorder(doc, 4, 'goat-dragon  -  140 x 192')
    rec.snap('new canvas', hold=4)
    # 1 gesture, with a horn stroke drawn wrong, erased and drawn again
    G = doc.add('Gesture')
    rec.snap('new layer', hold=2)
    for k, m in enumerate(P['gesture']):
        put_mask(G, m, 'haze1')
        rec.snap('gesture', tip(m), 'brush', 'haze1')
        if k == 3:
            bad, _ = wobbly_line(w, h, [(58, 64), (60, 34), (82, 26), (100, 36)], rng, 1.2)
            put_mask(G, bad, 'haze1')
            rec.snap('gesture', (100, 36), 'brush', 'haze1', hold=3)
            for part in chunks(bad, 3):
                erase(G, part)
                rec.snap('erase', centre(part), 'eraser')
            rec.snap('', hold=2)
    rec.snap('', hold=3)
    # 2 construction: the head axis first laid flat, then at its real angle
    C = doc.add('Construction')
    bad, _ = wobbly_line(w, h, [(8, 100), (60, 96), (118, 92)], rng, 0.5)
    put_mask(C, bad, 'haze2')
    rec.snap('construction', (118, 92), 'brush', 'haze2', hold=3)
    erase(C, bad)
    rec.snap('undo', hold=2)
    for k, m in enumerate(P['construction']):
        put_mask(C, m, 'haze2')
        if k % 2 == 1:
            rec.snap('construction', tip(m), 'brush', 'haze2')
    G['opacity'] = 0.45
    rec.snap('layer opacity', hold=2)
    # 3 an idea sketched and hidden
    O_ = doc.add('Sketch - first idea')
    for k, m in enumerate(P_old['sketch'][::2]):
        put_mask(O_, m, 'stone2')
        if k % 6 == 5:
            rec.snap('sketch', tip(m), 'brush', 'stone2')
    rec.snap('', hold=5)
    O_['visible'] = False
    O_['hidden_in_file'] = True
    rec.snap('hide layer', hold=4)
    C['opacity'] = 0.5
    # 4 the sketch, with an undo and an eye drawn too big and redone
    S = doc.add('Sketch')
    sk = P['sketch']
    per = max(1, len(sk) // 22)
    for k, m in enumerate(sk):
        put_mask(S, m, 'stone2')
        if k % per == per - 1:
            rec.snap('sketch', tip(m), 'brush', 'stone2')
        if k == len(sk) // 3:
            ex, ey = V.LP((-26, 9), 0)
            big = np.zeros((h, w), bool)
            for t in np.linspace(0, 2 * math.pi, 80):
                x, y = int(ex + math.cos(t) * 9), int(ey + math.sin(t) * 7)
                if 0 <= x < w and 0 <= y < h:
                    big[y, x] = True
            put_mask(S, big, 'stone1')
            rec.snap('sketch', (ex + 9, ey), 'brush', 'stone1', hold=3)
            erase(S, big)
            rec.snap('erase', (ex, ey), 'eraser', hold=2)
        if k == 2 * len(sk) // 3:
            tmp = [m2 for m2 in sk[k + 1:k + 6]]
            for m2 in tmp:
                put_mask(S, m2, 'stone2')
            rec.snap('sketch', tip(tmp[-1]) if tmp else None, 'brush', 'stone2')
            for m2 in tmp:
                erase(S, m2 & ~np.any([sk[j] for j in range(0, k + 1)], axis=0))
            rec.snap('undo', hold=2)
    for m in P['hatch']:
        put_mask(S, m & ~(S['a'][..., 3] > 0), 'stone3')
    rec.snap('hatching', hold=2)
    doc.flip = True
    rec.snap('flip canvas', hold=5)
    doc.flip = False
    rec.snap('', hold=2)
    G['visible'] = C['visible'] = False
    S['opacity'] = 0.35
    rec.snap('hide layers', hold=3)
    # 5 line art, one line redrawn
    L = doc.add('Line art')
    ink = P['ink']
    parts = chunks(ink, 10)
    for k, part in enumerate(parts):
        if k == 4:
            off = np.roll(part, 1, axis=0)
            put_mask(L, off, V.INK)
            rec.snap('line art', tip(off), 'brush', V.INK, hold=2)
            erase(L, off)
            rec.snap('undo', hold=2)
        put_mask(L, part, V.INK)
        rec.snap('line art', tip(part), 'brush', V.INK)
    # 6 flats: the fur filled brown first, then changed to white
    Fl = doc.add('Flats')
    doc.layers.insert(doc.layers.index(L), doc.layers.pop())         # flats sit under the line art
    doc.select('Flats')
    fur = solid & (a['head'] | a['neck'] | a['jaw'] | a['brow'])
    put_mask(Fl, fur, 'wood2')
    rec.snap('fill', centre(fur), 'fill', 'wood2', hold=4)
    put_mask(Fl, fur, 'wood4')
    rec.snap('adjust colour', None, 'fill', 'wood4', hold=2)
    put_from(Fl, flats, fur)
    rec.snap('adjust colour', None, 'fill', 'stone4', hold=3)
    for key in ('horn_near', 'horn_far', 'spike', 'beard', 'muzzle', 'eye', 'plates', 'belly'):
        m = solid & a[key] if key in a else None
        if m is not None and m.any():
            put_from(Fl, flats, m)
            rec.snap('fill', centre(m), 'fill', tuple(flats[m][0][:3]))
    put_from(Fl, flats, solid)
    rec.snap('', hold=2)
    S['visible'] = False
    S['hidden_in_file'] = True
    rec.snap('hide sketch', hold=2)
    # 7 shadows, with a patch put on the wrong side and erased
    Sh = doc.add('Shadows')
    doc.layers.insert(doc.layers.index(L), doc.layers.pop())
    doc.select('Shadows')
    wrong = solid & (np.abs(np.mgrid[0:h, 0:w][1] - 44) < 6) & (np.abs(np.mgrid[0:h, 0:w][0] - 92) < 5)
    put_mask(Sh, wrong, 'stone2')
    rec.snap('shadows', centre(wrong), 'brush', 'stone2', hold=3)
    erase(Sh, wrong)
    rec.snap('erase', centre(wrong), 'eraser', hold=2)
    for part in chunks(shadow_m, 6, 'light'):
        put_from(Sh, render, part)
        rec.snap('shadows', centre(part), 'brush', 'stone2')
    Li = doc.add('Light')
    doc.layers.insert(doc.layers.index(L), doc.layers.pop())
    doc.select('Light')
    for part in chunks(light_m, 4, 'light'):
        put_from(Li, render, part)
        rec.snap('light', centre(part), 'brush', 'cloud3')
    # the line art folds into the colour from here: it is switched off
    L['visible'] = False
    L['hidden_in_file'] = True
    rec.snap('hide line art', hold=2)
    T = doc.add('Fur & scales')
    for part in chunks(tex_m, 7, 'patch', np.random.RandomState(3)):
        put_from(T, tex, part)
        rec.snap('fur', centre(part), 'brush', 'stone4')
    D = doc.add('Outline & rim light')
    for part in chunks(fin_m, 3):
        put_from(D, final, part)
        rec.snap('details', centre(part), 'brush', 'cloud3')
    doc.flip = True
    rec.snap('flip canvas', hold=4)
    doc.flip = False
    rec.snap('done', hold=14, ms=140)
    rec.save_gif(os.path.join(out_dir, 'goat_dragon_process.gif'))
    save_psd(doc, os.path.join(out_dir, 'goat_dragon_layers.psd'), 4)
    Image.fromarray(doc.composite()).resize((w * 4, h * 4), Image.NEAREST).save(
        os.path.join(out_dir, 'goat_dragon_final.png'))
    print('goat-dragon:', len(rec.frames), 'frames')


# ---------------------------------------------------------------- a room
def room(sc, ri, out_dir):
    import build
    import layout as LY
    import propkit
    rng = random.Random(100 + ri)
    names = {0: 'room1_cook_room', 1: 'room2_seating_room', 2: 'room3_counter_room', 3: 'room4_bedroom'}
    titles = {0: 'cook room', 1: 'seating room', 2: 'counter room', 3: "traveler's bedroom"}
    cam = ri * LY.SW
    w, h = LY.SW, LY.SH
    crop = lambda cv: cv.a[:, cam:cam + w].copy()

    def blank():
        return Canvas(LY.W, LY.H)
    # the finished pieces, each on its own
    out_layers = []
    for name, frames, fac, *off in sc.outs:
        c = blank()
        origin = int(round(cam * (1 - fac)))
        ox, oy = off[0] if off else (0, 0)
        x = origin % 1280 - 1280
        while x < LY.W:
            c.blit(frames[0], x + ox, oy)
            x += 1280
        nice = {'00_sky': 'Sky', '01_clouds': 'Clouds', '02_mountains': 'Mountains', '03_lake': 'Lake',
                '04_leviathan': None, '05_hills_trees': 'Far shore', '06_garden_trees': 'Garden trees',
                '07_flowers_close': 'Flower bed'}[name]
        if nice:
            out_layers.append((nice, crop(c)))
    shell = crop(sc.shell)
    counter = crop(sc.counter)
    props = []
    for layer in build.LAYER_ORDER:
        if layer == 'counter_layer':
            props.append(('Counter & furniture', counter, None))
            continue
        for p in sc.props:
            if p['layer'] == layer and p.get('preview', True) and p['room'] == ri + 1 and p['layer'] != 'outside':
                c = blank()
                c.blit(p['frames'][0], p['sx'], p['sy'])
                props.append((p['name'].replace('_', ' '), crop(c), p))
    fg = crop(sc.fg[0])
    light = crop(sc.light[0]) if isinstance(sc.light, list) else crop(sc.light)
    final = sc.view(0, cam, light=True).a.copy()
    doc = Doc(w, h, (246, 242, 232))
    rec = Recorder(doc, 2, titles[ri] + '  -  640 x 360', panel_w=220)
    rec.snap('new canvas', hold=4)
    # 1 perspective grid, a line laid wrong and redrawn
    Gd = doc.add('Perspective grid')
    vx, vy = w // 2, LY.EYE_Y
    hz, _ = wobbly_line(w, h, [(0, vy), (w - 1, vy)], rng, 0.3)
    put_mask(Gd, hz, (120, 160, 220))
    rec.snap('horizon', (w - 1, vy), 'brush', (120, 160, 220), hold=2)
    targets = [(0, 0), (w // 4, 0), (3 * w // 4, 0), (w - 1, 0), (0, h - 1), (w // 4, h - 1), (3 * w // 4, h - 1),
               (w - 1, h - 1), (0, h // 2 + 60), (w - 1, h // 2 + 60)]
    for k, (tx, ty) in enumerate(targets):
        m, _ = wobbly_line(w, h, [(vx, vy), (tx, ty)], rng, 0.4)
        put_mask(Gd, m, (120, 160, 220))
        rec.snap('perspective', (tx, ty), 'brush', (120, 160, 220))
        if k == 4:
            bad, _ = wobbly_line(w, h, [(vx, vy), (tx + 90, ty)], rng, 0.4)
            put_mask(Gd, bad, (120, 160, 220))
            rec.snap('perspective', (tx + 90, ty), 'brush', (120, 160, 220), hold=2)
            erase(Gd, bad & ~m)
            rec.snap('undo', hold=2)
    # 2 rough sketch: loose lines from the forms, a box drawn in the wrong place and erased
    Sk = doc.add('Rough sketch')
    g = final[..., :3].astype(int).sum(-1)
    edges = (np.abs(np.diff(g, axis=0, prepend=g[:1])) + np.abs(np.diff(g, axis=1, prepend=g[:, :1]))) > 150
    jit = np.random.RandomState(ri).rand(h, w) < 0.55
    sketch = edges & jit
    for k, part in enumerate(chunks(sketch, 9)):
        put_mask(Sk, part, 'stone1', 200)
        rec.snap('sketch', centre(part), 'brush', 'stone1')
        if k == 3:
            bx, by = rng.randint(120, 380), rng.randint(200, 260)
            box = np.zeros((h, w), bool)
            for (p0, p1) in (((bx, by), (bx + 90, by)), ((bx + 90, by), (bx + 90, by + 50)),
                             ((bx + 90, by + 50), (bx, by + 50)), ((bx, by + 50), (bx, by))):
                mm, _ = wobbly_line(w, h, [p0, p1], rng, 0.6)
                box |= mm
            put_mask(Sk, box, 'stone1', 220)
            rec.snap('sketch', (bx + 90, by + 50), 'brush', 'stone1', hold=3)
            for part2 in chunks(box, 2):
                erase(Sk, part2 & ~sketch)
                rec.snap('erase', centre(part2), 'eraser')
    Gd['opacity'] = 0.35
    rec.snap('layer opacity', hold=2)
    # 3 flat colour block-in
    Bk = doc.add('Block-in')
    doc.layers.insert(1, doc.layers.pop())
    doc.select('Block-in')
    # local colours only: a few flat tones with soft, hand-cut edges
    from PIL import ImageFilter
    q = Image.fromarray(final[..., :3]).quantize(10, method=Image.Quantize.MEDIANCUT)
    q = q.filter(ImageFilter.ModeFilter(9)).filter(ImageFilter.ModeFilter(7))
    regions = np.array(q)
    pal = np.array(q.getpalette()[:30]).reshape(-1, 3)
    flat = pal[regions].astype(np.uint8)
    for k, v in enumerate(sorted(np.unique(regions), key=lambda v: -np.sum(regions == v))):
        m = regions == v
        Bk['a'][m, :3] = flat[m]
        Bk['a'][m, 3] = 255
        rec.snap('flat colour', centre(m), 'fill', tuple(int(c) for c in flat[m][0]))
    rest = Bk['a'][..., 3] == 0
    Bk['a'][rest, :3] = flat[rest]
    Bk['a'][rest, 3] = 255
    rec.snap('flat colour', hold=2)
    # 4 the view outside, layer by layer
    for nm, img in out_layers:
        Lr = doc.add(nm)
        doc.layers.insert(len(doc.layers) - 3, doc.layers.pop())
        doc.select(nm)
        m = img[..., 3] > 0
        for part in chunks(m, 2, 'patch', np.random.RandomState(len(nm) + ri)):
            put_from(Lr, img, part)
            rec.snap('paint ' + nm.lower(), centre(part), 'brush')
    # 5 the room itself, painted over the block-in in patches
    Rs = doc.add('Walls, floor & ceiling')
    doc.layers.insert(len(doc.layers) - 3, doc.layers.pop())
    doc.select('Walls, floor & ceiling')
    m = shell[..., 3] > 0
    for part in chunks(m, 8, 'patch', np.random.RandomState(ri)):
        put_from(Rs, shell, part)
        rec.snap('paint walls', centre(part), 'brush')
    Gd['visible'] = False
    Gd['hidden_in_file'] = True
    Sk['opacity'] = 0.25
    rec.snap('hide grid', hold=2)
    # 6 furniture and props, one by one: one moved into place, one added and then deleted
    extras = [p for p in propkit.PROPS if p['room'] == ri + 1 and not p['preview'] and p['layer'] in ('wall', 'floor', 'counter')]
    moved = False
    doomed_done = False
    above = len(doc.layers)                                     # props go above the room, under the sketch
    for k, (nm, img, p) in enumerate(props):
        m = img[..., 3] > 0
        if not m.any():
            continue
        Lr = doc.add(nm)
        doc.select(nm)
        if nm == 'Counter & furniture' and ri in (1, 2):
            pale = img.copy()
            pale[m, :3] = np.clip(pale[m, :3].astype(int) + 26, 0, 255)
            put_from(Lr, pale, m)
            rec.snap('paint counter', centre(m), 'brush', hold=3)
            put_from(Lr, img, m)
            rec.snap('adjust colour - darker', None, 'fill', hold=3)
            continue
        if not moved and p is not None and m.sum() > 400:
            for dx in (34, 22, 12, 5, 0):
                Lr['a'][:] = 0
                sh = np.roll(img, -dx, axis=1)
                Lr['a'][sh[..., 3] > 0] = sh[sh[..., 3] > 0]
                rec.snap('move' if dx else 'place', centre(sh[..., 3] > 0), 'move')
            moved = True
            continue
        put_from(Lr, img, m)
        rec.snap('add ' + nm, centre(m), 'brush')
        if not doomed_done and extras and k > len(props) // 2:
            e = extras[0]
            out = e['fn']()
            fr = out[0] if isinstance(out, list) else (next(iter(out.values()))[0] if isinstance(out, dict) else out)
            if isinstance(fr, list):
                fr = fr[0]
            c = blank()
            c.blit(fr, e['x'], e['y'])
            ei = crop(c)
            Le = doc.add(e['name'].replace('_', ' '))
            put_from(Le, ei, ei[..., 3] > 0)
            rec.snap('add ' + e['name'].replace('_', ' '), centre(ei[..., 3] > 0), 'brush', hold=4)
            doc.remove(Le['name'])
            rec.snap('delete layer', hold=3)
            doomed_done = True
    Sk['visible'] = False
    Sk['hidden_in_file'] = True
    Bk['hidden_in_file'] = False
    rec.snap('hide sketch', hold=2)
    Fg = doc.add('Foreground posts')
    put_from(Fg, fg, fg[..., 3] > 0)
    rec.snap('foreground', None, 'brush', hold=2)
    Lt = doc.add('Light & glow')
    for op in (0.3, 0.6, 1.0):
        Lt['a'] = light.copy()
        Lt['opacity'] = op
        rec.snap('light', None, 'brush')
    doc.flip = True
    rec.snap('flip canvas', hold=4)
    doc.flip = False
    rec.snap('done', hold=12, ms=150)
    rec.save_gif(os.path.join(out_dir, names[ri] + '_process.gif'))
    save_psd(doc, os.path.join(out_dir, names[ri] + '_layers.psd'), 2)
    Image.fromarray(doc.composite()).resize((w * 2, h * 2), Image.NEAREST).save(
        os.path.join(out_dir, names[ri] + '_final.png'))
    print(names[ri] + ':', len(rec.frames), 'frames,', len(doc.layers), 'layers')


def main(out_dir, which=('goat', 0, 1, 2, 3)):
    os.makedirs(out_dir, exist_ok=True)
    if 'goat' in which:
        goat(out_dir)
    rooms = [r for r in which if r != 'goat']
    if rooms:
        import build
        sc = build.Scene()
        for ri in rooms:
            room(sc, ri, out_dir)


if __name__ == '__main__':
    args = sys.argv[2:]
    which = tuple('goat' if a == 'goat' else int(a) for a in args) if args else ('goat', 0, 1, 2, 3)
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'process'), which)
