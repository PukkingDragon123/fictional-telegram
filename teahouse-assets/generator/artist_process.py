"""How it was drawn: layered files and a timelapse of the work, made the way a
digital painter makes a piece in Procreate.

    python3 teahouse-assets/generator/artist_process.py OUT_DIR [goat 0 1 2 3]

For the goat-dragon and for each room this writes
  - <name>_timelapse.mp4: canvas only, one frame per stroke, like a Procreate
    timelapse export
  - <name>_timelapse.gif: the same, shorter, for quick viewing
  - <name>_layers.psd: the working layers (opens in Procreate, Photoshop,
    Krita...). The rough layers are kept but hidden. The file flattens to the
    finished art.
  - <name>_final.png

Nothing is revealed by a wipe or a filter. Every mark is a stroke: a path
that wobbles, overshoots its end, tapers, and is clipped to a selection the
way a clipping mask works. Fills are bucket fills, and colour changes are
slider drags.

The mistakes stay in:
  - a first idea roughed out, faded and hidden
  - lines gone over twice
  - an eye drawn too big and rubbed out
  - a jaw moved after flipping the canvas
  - doubled pixels cleaned off the line art
  - fur filled the wrong colour and adjusted
  - highlights pushed too far and pulled back
  - a sketch drawn in the wrong spot and dragged across
  - an item sketched then erased
  - a prop painted and then deleted
  - a few strokes undone

Not part of the build or the asset zip."""
import math
import os
import pickle
import random
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np                                      # noqa: E402
from PIL import Image, ImageFilter                      # noqa: E402
from pixel import Canvas, PAL                            # noqa: E402

FPS = 30


def rgb(c):
    return np.array(PAL[c] if isinstance(c, str) else c[:3], np.float32)


# ---------------------------------------------------------------- the document
class Doc:
    _uid = 0

    def __init__(self, w, h, paper):
        self.w, self.h = w, h
        self.layers = []
        self.flip = False
        self._prefix = []
        p = self.add('Paper')
        p['a'][..., :3] = rgb(paper)
        p['a'][..., 3] = 255

    def add(self, name, below=None, above=None, opacity=1.0):
        Doc._uid += 1
        L = dict(name=name, a=np.zeros((self.h, self.w, 4), np.uint8), opacity=opacity, visible=True,
                 keep_hidden=False, ver=0, uid=Doc._uid)
        if below is not None:
            self.layers.insert(self.layers.index(below), L)
        elif above is not None:
            self.layers.insert(self.layers.index(above) + 1, L)
        else:
            self.layers.append(L)
        return L

    def remove(self, L):
        self.layers.remove(L)

    @staticmethod
    def touch(L):
        L['ver'] += 1

    def composite(self):
        """Flatten, reusing the stack below the first layer that changed."""
        out = None
        new = []
        valid = True
        for i, L in enumerate(self.layers):
            sig = (L['uid'], L['ver'], L['visible'], L['opacity'])
            if valid and i < len(self._prefix) and self._prefix[i][0] == sig:
                out = self._prefix[i][1]
                new.append(self._prefix[i])
                continue
            valid = False
            if out is None:
                out = np.zeros((self.h, self.w, 3), np.float32)
            if L['visible'] and L['opacity'] > 0:
                al = L['a'][..., 3:4].astype(np.float32) * (L['opacity'] / 255.0)
                out = out * (1 - al) + L['a'][..., :3].astype(np.float32) * al
            new.append((sig, out))
        self._prefix = new
        img = np.clip(out + 0.5, 0, 255).astype(np.uint8)
        return img[:, ::-1] if self.flip else img


def lay(L, m, color, alpha=1.0):
    """Paint a colour over the layer's pixels in m, building up like a real brush."""
    if not m.any():
        return
    a = L['a']
    src = a[m].astype(np.float32)
    A = src[:, 3] / 255.0
    Ao = A + alpha * (1 - A)
    col = (src[:, :3] * (A * (1 - alpha))[:, None] + rgb(color) * alpha) / np.maximum(Ao, 1e-6)[:, None]
    a[m, :3] = np.clip(col + 0.5, 0, 255).astype(np.uint8)
    a[m, 3] = np.clip(Ao * 255 + 0.5, 0, 255).astype(np.uint8)


def reveal(L, src, m):
    mm = m & (src[..., 3] > 0)
    L['a'][mm] = src[mm]


def rub(L, m):
    L['a'][m] = 0


# ---------------------------------------------------------------- the recording
class Timelapse:
    """Canvas only, one frame per stroke (or per few strokes), like Procreate's export."""

    def __init__(self, doc, scale, path, gif_every=3):
        self.doc, self.s, self.path = doc, scale, path
        self.W, self.H = doc.w * scale, doc.h * scale
        self.proc = subprocess.Popen(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (self.W, self.H),
             '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
             '-movflags', '+faststart', path], stdin=subprocess.PIPE)
        self.n = 0
        self.pending = 0
        self.every = 1
        self.gif_every = gif_every
        self.gif = []

    def shot(self, hold=1):
        img = self.doc.composite()
        big = np.repeat(np.repeat(img, self.s, 0), self.s, 1)
        data = big.tobytes()
        for _ in range(hold):
            self.proc.stdin.write(data)
            if self.n % self.gif_every == 0:
                self.gif.append(img)
            self.n += 1
        self.pending = 0

    def tick(self, every=None):
        self.pending += 1
        if self.pending >= (every or self.every):
            self.shot()

    def close(self, gif_path, gif_scale):
        if self.pending:
            self.shot()
        self.proc.stdin.close()
        self.proc.wait()
        fr = [Image.fromarray(np.repeat(np.repeat(g, gif_scale, 0), gif_scale, 1)) for g in self.gif]
        picks = fr[::max(1, len(fr) // 12)]
        strip = Image.new('RGB', (picks[0].width, picks[0].height * len(picks)))
        for i, f in enumerate(picks):
            strip.paste(f, (0, i * f.height))
        pal = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in fr]
        dur = [int(1000 * self.gif_every / FPS)] * len(q)
        dur[-1] = 2500
        q[0].save(gif_path, save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=True)
        return self.n


def save_psd(doc, path, scale):
    from psd_tools import PSDImage
    from psd_tools.api.layers import PixelLayer
    W, H = doc.w * scale, doc.h * scale
    psd = PSDImage.new('RGBA', (W, H))
    for L in doc.layers:
        im = Image.fromarray(L['a']).resize((W, H), Image.NEAREST)
        lay_ = PixelLayer.frompil(im, psd, L['name'], 0, 0)
        lay_.opacity = int(round(255 * L['opacity']))
        lay_.visible = bool(L['visible']) and not L['keep_hidden']
        psd.append(lay_)
    psd.save(path)


# ---------------------------------------------------------------- geometry helpers
def catmull(pts, closed=False):
    P = [np.asarray(p, float) for p in pts]
    if len(P) < 3:
        return np.array(P, float)
    if closed:
        ext = [P[-1]] + P + [P[0], P[1]]
    else:
        ext = [2 * P[0] - P[1]] + P + [2 * P[-1] - P[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        m = max(2, int(np.hypot(*(p2 - p1)) * 1.5))
        for t in np.linspace(0, 1, m, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(ext[-2])
    return np.array(out)


def resample(d, step):
    if len(d) < 2:
        return d
    seg = np.hypot(*np.diff(d, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < step:
        return d[[0, -1]]
    t = np.arange(0, s[-1], step)
    return np.stack([np.interp(t, s, d[:, 0]), np.interp(t, s, d[:, 1])], 1)


def rdp(pts, eps):
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    L = np.hypot(*ab)
    if L == 0:
        d = np.hypot(*(pts - a).T)
    else:
        d = np.abs(ab[0] * (pts[:, 1] - a[1]) - ab[1] * (pts[:, 0] - a[0])) / L
    i = int(np.argmax(d))
    if d[i] > eps:
        return np.vstack([rdp(pts[:i + 1], eps)[:-1], rdp(pts[i:], eps)])
    return np.vstack([a, b])


def shift(m, dy, dx):
    out = np.zeros_like(m)
    h, w = m.shape[:2]
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = m[ys, xs]
    return out


def grow(m, r=1):
    out = m.copy()
    for _ in range(r):
        out = out | shift(out, 1, 0) | shift(out, -1, 0) | shift(out, 0, 1) | shift(out, 0, -1)
    return out


def edge_of(m):
    inner = m & shift(m, 1, 0) & shift(m, -1, 0) & shift(m, 0, 1) & shift(m, 0, -1)
    return m & ~inner


N8 = [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def chains(mask):
    """Walk a thin mask into ordered pixel runs (x, y), the way a pen would follow them."""
    m = mask.copy()
    h, w = m.shape
    cnt = sum(shift(m, dy, dx).astype(int) for dy, dx in N8)
    ends = list(zip(*np.nonzero(m & (cnt <= 1))))
    rest = list(zip(*np.nonzero(m)))
    out = []
    for (y, x) in ends + rest:
        if not m[y, x]:
            continue
        ch = [(x, y)]
        m[y, x] = False
        pd = None
        while True:
            best, bs = None, 99
            for dy, dx in N8:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx]:
                    sc = (0 if pd is None else abs(dy - pd[0]) + abs(dx - pd[1])) + (0.4 if dy and dx else 0)
                    if sc < bs:
                        best, bs = (dy, dx), sc
            if best is None:
                break
            y, x = y + best[0], x + best[1]
            pd = best
            m[y, x] = False
            ch.append((x, y))
        out.append(ch)
    return out


def nearest_order(items, start, key_start, key_end):
    """Greedy order: always continue from where the hand last lifted."""
    left = list(items)
    out = []
    cur = np.asarray(start, float)
    while left:
        d = [min(np.hypot(*(np.asarray(key_start(it)) - cur)), np.hypot(*(np.asarray(key_end(it)) - cur)) + 0.5)
             for it in left]
        i = int(np.argmin(d))
        it = left.pop(i)
        out.append(it)
        cur = np.asarray(key_end(it), float)
    return out


def tones(img, mask, k=3, smooth=5):
    """A first pass of light and shadow: the colours in mask grouped into k values,
    softened into simple shapes."""
    out = np.zeros_like(img)
    if mask.sum() < 4:
        out[mask] = img[mask]
        return out
    px = img[mask][:, :3].astype(np.float32)
    lum = px @ np.array([0.3, 0.59, 0.11], np.float32)
    qs = np.quantile(lum, np.linspace(0, 1, k + 1)[1:-1])
    lab = np.digitize(lum, qs)
    cols = np.array([px[lab == i].mean(0) if (lab == i).any() else px.mean(0) for i in range(k)])
    li = np.zeros(mask.shape, np.uint8)
    li[mask] = lab * 60 + 40
    if smooth:
        f = np.array(Image.fromarray(li).filter(ImageFilter.ModeFilter(smooth)))
        ok = mask & (f >= 40)
        li[ok] = f[ok]
    lab2 = np.clip((li[mask].astype(int) - 40) // 60, 0, k - 1)
    out[mask, :3] = np.clip(cols[lab2], 0, 255).astype(np.uint8)
    out[mask, 3] = 255
    return out


def mean_colour(img, mask):
    return tuple(int(c) for c in img[mask][:, :3].mean(0)) if mask.any() else (128, 128, 128)


# ---------------------------------------------------------------- the hand
_DISC = {}


def _disc(r):
    if r not in _DISC:
        R = int(math.ceil(r))
        dy, dx = np.mgrid[-R:R + 1, -R:R + 1]
        k = dx * dx + dy * dy <= r * r + 0.3
        _DISC[r] = (dy[k], dx[k])
    return _DISC[r]


def raster(shape, p, size=1.0, taper=0.3, pp=True):
    h, w = shape
    m = np.zeros(shape, bool)
    if len(p) == 0:
        return m
    if size <= 1.01:
        q = np.round(p).astype(int)
        pts = [tuple(q[0])]
        for x, y in q[1:]:
            x0, y0 = pts[-1]
            n = max(abs(x - x0), abs(y - y0))
            for k in range(1, n + 1):
                pts.append((int(round(x0 + (x - x0) * k / n)), int(round(y0 + (y - y0) * k / n))))
        if pp and len(pts) > 2:                                  # pixel-perfect: no L-shaped corners
            keep = [pts[0]]
            for i in range(1, len(pts) - 1):
                a, b, c = keep[-1], pts[i], pts[i + 1]
                if abs(c[0] - a[0]) == 1 and abs(c[1] - a[1]) == 1 and (b[0] == a[0] or b[1] == a[1]):
                    continue
                keep.append(b)
            keep.append(pts[-1])
            pts = keep
        arr = np.array(pts)
        ok = (arr[:, 0] >= 0) & (arr[:, 0] < w) & (arr[:, 1] >= 0) & (arr[:, 1] < h)
        m[arr[ok, 1], arr[ok, 0]] = True
        return m
    n = len(p)
    t = np.linspace(0, 1, n)
    pr = np.ones(n) if taper <= 0 else np.clip(np.minimum(t / taper, (1 - t) / taper), 0, 1) * 0.5 + 0.5
    rad = size / 2.0 * pr
    k = max(1, int(size * 0.25 / 0.4))
    ys, xs = [], []
    for i in range(0, n, k):
        rq = max(0.5, round(rad[i] * 2) / 2)
        dy, dx = _disc(rq)
        ys.append(int(round(p[i, 1])) + dy)
        xs.append(int(round(p[i, 0])) + dx)
    ys, xs = np.concatenate(ys), np.concatenate(xs)
    ok = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
    m[ys[ok], xs[ok]] = True
    return m


class Hand:
    def __init__(self, seed):
        self.r = np.random.RandomState(seed)

    def path(self, pts, wob=0.5, over=0.0, closed=False, step=0.4, drift=None):
        r = self.r
        d = catmull(pts, closed) if len(pts) > 2 else np.asarray(pts, float)
        d = resample(d, step)
        if len(d) < 2:
            return d
        if over:
            for end in (0, 1):
                e = over * r.uniform(-0.25, 1.25)
                a, b = (d[0], d[min(3, len(d) - 1)]) if end == 0 else (d[-1], d[max(0, len(d) - 4)])
                tg = a - b
                tg = tg / (np.hypot(*tg) or 1)
                if e > 0:
                    ext = np.array([a + tg * s for s in np.arange(step, e, step)])
                    if len(ext):
                        d = np.vstack([ext[::-1], d]) if end == 0 else np.vstack([d, ext])
                elif len(d) > 8:
                    cut = min(int(-e / step), len(d) // 4)
                    d = d[cut:] if end == 0 else d[:len(d) - cut]
        tg = np.gradient(d, axis=0)
        tg = tg / np.maximum(np.hypot(tg[:, 0], tg[:, 1]), 1e-6)[:, None]
        nm = np.stack([-tg[:, 1], tg[:, 0]], 1)
        s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(d, axis=0).T))])
        L = max(s[-1], 1)
        f1, f2 = r.uniform(0.6, 1.3) * max(22.0, L), r.uniform(5, 9)
        p1, p2 = r.uniform(0, 2 * math.pi, 2)
        env = np.clip(s / 4.0, 0, 1)
        off = (wob * np.sin(2 * math.pi * s / f1 + p1) + min(0.25 * wob, 0.2) * np.sin(2 * math.pi * s / f2 + p2)) * env
        off += (wob if drift is None else drift) * r.normal() * (s / L) ** 2
        return d + nm * off[:, None]


def split_curve(dense, rng, seg=(16, 36), overlap=(1, 4)):
    """A long line drawn the way people draw it: in several strokes that overlap a little."""
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(dense, axis=0).T))])
    out = []
    a = 0.0
    while a < s[-1] - 1:
        b = min(s[-1], a + rng.uniform(*seg))
        if s[-1] - b < seg[0] * 0.5:
            b = s[-1]
        idx = (s >= a) & (s <= b)
        if idx.sum() >= 2:
            out.append(dense[idx])
        if b >= s[-1]:
            break
        a = max(a + 2, b - rng.uniform(*overlap))
    return out


def scribble_paths(region, size, angle, rng, max_len=60, rows=(2, 5), spacing=0.85):
    """Back-and-forth strokes that cover a region, laid in small patches, like a
    painter filling an area: a few rows per stroke, ends that over- and undershoot."""
    ys, xs = np.nonzero(region)
    if not len(ys):
        return []
    ca, sa = math.cos(angle), math.sin(angle)
    u = xs * ca + ys * sa
    v = -xs * sa + ys * ca
    sp = max(1.0, size * spacing)
    v0 = v.min()
    vb = np.floor((v - v0) / sp).astype(int)
    runs = []                                                       # (row, u0, u1)
    order = np.lexsort((u, vb))
    vb_s, u_s = vb[order], u[order]
    brk = np.nonzero((np.diff(vb_s) != 0) | (np.diff(u_s) > sp * 1.5 + 1))[0]
    starts = np.concatenate([[0], brk + 1])
    ends = np.concatenate([brk, [len(u_s) - 1]])
    for a_, b_ in zip(starts, ends):
        row, u0, u1 = vb_s[a_], u_s[a_], u_s[b_]
        n = max(1, int(math.ceil((u1 - u0) / max_len)))
        cuts = np.linspace(u0, u1, n + 1)
        for k in range(n):
            runs.append([row, cuts[k], cuts[k + 1], False])
    by_row = {}
    for rr in runs:
        by_row.setdefault(rr[0], []).append(rr)
    strokes = []
    for rr in sorted(runs, key=lambda q: (q[0], q[1])):
        if rr[3]:
            continue
        group = [rr]
        rr[3] = True
        want = rng.randint(rows[0], rows[1] + 1)
        cur = rr
        while len(group) < want:
            nxt = [q for q in by_row.get(cur[0] + 1, []) if not q[3] and min(q[2], cur[2]) - max(q[1], cur[1]) > -sp]
            if not nxt:
                break
            q = min(nxt, key=lambda q: abs((q[1] + q[2]) - (cur[1] + cur[2])))
            q[3] = True
            group.append(q)
            cur = q
        pts = []
        for j, (row, u0, u1, _) in enumerate(group):
            vv = v0 + (row + 0.5) * sp + rng.normal(0, 0.12 * sp)
            e0 = u0 - size * rng.uniform(-0.2, 0.7)
            e1 = u1 + size * rng.uniform(-0.2, 0.7)
            seq = [(e0, vv), (e1, vv)] if j % 2 == 0 else [(e1, vv), (e0, vv)]
            pts += seq
        xy = [(uu * ca - vv * sa, uu * sa + vv * ca) for uu, vv in pts]
        strokes.append((group[0][0], (group[0][1] + group[0][2]) / 2, xy))
    # paint patch by patch, snaking, with the odd jump elsewhere
    band = max(1, rows[1] * 3)
    col = max_len * 1.6
    strokes.sort(key=lambda q: (q[0] // band, (q[1] // col) * (1 if (q[0] // band) % 2 == 0 else -1)))
    out = [q[2] for q in strokes]
    for _ in range(len(out) // 25):
        i, j = rng.randint(len(out)), rng.randint(len(out))
        out[i], out[j] = out[j], out[i]
    return out


# ---------------------------------------------------------------- the painter
class Painter:
    def __init__(self, doc, tl, seed):
        self.doc, self.tl = doc, tl
        self.hand = Hand(seed)
        self.rng = random.Random(seed)
        self.shape = (doc.h, doc.w)

    # one stroke
    def stroke(self, L, pts, color=None, src=None, size=1.0, alpha=1.0, wob=0.5, over=0.0, closed=False,
               clip=None, pp=True, erase=False, frame=True, raw=False, taper=0.3, every=None):
        if raw:
            p = np.asarray(pts, float)
        else:
            p = self.hand.path(pts, wob=wob, over=over, closed=closed)
        m = raster(self.shape, p, size, taper=taper, pp=pp)
        if clip is not None:
            m &= clip
        if erase:
            rub(L, m)
        elif src is not None:
            reveal(L, src, m)
        else:
            lay(L, m, color, alpha)
        Doc.touch(L)
        if frame:
            self.tl.tick(every)
        return m

    def curve(self, L, pts, closed=False, seg=(16, 36), passes=1, wob=0.6, over=2.5, every=None, **kw):
        """A contour drawn in short overlapping strokes; passes=2 goes over it again, searching."""
        dense = resample(catmull(pts, closed) if len(pts) > 2 else np.asarray(pts, float), 0.5)
        if closed and len(dense) > 2:
            dense = np.vstack([dense, dense[:6]])
        drawn = np.zeros(self.shape, bool)
        for k in range(passes):
            for piece in split_curve(dense, self.rng, seg):
                ctrl = piece[::max(1, len(piece) // 5)]
                if len(ctrl) < 2:
                    ctrl = piece[[0, -1]]
                ctrl = np.vstack([ctrl, piece[-1:]])
                drawn |= self.stroke(L, ctrl, wob=wob * (1 + 0.4 * k), over=over * (1 + 0.5 * k), every=every, **kw)
        return drawn

    def scribble(self, L, region, size, angle=0.0, src=None, color=None, alpha=1.0, frames=20, max_len=60,
                 rows=(2, 5), clip=True, touch=True, wob=None, spacing=0.85):
        """Cover a region with strokes. With clip the strokes stay inside it, like
        painting inside a selection; without, they spill a little past the edge."""
        if not region.any():
            return
        paths = scribble_paths(region, size, angle, self.hand.r, max_len=max_len, rows=rows, spacing=spacing)
        every = max(1, int(math.ceil(len(paths) / max(1, frames))))
        cl = region if clip else None
        done = np.zeros(self.shape, bool)
        for pts in paths:
            done |= self.stroke(L, pts, color=color, src=src, size=size, alpha=alpha, wob=wob if wob is not None else min(1.2, size * 0.12),
                                clip=cl, every=every, taper=0.15)
        if touch:
            self._touch_up(L, region & ~done, size, src, color, alpha, cl, every)
        self.tl.shot()

    def _touch_up(self, L, left, size, src, color, alpha, clip, every):
        """Go back over the bits the strokes missed with small dabs."""
        cell = max(4, int(size * 5))
        for it in range(3):
            if not left.any():
                return
            ys, xs = np.nonzero(left)
            keys = (ys // cell) * 10000 + xs // cell
            sz = max(1.0, size * (0.6 if it < 2 else 0.0))
            for kk in np.unique(keys):
                sel = keys == kk
                pts = np.stack([xs[sel], ys[sel]], 1).astype(float)
                if it < 2:
                    pts = pts[np.argsort(pts[:, 0] + pts[:, 1] * 0.3)][::max(1, int(sel.sum() // 8))]
                    if len(pts) == 1:
                        pts = np.vstack([pts, pts + 0.3])
                    m = self.stroke(L, pts, color=color, src=src, size=sz, alpha=alpha, wob=0.3, clip=clip,
                                    every=every * 2, taper=0)
                else:
                    m = np.zeros(self.shape, bool)
                    m[pts[:, 1].astype(int), pts[:, 0].astype(int)] = True
                    if src is not None:
                        reveal(L, src, m)
                    else:
                        lay(L, m, color, alpha)
                    Doc.touch(L)
                    self.tl.tick(every * 3)
                left = left & ~m

    def fill(self, L, region, color=None, src=None, hold=2):
        """Bucket fill or lasso fill: one go."""
        if src is not None:
            reveal(L, src, region)
        else:
            lay(L, region, color)
        Doc.touch(L)
        self.tl.shot(hold)

    def adjust(self, L, region, target, steps=10, hold_end=4):
        """Hue/saturation/brightness: the slider dragged until the colour sits right."""
        start = L['a'][region].astype(np.float32)
        tgt = target[region].astype(np.float32)
        for k in range(1, steps + 1):
            t = k / steps
            t = t * t * (3 - 2 * t)
            L['a'][region] = np.clip(start + (tgt - start) * t + 0.5, 0, 255).astype(np.uint8)
            Doc.touch(L)
            self.tl.shot()
        self.tl.shot(hold_end)

    def fade(self, L, to, steps=6):
        a = L['opacity']
        for k in range(1, steps + 1):
            L['opacity'] = a + (to - a) * k / steps
            Doc.touch(L)
            self.tl.shot()

    def hide(self, L, hold=3, keep_hidden=True):
        L['visible'] = False
        L['keep_hidden'] = keep_hidden
        Doc.touch(L)
        self.tl.shot(hold)

    def move(self, L, mask, dx, dy, steps=6):
        """Lasso, then drag with the transform tool: the selection slides into place."""
        piece = np.where(mask[..., None], L['a'], 0)
        L['a'][mask] = 0
        base = L['a'].copy()
        for k in range(1, steps + 1):
            t = k / steps
            t = 1 - (1 - t) ** 2
            ox, oy = int(round(dx * t)), int(round(dy * t))
            moved = np.zeros_like(piece)
            mm = shift(mask, oy, ox)
            for c in range(4):
                moved[..., c] = shift(piece[..., c], oy, ox)
            L['a'] = base.copy()
            L['a'][mm] = moved[mm]
            Doc.touch(L)
            self.tl.shot()

    def snapshot(self, L):
        return L['a'].copy()

    def undo(self, L, snap, hold=2):
        L['a'] = snap
        Doc.touch(L)
        self.tl.shot(hold)

    def flip(self, hold=14):
        self.doc.flip = True
        self.tl.shot(hold)
        self.doc.flip = False
        self.tl.shot(2)


def silhouette_paths(mask, eps=1.6, down=2, minlen=4):
    """The outline of a shape as a few control polylines, as you'd sketch it."""
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return []
    y0, y1, x0, x1 = max(0, ys.min() - 2), ys.max() + 3, max(0, xs.min() - 2), xs.max() + 3
    sub = mask[y0:y1, x0:x1]
    if down > 1:
        hh, ww = (sub.shape[0] + down - 1) // down * down, (sub.shape[1] + down - 1) // down * down
        pad = np.zeros((hh, ww), bool)
        pad[:sub.shape[0], :sub.shape[1]] = sub
        sub = pad.reshape(hh // down, down, ww // down, down).mean((1, 3)) > 0.4
    out = []
    for c in chains(edge_of(sub)):
        if len(c) < minlen:
            continue
        pts = np.array([(x * down + down / 2.0 + x0, y * down + down / 2.0 + y0) for x, y in c])
        out.append(rdp(pts, eps))
    return out


def distort(paths, rng, centre, scale=0.04, rot=2.0, off=1.5):
    """Sketches never sit exactly where the finished thing ends up."""
    s = 1 + rng.gauss(0, scale)
    a = math.radians(rng.gauss(0, rot))
    ox, oy = rng.gauss(0, off), rng.gauss(0, off)
    cx, cy = centre
    out = []
    for p in paths:
        q = np.asarray(p, float) - (cx, cy)
        q = np.stack([q[:, 0] * math.cos(a) - q[:, 1] * math.sin(a), q[:, 0] * math.sin(a) + q[:, 1] * math.cos(a)], 1) * s
        out.append(q + (cx + ox, cy + oy))
    return out


# ---------------------------------------------------------------- the goat-dragon
def goat(out_dir):
    import wyvern as V
    s = V._state(lid=0.5, look=-1)
    s['oy'] = 0
    V.set_pose(0.0)
    P = V.draw(s, stages=True)
    a = P['a']
    fin_cv = P['final'].copy()
    V.jewelry(a, fin_cv)
    w, h = V.W, V.H

    def gesture(oy=0):
        G = lambda pts: [(x, y + oy) for x, y in pts]
        Lp = lambda pts: [V.LP(p, oy) for p in pts]
        return [G([(132, 140), (110, 87), (84, 63), (62, 59)]) + Lp([(-11, -4.5), (-45, 2), (-66, 10), (-71, 19)]),
                Lp([(-68, 25), (-52, 27.5), (-34, 32), (-12, 37)]),
                Lp([(-65, 30), (-50, 35), (-30, 38), (-8, 34), (0, 14)]),
                G([(58, 64), (61, 48), (72, 43), (80, 58)]), G([(65, 62), (69, 48), (79, 45), (85, 58)]),
                G([(74, 94), (78, 118), (72, 150)]), G([(122, 110), (134, 152)]),
                G([(64, 69), (84, 80)])]
    now = dict(g=gesture(), cr=V._cranium(0, 12), cl=V._construction_lines(0))
    V.ANG = math.radians(-18)                       # the first idea: the head held flat
    V.POLL = (66.0, 56.0)
    old = dict(g=gesture(), cr=V._cranium(0, 12), cl=V._construction_lines(0))
    V.set_pose(0.0)

    flats, two, render, tex = P['flats'].a, P['two'].a, P['render'].a, P['texture'].a
    final = fin_cv.a.copy()
    paper = PAL['paper4']
    solid = flats[..., 3] > 0
    lum = lambda x: x[..., :3].astype(int).sum(-1)
    diff = lambda x, y: (x[..., 3] > 0) & (np.abs(x[..., :3].astype(int) - y[..., :3].astype(int)).sum(-1) > 0)

    doc = Doc(w, h, paper)
    tl = Timelapse(doc, 4, os.path.join(out_dir, 'goat_dragon_timelapse.mp4'), gif_every=2)
    pn = Painter(doc, tl, 11)
    tl.shot(10)

    # 1 a first rough with the head held flat - faded down, then hidden
    R1 = doc.add('Rough 1')
    blue = (96, 140, 210)
    for c in old['g']:
        pn.curve(R1, c, seg=(30, 60), wob=1.3, over=6, color=blue, alpha=0.8)
    pn.curve(R1, old['cr'], closed=True, seg=(20, 40), wob=1.0, over=4, color=blue, alpha=0.8)
    for c in old['cl'][:3]:
        pn.curve(R1, c, seg=(20, 50), wob=0.6, over=5, color=blue, alpha=0.7)
    tl.shot(8)
    pn.flip(10)
    pn.fade(R1, 0.3)

    # 2 the second rough, at the real angle; a horn swept too tall, rubbed out, drawn again
    R2 = doc.add('Rough 2')
    for k, c in enumerate(now['g']):
        if k == 3:
            bad = [(58, 64), (60, 34), (82, 24), (101, 36)]
            m = pn.curve(R2, bad, seg=(40, 70), wob=1.2, over=5, color=blue, alpha=0.8)
            tl.shot(6)
            for piece in split_curve(resample(catmull(bad), 0.5), pn.rng, (14, 22)):
                pn.stroke(R2, piece[::3], size=3, erase=True, clip=grow(m, 1), wob=0.6)
            tl.shot(3)
        pn.curve(R2, c, seg=(30, 60), wob=1.3, over=6, color=blue, alpha=0.8)
    pn.curve(R2, now['cr'], closed=True, seg=(18, 40), wob=1.0, over=4, color=blue, alpha=0.8)
    for c in now['cl']:
        pn.curve(R2, c, seg=(20, 50), wob=0.6, over=5, color=blue, alpha=0.7)
    pn.hide(R1)
    pn.fade(R2, 0.4)

    # 3 the sketch: parts gone over, an eye too big, the jaw drawn low and moved after a flip
    S = doc.add('Sketch')
    ink = (70, 60, 72)
    jaw_mask = np.zeros((h, w), bool)
    for key in ('head', 'brow', 'muzzle', 'jaw', 'cheek', 'socket', 'eye', 'nostril', 'beard', 'ear_in', 'neck', 'spike'):
        pts = a['pts'][key]
        if key == 'eye':
            cx, cy = np.mean(pts, axis=0)
            big = [(cx + (x - cx) * 1.9, cy + (y - cy) * 1.7) for x, y in pts]
            m = pn.curve(S, big, closed=True, seg=(10, 20), wob=0.5, over=1.5, color=ink, alpha=0.85)
            tl.shot(8)
            for k in range(3):
                pn.stroke(S, [(cx - 7 + k * 5, cy - 6), (cx - 4 + k * 5, cy + 6), (cx - 1 + k * 5, cy - 6)],
                          size=3, erase=True, clip=grow(m, 1), wob=0.5)
            tl.shot(4)
        if key == 'jaw':
            low = [(x, y + 3) for x, y in pts]
            jaw_mask = pn.curve(S, low, closed=True, seg=(14, 32), passes=2, wob=0.8, over=3, color=ink, alpha=0.85)
            continue
        passes = 2 if key in ('head', 'beard', 'muzzle') else 1
        pn.curve(S, pts, closed=key not in ('spike',), seg=(14, 32), passes=passes, wob=0.8, over=2.5,
                 color=ink, alpha=0.85)
    for key, (pts, r) in a['lines'].items():
        c = np.array(V.spline(pts, closed=False))
        for side in (-1, 1):
            off = []
            for k, (x, y) in enumerate(c):
                q0, q1 = c[max(0, k - 1)], c[min(len(c) - 1, k + 1)]
                dx, dy = q1[0] - q0[0], q1[1] - q0[1]
                ln = math.hypot(dx, dy) or 1
                rr = r * (1 - 0.75 * k / max(1, len(c) - 1))
                off.append((x - dy / ln * rr * side, y + dx / ln * rr * side))
            off = np.array(off)[::max(1, len(off) // 10)]
            pn.curve(S, off, seg=(16, 34), wob=0.6, over=2, color=ink, alpha=0.85)
        rings = 7
        for k in range(1, rings):                                   # the horn's ridges
            i = int(k / rings * (len(c) - 1))
            q0, q1 = c[max(0, i - 1)], c[min(len(c) - 1, i + 1)]
            dx, dy = q1[0] - q0[0], q1[1] - q0[1]
            ln = math.hypot(dx, dy) or 1
            rr = r * (1 - 0.75 * i / max(1, len(c) - 1))
            x, y = c[i]
            pn.stroke(S, [(x - dy / ln * rr, y + dx / ln * rr), (x + dy / ln * rr * 0.9, y - dx / ln * rr * 0.9)],
                      color=ink, alpha=0.7, wob=0.3, over=0.8)
    for t in a['teeth']:
        for ch in chains(edge_of(t)):
            if len(ch) > 1:
                pn.stroke(S, ch, color=ink, alpha=0.8, raw=True, every=2)
    tl.shot(6)
    pn.flip(18)                                                     # the jaw hangs too low: lasso it, nudge it up
    pn.move(S, grow(jaw_mask, 0) & (S['a'][..., 3] > 0), 0, -3, steps=5)
    tl.shot(4)
    shade = V._shade_region(a)
    ys, xs = np.nonzero(shade)
    if len(ys):
        idx = np.argsort(xs + ys * 0.5)[::max(1, len(ys) // 70)]
        for i in idx:
            x, y = xs[i], ys[i]
            ln = pn.rng.uniform(3, 6)
            pn.stroke(S, [(x - ln * 0.5, y + ln * 0.5), (x + ln * 0.5, y - ln * 0.5)], color=ink, alpha=0.5,
                      wob=0.2, clip=shade, every=2)
    tl.shot(6)
    pn.hide(R2)
    pn.fade(S, 0.3)

    # 4 pixel line art: one run at a time, a run put down wrong and redone, doubled pixels cleaned up after
    Ln = doc.add('Lines')
    linec = rgb(V.INK)
    runs = []
    for ch in chains(P['ink']):
        for i in range(0, len(ch), 18):
            piece = ch[i:i + 19]
            if len(piece) >= 1:
                runs.append(piece)
    runs = nearest_order(runs, (10, 110), lambda r: r[0], lambda r: r[-1])
    extras = np.zeros((h, w), bool)
    for k, run in enumerate(runs):
        m = np.zeros((h, w), bool)
        arr = np.array(run)
        m[arr[:, 1], arr[:, 0]] = True
        if k == len(runs) // 3:
            wrong = shift(m, 1, 1)
            lay(Ln, wrong, linec)
            Doc.touch(Ln)
            tl.shot(5)
            rub(Ln, wrong & ~(Ln['a'][..., 3] > 0) | (wrong & ~m))
            Doc.touch(Ln)
            tl.shot(3)
        if k % 5 == 2 and len(run) > 4:                              # drawn quickly: a doubled corner
            j = len(run) // 2
            x, y = run[j]
            for dx_, dy_ in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                xx, yy = x + dx_, y + dy_
                if 0 <= xx < w and 0 <= yy < h and not P['ink'][yy, xx] and not m[yy, xx]:
                    extras[yy, xx] = True
                    m[yy, xx] = True
                    break
        lay(Ln, m, linec)
        Doc.touch(Ln)
        tl.tick(1)
    tl.shot(8)
    pn.flip(10)
    for (y, x) in zip(*np.nonzero(extras)):                          # zoomed in, pixel cleanup
        mm = np.zeros((h, w), bool)
        mm[y, x] = True
        rub(Ln, mm)
        Doc.touch(Ln)
        tl.tick(2)
    stray = P['ink'] & (final[..., 3] == 0)
    for ch in chains(stray):
        mm = np.zeros((h, w), bool)
        arr = np.array(ch)
        mm[arr[:, 1], arr[:, 0]] = True
        rub(Ln, mm)
        Doc.touch(Ln)
        tl.tick(2)
    tl.shot(6)

    # 5 flats under the lines: bucket fills; the fur first tried brown, then slid to white
    Fl = doc.add('Flats', below=Ln)
    fur = solid & (a['head'] | a['neck'] | a['jaw'] | a['brow'] | a['cheek'])
    brown = np.zeros_like(flats)
    brown[..., :3] = rgb('wood2')
    brown[..., 3] = 255
    pn.fill(Fl, fur, src=brown, hold=6)
    tan = np.zeros_like(flats)
    tan[..., :3] = rgb('wood3')
    tan[..., 3] = 255
    pn.adjust(Fl, fur, tan, steps=8, hold_end=8)
    pn.adjust(Fl, fur, flats, steps=12, hold_end=6)
    for key in ('horn_near', 'horn_far', 'spike', 'beard', 'muzzle', 'mane', 'eye', 'socket', 'plates', 'belly',
                'frills', 'spurs', 'mouth', 'nostril', 'ear_in', 'throat'):
        if key in a:
            m = solid & a[key] & ~(Fl['a'][..., 3] > 0)
            if m.sum() > 2:
                pn.fill(Fl, m, src=flats, hold=2)
    rest = solid & ~(Fl['a'][..., 3] > 0)
    if rest.any():
        pn.fill(Fl, rest, src=flats, hold=2)
    pn.hide(S)

    # 6 shading, clipped to the flats: a patch on the wrong side and erased, two-tone shapes, then rendered
    Sh = doc.add('Shading', below=Ln)
    wrong = solid & (np.abs(np.mgrid[0:h, 0:w][1] - 46) < 7) & (np.abs(np.mgrid[0:h, 0:w][0] - 94) < 6)
    pn.scribble(Sh, wrong, 2, 0.6, color=two[wrong][0][:3] if wrong.any() else 'stone2', frames=5, touch=False)
    tl.shot(6)
    pn.scribble(Sh, grow(wrong, 1) & (Sh['a'][..., 3] > 0), 4, 0.6, color=(0, 0, 0), frames=3, touch=False)
    rub(Sh, wrong | grow(wrong, 2))
    Doc.touch(Sh)
    tl.shot(3)
    dark2 = diff(two, flats)
    dark_r = diff(render, flats) & (lum(render) < lum(flats))
    light_r = diff(render, flats) & (lum(render) >= lum(flats))
    pn.scribble(Sh, dark2, 2.5, math.radians(60), src=two, frames=40, max_len=22, rows=(2, 4))
    tl.shot(6)
    pn.scribble(Sh, dark2 | dark_r, 1.5, math.radians(35), src=render, frames=45, max_len=14, rows=(1, 3))
    tl.shot(6)
    # highlights pushed too bright, then pulled back
    Hi = doc.add('Highlights', below=Ln)
    hot = render.copy()
    hot[..., :3] = np.clip(render[..., :3].astype(int) * 0.45 + 255 * 0.55, 0, 255).astype(np.uint8)
    pn.scribble(Hi, light_r, 1.5, math.radians(-30), src=hot, frames=25, max_len=12, rows=(1, 3))
    tl.shot(10)
    pn.adjust(Hi, light_r & (Hi['a'][..., 3] > 0), render, steps=10, hold_end=6)

    # 7 fur and scales: short strokes that follow the hair
    T = doc.add('Fur & scales', below=Ln)
    texm = diff(tex, render) | ((tex[..., 3] > 0) & (render[..., 3] == 0))
    flow = [('horn_near', 120), ('horn_far', 120), ('beard', 95), ('mane', 70), ('neck', 80), ('jaw', 170),
            ('muzzle', 175), ('head', 190), ('brow', 200), ('cheek', 160)]
    done = np.zeros((h, w), bool)
    for key, ang in flow:
        if key not in a:
            continue
        m = texm & a[key] & ~done
        if m.sum() < 3:
            continue
        pn.scribble(T, m, 1.0, math.radians(ang), src=tex, frames=max(4, int(m.sum() / 40)), max_len=7, rows=(1, 2),
                    wob=0.35)
        done |= m
    m = texm & ~done
    if m.any():
        pn.scribble(T, m, 1.0, math.radians(45), src=tex, frames=max(4, int(m.sum() / 40)), max_len=7, rows=(1, 2))
    tl.shot(6)

    # 8 the lines coloured into the form (alpha lock), then the last details
    pn.scribble(Ln, Ln['a'][..., 3] > 0, 1.5, math.radians(20), src=final, frames=25, max_len=10, rows=(1, 2))
    D = doc.add('Details')
    cur = doc.composite()
    want = final[..., 3] > 0
    over_paper = final[..., :3].astype(int)
    det = want & (np.abs(cur.astype(int) - over_paper).sum(-1) > 0)
    pn.scribble(D, det, 1.0, math.radians(10), src=final, frames=40, max_len=6, rows=(1, 2), wob=0.3)
    gone = (final[..., 3] == 0)
    for L in doc.layers[1:]:
        if L['visible']:
            rub(L, gone)
            Doc.touch(L)
    tl.shot(4)
    pn.flip(16)
    tl.shot(int(FPS * 2.5))
    n = tl.close(os.path.join(out_dir, 'goat_dragon_timelapse.gif'), 3)
    save_psd(doc, os.path.join(out_dir, 'goat_dragon_layers.psd'), 4)
    Image.fromarray(doc.composite()).resize((w * 4, h * 4), Image.NEAREST).save(
        os.path.join(out_dir, 'goat_dragon_final.png'))
    ref = np.where(final[..., 3:4] > 0, final[..., :3], np.array(paper, np.uint8))
    print('goat-dragon: %d frames (%.1f s), matches model: %s' % (n, n / FPS, bool((doc.composite() == ref).all())))


# ---------------------------------------------------------------- a room
NAMES = {0: 'room1_cook_room', 1: 'room2_seating_room', 2: 'room3_counter_room', 3: 'room4_bedroom'}


def room_pieces(sc, ri):
    """The finished room taken apart: outside layers, walls, each prop, posts, light."""
    import build
    import layout as LY
    import propkit
    cam = ri * LY.SW
    w = LY.SW
    crop = lambda cv: cv.a[:, cam:cam + w].copy()
    blank = lambda: Canvas(LY.W, LY.H)
    outs = []
    for name, frames, fac, *off in sc.outs:
        c = blank()
        origin = int(round(cam * (1 - fac)))
        ox, oy = off[0] if off else (0, 0)
        x = origin % 1280 - 1280
        while x < LY.W:
            c.blit(frames[0], x + ox, oy)
            x += 1280
        nice = {'00_sky': 'Sky', '01_clouds': 'Clouds', '02_mountains': 'Mountains', '03_lake': 'Lake',
                '05_hills_trees': 'Far shore', '06_garden_trees': 'Garden trees',
                '07_flowers_close': 'Flower bed'}.get(name)          # birds, fish and drift are animation only
        if nice:
            outs.append((nice, crop(c)))
    props = []
    for layer in build.LAYER_ORDER:
        if layer == 'counter_layer':
            cc = crop(sc.counter)
            if (cc[..., 3] > 0).any():
                props.append(('Counter', cc))
            continue
        for p in sc.props:
            if p['layer'] == layer and p.get('preview', True) and p['room'] == ri + 1 and p['layer'] != 'outside':
                c = blank()
                c.blit(p['frames'][0], p['sx'], p['sy'])
                props.append((p['name'].replace('_', ' '), crop(c)))
    extra = None
    for e in propkit.PROPS:
        if e['room'] == ri + 1 and not e['preview'] and e['layer'] in ('wall', 'floor', 'counter'):
            out = e['fn']()
            fr = out[0] if isinstance(out, list) else (next(iter(out.values()))[0] if isinstance(out, dict) else out)
            if isinstance(fr, list):
                fr = fr[0]
            c = blank()
            c.blit(fr, e['x'], e['y'])
            extra = (e['name'].replace('_', ' '), crop(c))
            break
    return dict(outs=outs, shell=crop(sc.shell), props=props, extra=extra, fg=crop(sc.fg[0]),
                light=crop(sc.light[0]) if isinstance(sc.light, list) else crop(sc.light),
                final=sc.view(0, cam, light=True).a.copy())


def room(d, ri, out_dir):
    import layout as LY
    w, h = LY.SW, LY.SH
    rng = random.Random(200 + ri)
    name = NAMES[ri]
    final = d['final']
    shell = d['shell']
    paper = (244, 240, 230)
    doc = Doc(w, h, paper)
    tl = Timelapse(doc, 2, os.path.join(out_dir, name + '_timelapse.mp4'), gif_every=3)
    pn = Painter(doc, tl, 300 + ri)
    tl.shot(8)
    VX, VY = w / 2.0, LY.EYE_Y
    BX0, BX1, TOP, FL = LY.BX, w - LY.BX, LY.WALL_TOP, LY.FLOOR
    corners = [(BX0, TOP), (BX1, TOP), (BX0, FL), (BX1, FL)]

    def to_edge(px, py):
        dx, dy = px - VX, py - VY
        t = min([v for v in ((-VX / dx) if dx < 0 else ((w - 1 - VX) / dx) if dx > 0 else 1e9,
                             (-VY / dy) if dy < 0 else ((h - 1 - VY) / dy) if dy > 0 else 1e9) if v > 0])
        return (VX + dx * t, VY + dy * t)

    # 1 perspective: horizon and rays from the vanishing point; one ray undone
    Pg = doc.add('Perspective')
    blue = (110, 150, 215)
    pn.stroke(Pg, [(0, VY), (w - 1, VY)], color=blue, alpha=0.7, wob=0.25)
    rays = corners + [(VX - 150, 0), (VX + 150, 0), (VX - 200, h - 1), (VX + 200, h - 1)]
    for k, (px, py) in enumerate(rays):
        if k == 2:
            snap = pn.snapshot(Pg)
            pn.stroke(Pg, [(VX, VY), to_edge(px + 60, py + 20)], color=blue, alpha=0.7, wob=0.2)
            tl.shot(4)
            pn.undo(Pg, snap, 2)
        pn.stroke(Pg, [(VX, VY), to_edge(px, py)], color=blue, alpha=0.7, wob=0.2)
    tl.shot(4)

    # 2 rough sketch: the box of the room, the windows, then every piece - one drawn in
    #   the wrong spot and dragged over, one idea sketched and rubbed out
    R = doc.add('Rough')
    dk = (72, 58, 66)
    ra = 0.75
    box = [[(BX0, TOP), (BX1, TOP)], [(BX1, TOP), (BX1, FL)], [(BX1, FL), (BX0, FL)], [(BX0, FL), (BX0, TOP)]]
    for c in box:
        pn.curve(R, c, seg=(60, 140), wob=0.8, over=6, color=dk, alpha=ra)
    for c in corners:
        e = to_edge(*c)
        pn.curve(R, [c, e], seg=(50, 120), wob=0.7, over=4, color=dk, alpha=ra)
    for yy in (LY.RAIL[0], LY.WAINS[1], LY.CEIL_Y):
        pn.curve(R, [(BX0 - 2, yy), (BX1 + 2, yy)], seg=(70, 160), wob=0.8, over=5, color=dk, alpha=ra * 0.8)
    holes = (shell[..., 3] < 255)
    for c in silhouette_paths(grow(holes, 3), eps=2.0, down=3, minlen=5):
        pn.curve(R, c, seg=(20, 50), passes=2, wob=0.9, over=3, color=dk, alpha=ra, every=2)
    props = [(nm, img) for nm, img in d['props'] if (img[..., 3] > 0).sum() > 30]
    moved_i = None
    for i, (nm, img) in enumerate(props):
        m = img[..., 3] > 0
        area = m.sum()
        paths = silhouette_paths(m, eps=2.2 if area > 3000 else 1.5, down=2 if area > 600 else 1, minlen=4)
        ys, xs = np.nonzero(m)
        paths = distort(paths, rng, (xs.mean(), ys.mean()), scale=0.03, rot=1.5, off=1.5)
        every = 2 if area > 2000 else 1
        if moved_i is None and 1500 < area < 20000 and i > 0:
            moved_i = i
            dx = 46 if xs.mean() < w / 2 else -46
            tmp = doc.add('Rough (copy)')
            for pth in paths:
                pn.curve(tmp, np.asarray(pth) - (dx, 0), seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=every)
            tl.shot(6)
            pn.move(tmp, tmp['a'][..., 3] > 0, dx, 0, steps=7)
            tl.shot(3)
            mm = tmp['a'][..., 3] > 0
            R['a'][mm] = tmp['a'][mm]
            doc.remove(tmp)
            Doc.touch(R)
            continue
        for pth in paths:
            pn.curve(R, pth, seg=(16, 40), wob=0.8, over=3, color=dk, alpha=ra, every=every)
        if i == len(props) // 2:                                    # an idea tried and rubbed out
            ex, ey = rng.randint(120, w - 200), rng.randint(90, 160)
            snap_m = np.zeros((h, w), bool)
            for c in ([(ex, ey), (ex + 70, ey + 2)], [(ex + 70, ey + 2), (ex + 68, ey + 46)],
                      [(ex + 68, ey + 46), (ex - 1, ey + 44)], [(ex - 1, ey + 44), (ex, ey)],
                      [(ex + 6, ey + 14), (ex + 62, ey + 15)], [(ex + 30, ey + 2), (ex + 32, ey + 44)]):
                snap_m |= pn.curve(R, c, seg=(30, 80), wob=0.8, over=4, color=dk, alpha=ra)
            tl.shot(10)
            region = grow(snap_m, 2)
            pn.scribble(R, region, 6, math.radians(20), color=(0, 0, 0), frames=6, clip=True, touch=False, rows=(3, 6))
            rub(R, region)
            Doc.touch(R)
            tl.shot(3)
    tl.shot(8)
    pn.fade(Pg, 0.3)
    pn.flip(14)

    # 3 colour rough under the sketch: big loose strokes of each local colour
    Cr = doc.add('Colour rough', below=Pg)
    yy, xx = np.mgrid[0:h, 0:w]
    inside = (xx >= BX0) & (xx <= BX1) & (yy >= TOP) & (yy <= FL)
    ang = np.arctan2(yy - VY, xx - VX)
    a_c = [math.atan2(cy - VY, cx - VX) for cx, cy in corners]           # TL, TR, BL, BR
    ceil_ = ~inside & (ang > a_c[0] - 2 * math.pi) & (ang < a_c[1]) & (yy < TOP)
    floor_ = ~inside & (yy > FL) & (ang > a_c[3]) & (ang < a_c[2])
    left_ = ~inside & (xx < BX0) & ~ceil_ & ~floor_
    right_ = ~inside & (xx > BX1) & ~ceil_ & ~floor_
    sh_m = shell[..., 3] > 0
    regions = [('back', inside & sh_m, 9, 90), ('ceiling', ceil_ & sh_m, 9, 0), ('floor', floor_ & sh_m, 9, 0),
               ('left', left_ & sh_m, 9, 70), ('right', right_ & sh_m, 9, 110)]
    sky = d['outs'][0][1] if d['outs'] else final
    for k, (nm, m, sz, an) in enumerate(regions):
        if m.sum() < 50:
            continue
        col = mean_colour(shell, m)
        if nm == 'back':                                              # first too cold and too strong
            cold = (int(col[0] * 0.7), int(col[1] * 0.85), min(255, int(col[2] * 1.35 + 30)))
            pn.scribble(Cr, m, sz, math.radians(an), color=cold, frames=14, clip=True, touch=False, rows=(3, 6),
                        max_len=120, spacing=0.6, wob=0.6)
            tl.shot(10)
            tgt = Cr['a'].copy()
            tgt[..., :3] = col
            pn.adjust(Cr, m & (Cr['a'][..., 3] > 0), tgt, steps=10, hold_end=4)
        else:
            pn.scribble(Cr, m, sz, math.radians(an), color=col, frames=8, clip=False, touch=False, rows=(3, 6),
                        max_len=120, spacing=0.6, wob=0.6)
    if holes.any():
        pn.scribble(Cr, holes, 7, 0.0, color=mean_colour(sky, holes), frames=6, clip=False, touch=False, rows=(2, 5),
                    spacing=0.6, wob=0.6)
    for nm, img in props:
        m = img[..., 3] > 0
        sz = 5 if m.sum() > 3000 else 3
        pn.scribble(Cr, m, sz, math.radians(rng.choice((30, 60, 120, 150))), color=mean_colour(img, m),
                    frames=max(2, int(math.sqrt(m.sum()) / 14)), clip=False, touch=False, rows=(2, 5), spacing=0.65, wob=0.5)
    tl.shot(10)
    pn.flip(12)

    # 4 the walls, floor and ceiling: value shapes first, then rendered; a few strokes undone
    Wl = doc.add('Walls, floor & ceiling', below=Pg)
    for k, (nm, m, sz, an) in enumerate(regions):
        if m.sum() < 50:
            continue
        tn = tones(shell, m, k=4, smooth=7)
        pn.scribble(Wl, m, 6, math.radians(an), src=tn, frames=10, max_len=70, rows=(2, 4))
    tl.shot(6)
    for k, (nm, m, sz, an) in enumerate(regions):
        if m.sum() < 50:
            continue
        if k == 1:
            snap = pn.snapshot(Wl)
            pn.scribble(Wl, m & (yy < TOP - 4), 3, math.radians(an + 30), color=(40, 26, 22), frames=4, touch=False,
                        rows=(2, 3))
            tl.shot(4)
            pn.undo(Wl, snap, 3)
        pn.scribble(Wl, m, 3, math.radians(an), src=shell, frames=22, max_len=40, rows=(1, 3))
    tl.shot(6)

    # 5 the view through the windows, layer by layer under the walls; what the walls
    #   hide is filled in after, for the parallax
    vis = grow(holes, 2)
    for nm, img in d['outs']:
        Lo = doc.add(nm, below=Wl)
        m = img[..., 3] > 0
        big = nm in ('Sky', 'Lake')
        sz = {'Sky': 9, 'Clouds': 4, 'Mountains': 3, 'Lake': 5, 'Far shore': 3, 'Garden trees': 2,
              'Flower bed': 2}.get(nm, 3)
        mv = m & vis
        if nm in ('Clouds', 'Mountains', 'Garden trees', 'Far shore'):
            pn.scribble(Lo, mv, sz + 2, math.radians(rng.choice((10, -15, 30))), src=tones(img, m, 3, 5), frames=5,
                        max_len=40, rows=(2, 3))
        pn.scribble(Lo, mv, sz, 0.0 if big else math.radians(rng.choice((15, -20, 40, 70))), src=img,
                    frames=10 if big else 8, max_len=100 if big else 30, rows=(2, 4) if big else (1, 3))
        reveal(Lo, img, m)
        Doc.touch(Lo)
    tl.shot(6)
    pn.fade(R, 0.45)

    # 6 every piece on its own layer: flat, then light and shadow, then the detail
    deleted = False
    for i, (nm, img) in enumerate(props):
        m = img[..., 3] > 0
        area = int(m.sum())
        L = doc.add(nm, below=R)
        flat = np.zeros_like(img)
        flat[m, :3] = mean_colour(img, m)
        flat[m, 3] = 255
        if nm == 'Counter' and ri in (1, 2):                         # the counter first painted too light
            pale = img.copy()
            pale[m, :3] = np.clip(img[m, :3].astype(int) * 0.8 + 70, 0, 255).astype(np.uint8)
            pn.fill(L, m, src=tones(pale, m, 3, 7), hold=2)
            pn.scribble(L, m, 2.5, math.radians(10), src=pale, frames=24, max_len=40, rows=(1, 3))
            tl.shot(8)
            pn.adjust(L, m, img, steps=12, hold_end=6)
            continue
        pn.fill(L, m, src=flat, hold=1)
        f1 = max(2, int(math.sqrt(area) / 10))
        f2 = max(3, int(math.sqrt(area) / 5))
        an = rng.choice((25, 60, 115, 150, 0, 90))
        if area > 150:
            pn.scribble(L, m, 3 if area > 2500 else 2, math.radians(an), src=tones(img, m, 3, 5), frames=f1,
                        max_len=40, rows=(2, 3))
        pn.scribble(L, m, 2 if area > 2500 else 1.5, math.radians(an + rng.choice((-30, 30))), src=img, frames=f2,
                    max_len=24 if area > 2500 else 12, rows=(1, 3))
        reveal(L, img, m)
        Doc.touch(L)
        if not deleted and d['extra'] is not None and i > len(props) // 2:
            enm, eimg = d['extra']
            em = eimg[..., 3] > 0
            if em.any():
                Le = doc.add(enm, below=R)
                ef = np.zeros_like(eimg)
                ef[em, :3] = mean_colour(eimg, em)
                ef[em, 3] = 255
                pn.fill(Le, em, src=ef, hold=1)
                pn.scribble(Le, em, 2, math.radians(45), src=eimg, frames=max(3, int(math.sqrt(em.sum()) / 6)),
                            max_len=16, rows=(1, 3))
                tl.shot(12)
                Le['visible'] = False
                Doc.touch(Le)
                tl.shot(10)
                doc.remove(Le)
                tl.shot(2)
            deleted = True
        if i == int(len(props) * 0.7):
            pn.flip(12)
    # 7 posts in front, then the light
    Fg = doc.add('Posts', below=R)
    fm = d['fg'][..., 3] > 0
    if fm.any():
        pn.fill(Fg, fm, src=tones(d['fg'], fm, 2, 5), hold=2)
        pn.scribble(Fg, fm, 2, math.radians(90), src=d['fg'], frames=10, max_len=30, rows=(1, 3))
        reveal(Fg, d['fg'], fm)
    Lt = doc.add('Light', below=R)
    lm = d['light'][..., 3] > 0
    if lm.any():
        pn.scribble(Lt, lm, 12, math.radians(20), src=d['light'], frames=14, max_len=120, rows=(2, 4))
        reveal(Lt, d['light'], lm)
        Doc.touch(Lt)
    pn.hide(R, 4)
    pn.hide(Pg, 2)
    Cr['keep_hidden'] = True
    tl.shot(6)
    pn.flip(16)
    tl.shot(int(FPS * 2.5))
    n = tl.close(os.path.join(out_dir, name + '_timelapse.gif'), 1)
    save_psd(doc, os.path.join(out_dir, name + '_layers.psd'), 2)
    comp = doc.composite()
    Image.fromarray(comp).resize((w * 2, h * 2), Image.NEAREST).save(os.path.join(out_dir, name + '_final.png'))
    print('%s: %d frames (%.1f s), %d layers, max diff from the room: %d' % (
        name, n, n / FPS, len(doc.layers), int(np.abs(comp.astype(int) - final[..., :3]).max())))


def main(out_dir, which=('goat', 0, 1, 2, 3), cache=None):
    os.makedirs(out_dir, exist_ok=True)
    if 'goat' in which:
        goat(out_dir)
    rooms = [r for r in which if r != 'goat']
    sc = None
    for ri in rooms:
        path = cache and os.path.join(cache, 'room%d.pkl' % ri)
        if path and os.path.exists(path):
            d = pickle.load(open(path, 'rb'))
        else:
            if sc is None:
                import build
                sc = build.Scene()
            d = room_pieces(sc, ri)
            if path:
                pickle.dump(d, open(path, 'wb'))
        room(d, ri, out_dir)


if __name__ == '__main__':
    args = [a for a in sys.argv[2:] if not a.startswith('--cache=')]
    cache = next((a[8:] for a in sys.argv[2:] if a.startswith('--cache=')), None)
    which = tuple('goat' if a == 'goat' else int(a) for a in args) if args else ('goat', 0, 1, 2, 3)
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'process'), which, cache)
