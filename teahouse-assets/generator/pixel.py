"""Tiny pixel-art engine: one fixed palette, hue-shifted ramps, crisp primitives.

Every colour that ends up in an asset comes from PAL. Lighting is done by
stepping a colour up/down its ramp (never by blending), so the art keeps a
hand-made, limited-palette look. Overlays that need alpha (light shafts) are
kept in their own layer.
"""
import random
import numpy as np
from PIL import Image

# ---------------------------------------------------------------- palette
# Ramps run dark -> light and hue-shift (shadows lean purple/red, lights
# lean yellow), the usual hand-pixelled way.
RAMPS = {
    'ink':   [(20, 12, 18), (38, 22, 30)],
    'wood':  [(34, 20, 24), (52, 30, 31), (74, 43, 37), (99, 61, 43),
              (128, 84, 53), (161, 112, 68), (198, 150, 94)],
    'red':   [(56, 17, 27), (88, 27, 35), (122, 38, 41), (156, 52, 46),
              (190, 75, 56), (222, 112, 78)],
    'jade':  [(20, 44, 46), (30, 70, 62), (44, 102, 80), (68, 138, 98),
              (108, 175, 120), (166, 210, 152)],
    'gold':  [(82, 54, 26), (138, 96, 36), (194, 146, 56), (234, 198, 96),
              (252, 234, 168)],
    'paper': [(96, 78, 62), (138, 116, 88), (182, 160, 120), (216, 198, 154),
              (240, 228, 194)],
    'sky':   [(40, 76, 132), (52, 110, 178), (74, 150, 214), (118, 190, 232),
              (176, 224, 244)],
    'cloud': [(118, 126, 156), (166, 174, 198), (212, 218, 230), (248, 248, 242)],
    'smoke': [(48, 50, 64), (74, 78, 94), (104, 108, 124)],
    'haze':  [(70, 100, 146), (102, 138, 180), (140, 176, 208), (178, 206, 226)],
    'leaf':  [(18, 40, 34), (30, 70, 46), (46, 104, 50), (80, 142, 54),
              (128, 182, 66), (180, 214, 98)],
    # reddish tree bark (twisted trunks), hue-shifted to plum in the shadows
    'bark':  [(44, 22, 36), (76, 36, 48), (110, 52, 58), (146, 74, 70),
              (180, 104, 88), (210, 142, 114)],
    'pink':  [(106, 38, 70), (166, 70, 104), (220, 120, 148), (246, 174, 190),
              (252, 222, 226)],
    'purp':  [(48, 34, 72), (86, 64, 120), (130, 104, 172), (178, 156, 214)],
    'alien': [(24, 58, 32), (50, 110, 38), (96, 166, 46), (154, 218, 72),
              (214, 250, 140)],
    'stone': [(42, 40, 52), (66, 64, 78), (98, 94, 106), (138, 132, 140),
              (184, 178, 176)],
    'water': [(28, 62, 96), (42, 96, 132), (74, 138, 170)],
    'fire':  [(88, 22, 30), (150, 38, 32), (208, 72, 34), (240, 128, 44), (252, 198, 80),
              (255, 244, 190)],
    # Japanese indigo cloth (noren, cushions) and old copper (hood, pots)
    'indigo': [(20, 24, 48), (32, 42, 80), (48, 66, 116), (76, 100, 150), (118, 144, 184)],
    'copper': [(58, 28, 26), (100, 46, 32), (148, 76, 44), (194, 114, 64), (232, 164, 104)],
    'teal':  [(26, 58, 70), (40, 90, 100), (64, 128, 132), (104, 168, 162)],
    # Uncle Pong: slate-blue fireback plumage-fur, and the bird's scarlet face skin
    'pong':  [(24, 24, 44), (40, 44, 72), (62, 70, 104), (90, 102, 138), (126, 140, 176), (172, 184, 212)],
    'scarlet': [(96, 18, 36), (156, 28, 44), (206, 48, 54), (236, 92, 78), (252, 152, 126)],
    # the Siamese fireback: vermiculated silver-grey plumage, glossy blue-black underparts
    'fgrey': [(36, 38, 52), (66, 70, 88), (102, 108, 128), (142, 148, 166), (186, 190, 204), (228, 230, 236)],
    'gloss': [(12, 10, 22), (26, 24, 44), (42, 42, 78), (64, 70, 124), (98, 110, 176)],
    # the fat window dragon: soft lilac scales
    'lilac': [(58, 40, 86), (98, 74, 138), (140, 114, 190), (184, 160, 226), (222, 206, 246)],
    # pale hinoki cypress (the v3 serving counter)
    'hinoki': [(96, 64, 46), (140, 100, 66), (184, 140, 90), (214, 176, 118), (236, 208, 152), (250, 234, 192)],
}

PAL = {}
for _ramp, _cols in RAMPS.items():
    for _i, _c in enumerate(_cols):
        PAL[f'{_ramp}{_i}'] = _c
PAL['ink'] = RAMPS['ink'][0]
PAL['white'] = RAMPS['cloud'][3]

LOOKUP = {}  # rgb -> (ramp, index)
for _ramp, _cols in RAMPS.items():
    for _i, _c in enumerate(_cols):
        LOOKUP.setdefault(_c, (_ramp, _i))


def col(c):
    """Accept a palette name or an rgb tuple; return rgba."""
    if c is None:
        return (0, 0, 0, 0)
    if isinstance(c, str):
        r, g, b = PAL[c]
        return (r, g, b, 255)
    if len(c) == 3:
        return (c[0], c[1], c[2], 255)
    return tuple(c)


def step(rgb, n):
    """Move a colour n steps along its ramp (negative = darker)."""
    key = tuple(int(v) for v in rgb[:3])
    if key not in LOOKUP:
        return key
    ramp, i = LOOKUP[key]
    cols = RAMPS[ramp]
    return cols[max(0, min(len(cols) - 1, i + n))]


def darkest(rgb):
    key = tuple(int(v) for v in rgb[:3])
    if key not in LOOKUP:
        return RAMPS['ink'][0]
    ramp, _ = LOOKUP[key]
    return RAMPS[ramp][0]


# ---------------------------------------------------------------- canvas
class Canvas:
    def __init__(self, w, h, fill=None, wrap=False):
        self.w, self.h = w, h
        self.wrap = wrap
        self.a = np.zeros((h, w, 4), np.uint8)
        if fill is not None:
            self.a[:, :] = col(fill)

    # -- basic access
    def inb(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def px(self, x, y, c):
        x, y = int(x), int(y)
        if self.wrap:
            x %= self.w
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = col(c)

    def get(self, x, y):
        x, y = int(x), int(y)
        if self.wrap:
            x %= self.w
        if 0 <= x < self.w and 0 <= y < self.h:
            return tuple(int(v) for v in self.a[y, x])
        return (0, 0, 0, 0)

    def opaque(self, x, y):
        return self.get(x, y)[3] > 0

    # -- primitives
    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.px(xx, yy, c)

    def frame(self, x, y, w, h, c):
        self.hline(x, x + w - 1, y, c)
        self.hline(x, x + w - 1, y + h - 1, c)
        self.vline(x, y, y + h - 1, c)
        self.vline(x + w - 1, y, y + h - 1, c)

    def hline(self, x0, x1, y, c):
        if x1 < x0:
            x0, x1 = x1, x0
        for x in range(int(x0), int(x1) + 1):
            self.px(x, y, c)

    def vline(self, x, y0, y1, c):
        if y1 < y0:
            y0, y1 = y1, y0
        for y in range(int(y0), int(y1) + 1):
            self.px(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def ellipse(self, cx, cy, rx, ry, c, outline=None):
        """Filled ellipse centred on (cx, cy); half-pixel centres allowed."""
        rx, ry = max(rx, 0.5), max(ry, 0.5)
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                dx = (x + 0.5 - cx) / rx
                dy = (y + 0.5 - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    self.px(x, y, c)
        if outline:
            for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
                for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                    if self._in_ell(x, y, cx, cy, rx, ry) and not all(
                            self._in_ell(x + ox, y + oy, cx, cy, rx, ry)
                            for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        self.px(x, y, outline)

    @staticmethod
    def _in_ell(x, y, cx, cy, rx, ry):
        dx = (x + 0.5 - cx) / rx
        dy = (y + 0.5 - cy) / ry
        return dx * dx + dy * dy <= 1.0

    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        n = len(pts)
        for y in range(int(min(ys)), int(max(ys)) + 1):
            yc = y + 0.5
            xs = []
            for i in range(n):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % n]
                if (y0 <= yc < y1) or (y1 <= yc < y0):
                    xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(round(xs[i])), int(round(xs[i + 1]))):
                    self.px(x, y, c)

    def dither(self, x, y, w, h, c, phase=0, density=2):
        """Checker (density 2) or sparse 1-in-4 (density 4) dither fill."""
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                if density == 2 and (xx + yy + phase) % 2 == 0:
                    self.px(xx, yy, c)
                elif density == 4 and (xx % 2 == (phase % 2)) and ((yy + xx // 2 + phase // 2) % 2 == 0):
                    self.px(xx, yy, c)

    # -- compositing
    def blit(self, other, x, y, flip=False):
        src = other.a[:, ::-1] if flip else other.a
        h, w = src.shape[:2]
        x, y = int(x), int(y)
        if self.wrap:
            for yy in range(h):
                ty = y + yy
                if not 0 <= ty < self.h:
                    continue
                for xx in range(w):
                    if src[yy, xx, 3]:
                        self.a[ty, (x + xx) % self.w] = src[yy, xx]
            return
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(self.w, x + w), min(self.h, y + h)
        if x0 >= x1 or y0 >= y1:
            return
        s = src[y0 - y:y1 - y, x0 - x:x1 - x]
        d = self.a[y0:y1, x0:x1]
        full = s[:, :, 3] == 255
        d[full] = s[full]
        part = (s[:, :, 3] > 0) & ~full
        if part.any():                    # semi-transparent (shadows): blend over
            sa = s[part][:, 3:4].astype(np.float32) / 255.0
            dd = d[part].astype(np.float32)
            empty = dd[:, 3] == 0
            rgb = np.where(empty[:, None], s[part][:, :3], s[part][:, :3] * sa + dd[:, :3] * (1 - sa))
            al = np.where(empty, s[part][:, 3], np.maximum(dd[:, 3], s[part][:, 3]))
            d[part] = np.concatenate([rgb, al[:, None]], axis=1).astype(np.uint8)

    def copy(self):
        c = Canvas(self.w, self.h, wrap=self.wrap)
        c.a = self.a.copy()
        return c

    def crop(self, x, y, w, h):
        c = Canvas(w, h)
        c.a = self.a[y:y + h, x:x + w].copy()
        return c

    def trim(self):
        """Crop to opaque bounds; returns (canvas, dx, dy)."""
        ys, xs = np.nonzero(self.a[:, :, 3])
        if len(xs) == 0:
            return self, 0, 0
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        return self.crop(x0, y0, x1 - x0, y1 - y0), int(x0), int(y0)

    # -- palette-true lighting
    def shift(self, x, y, n, only=None):
        """Step one pixel along its ramp. `only` limits to given ramp names."""
        p = self.get(x, y)
        if p[3] == 0:
            return
        key = p[:3]
        if only is not None and LOOKUP.get(key, ('?',))[0] not in only:
            return
        self.px(x, y, step(key, n))

    def shift_rect(self, x, y, w, h, n, dither_edge=False, only=None):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.shift(xx, yy, n, only)

    def shift_mask(self, mask, n, only=None):
        """mask: callable(x, y) -> bool, applied over the whole canvas."""
        for yy in range(self.h):
            for xx in range(self.w):
                if mask(xx, yy):
                    self.shift(xx, yy, n, only)

    def shift_where(self, m, n, only=None):
        """m: bool numpy array (h, w). Vectorised ramp step."""
        ys, xs = np.nonzero(m)
        for y, x in zip(ys, xs):
            self.shift(x, y, n, only)

    def outline(self, c='ink', selective=True, corners=False):
        """1px outline around opaque pixels. Selective = darkest of the
        neighbour's ramp (sel-out), the usual pro pixel-art trick."""
        a = self.a
        h, w = a.shape[:2]
        alpha = a[:, :, 3] > 0
        new = a.copy()
        nbrs = [(1, 0), (-1, 0), (0, 1), (0, -1)]
        if corners:
            nbrs += [(1, 1), (-1, 1), (1, -1), (-1, -1)]
        for y in range(h):
            for x in range(w):
                if alpha[y, x]:
                    continue
                for ox, oy in nbrs:
                    nx, ny = x + ox, y + oy
                    if 0 <= nx < w and 0 <= ny < h and alpha[ny, nx]:
                        if selective:
                            new[y, x] = col(darkest(a[ny, nx]))
                        else:
                            new[y, x] = col(c)
                        break
        self.a = new

    def padded(self, p=1):
        c = Canvas(self.w + 2 * p, self.h + 2 * p)
        c.blit(self, p, p)
        return c

    # -- ascii sprites
    @staticmethod
    def from_ascii(art, legend):
        rows = [r for r in art.strip('\n').split('\n')]
        rows = [r.rstrip() for r in rows]
        w = max(len(r) for r in rows)
        c = Canvas(w, len(rows))
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch in legend and legend[ch] is not None:
                    c.px(x, y, legend[ch])
        return c

    # -- io
    def image(self, scale=1):
        im = Image.fromarray(self.a, 'RGBA')
        if scale != 1:
            im = im.resize((self.w * scale, self.h * scale), Image.NEAREST)
        return im

    def save(self, path, scale=1):
        self.image(scale).save(path, optimize=True)


# ---------------------------------------------------------------- helpers
def jag(rng, n, amp=1):
    """Short integer jitter sequence for hand-made edges."""
    out, v = [], 0
    for _ in range(n):
        if rng.random() < 0.35:
            v += rng.choice((-1, 1))
            v = max(-amp, min(amp, v))
        out.append(v)
    return out


def periodic_noise(width, octaves, rng, amp=1.0):
    """1-D noise that wraps around `width` (sum of integer-period sines)."""
    xs = np.arange(width)
    out = np.zeros(width)
    for k, a in octaves:
        ph = rng.random() * 2 * np.pi
        out += a * np.sin(2 * np.pi * k * xs / width + ph)
    return out * amp


def blob_mask(rng, w, h, n=6, rmin=2, rmax=5):
    """Clustered blob (union of small ellipses) -> bool array. Used for
    peeling paint, moss, stains - reads hand-drawn, not noisy."""
    m = np.zeros((h, w), bool)
    cx, cy = w / 2, h / 2
    for _ in range(n):
        r = rng.uniform(rmin, rmax)
        rx = r * rng.uniform(0.7, 1.4)
        ry = r * rng.uniform(0.6, 1.2)
        x = cx + rng.uniform(-w / 3, w / 3)
        y = cy + rng.uniform(-h / 3, h / 3)
        yy, xx = np.mgrid[0:h, 0:w]
        m |= ((xx + 0.5 - x) / rx) ** 2 + ((yy + 0.5 - y) / ry) ** 2 <= 1
    return m


# 3x5 pixel font (caps + digits) for signs, chalk and price tags
FONT = {
    'A': ['.#.', '#.#', '###', '#.#', '#.#'], 'B': ['##.', '#.#', '##.', '#.#', '##.'],
    'C': ['.##', '#..', '#..', '#..', '.##'], 'D': ['##.', '#.#', '#.#', '#.#', '##.'],
    'E': ['###', '#..', '##.', '#..', '###'], 'F': ['###', '#..', '##.', '#..', '#..'],
    'G': ['.##', '#..', '#.#', '#.#', '.##'], 'H': ['#.#', '#.#', '###', '#.#', '#.#'],
    'I': ['###', '.#.', '.#.', '.#.', '###'], 'J': ['..#', '..#', '..#', '#.#', '.#.'],
    'K': ['#.#', '#.#', '##.', '#.#', '#.#'], 'L': ['#..', '#..', '#..', '#..', '###'],
    'M': ['#.#', '###', '###', '#.#', '#.#'], 'N': ['##.', '#.#', '#.#', '#.#', '#.#'],
    'O': ['.#.', '#.#', '#.#', '#.#', '.#.'], 'P': ['##.', '#.#', '##.', '#..', '#..'],
    'Q': ['.#.', '#.#', '#.#', '##.', '.##'], 'R': ['##.', '#.#', '##.', '#.#', '#.#'],
    'S': ['.##', '#..', '.#.', '..#', '##.'], 'T': ['###', '.#.', '.#.', '.#.', '.#.'],
    'U': ['#.#', '#.#', '#.#', '#.#', '.##'], 'V': ['#.#', '#.#', '#.#', '.#.', '.#.'],
    'W': ['#.#', '#.#', '###', '###', '#.#'], 'X': ['#.#', '#.#', '.#.', '#.#', '#.#'],
    'Y': ['#.#', '#.#', '.#.', '.#.', '.#.'], 'Z': ['###', '..#', '.#.', '#..', '###'],
    '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
    '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
    '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'],
    '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
    ' ': ['...', '...', '...', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
    '-': ['...', '...', '###', '...', '...'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
    '?': ['##.', '..#', '.#.', '...', '.#.'], '+': ['...', '.#.', '###', '.#.', '...'],
    ':': ['...', '.#.', '...', '.#.', '...'], "'": ['.#.', '.#.', '...', '...', '...'],
}


# The teahouse's own script: angular runes in the spirit of the enchanting-
# table alphabet. Every in-game word is written in it (the strings in the
# code stay readable English, so the layouts read like the real thing).
RUNES = {
    'A': ['###', '..#', '.##', '..#', '#..'], 'B': ['.#.', '.#.', '.#.', '#.#', '.#.'],
    'C': ['.#.', '#..', '.#.', '..#', '#..'], 'D': ['###', '#..', '#.#', '..#', '.##'],
    'E': ['#.#', '#.#', '.#.', '...', '###'], 'F': ['###', '...', '#.#', '...', '...'],
    'G': ['..#', '..#', '###', '..#', '..#'], 'H': ['###', '...', '###', '.#.', '.#.'],
    'I': ['.#.', '.#.', '...', '.#.', '.#.'], 'J': ['.#.', '...', '.#.', '...', '.#.'],
    'K': ['#.#', '.#.', '###', '...', '.#.'], 'L': ['#..', '#..', '###', '..#', '...'],
    'M': ['#.#', '#.#', '###', '...', '#..'], 'N': ['#.#', '#.#', '#.#', '..#', '.#.'],
    'O': ['##.', '..#', '###', '#..', '.##'], 'P': ['#.#', '#.#', '#..', '..#', '#.#'],
    'Q': ['###', '..#', '###', '...', '.#.'], 'R': ['#.#', '...', '#.#', '...', '...'],
    'S': ['#..', '##.', '#.#', '.##', '..#'], 'T': ['###', '..#', '..#', '...', '.#.'],
    'U': ['###', '...', '#.#', '#.#', '...'], 'V': ['.#.', '.#.', '###', '...', '###'],
    'W': ['.#.', '...', '#.#', '...', '...'], 'X': ['..#', '..#', '.#.', '#..', '#..'],
    'Y': ['#.#', '#.#', '#.#', '#.#', '...'], 'Z': ['###', '#.#', '#.#', '#.#', '...'],
    '0': ['...', '.#.', '#.#', '.#.', '...'], '1': ['.#.', '.#.', '.#.', '.#.', '#.#'],
    '2': ['#.#', '#.#', '.#.', '.#.', '.#.'], '3': ['#.#', '.#.', '#.#', '.#.', '#.#'],
    '4': ['###', '#.#', '###', '...', '#.#'], '5': ['#..', '###', '..#', '###', '#..'],
    '6': ['.#.', '###', '.#.', '#.#', '#.#'], '7': ['###', '.#.', '#.#', '.#.', '###'],
    '8': ['#.#', '###', '#.#', '###', '#.#'], '9': ['#..', '#.#', '#.#', '###', '..#'],
}
SCRIPT = 'rune'          # 'rune' for in-game art, 'latin' for preview labels


def glyph_of(ch, script=None):
    if (script or SCRIPT) == 'rune' and ch in RUNES:
        return RUNES[ch]
    return FONT.get(ch, FONT[' '])


def text(cv, x, y, s, c, rng=None, wobble=False, script=None):
    """Draw text with the 3x5 font (runes by default). wobble=True nudges
    letters by a pixel so chalk / handwriting doesn't sit on a perfect
    baseline."""
    cx = x
    for ch in s.upper():
        g = glyph_of(ch, script)
        oy = rng.choice((0, 0, 0, 1)) if (wobble and rng) else 0
        for gy, row in enumerate(g):
            for gx, v in enumerate(row):
                if v == '#':
                    cv.px(cx + gx, y + gy + oy, c)
        cx += 4
    return cx


def text_width(s):
    return len(s) * 4 - 1


def scribble(cv, rng, x, y, w, c, gap_c=None):
    """One line of 'handwriting': short dashes with tiny ascenders."""
    xx = x
    while xx < x + w - 2:
        word = rng.randint(2, 6)
        for i in range(word):
            if xx + i >= x + w:
                break
            cv.px(xx + i, y, c)
            if rng.random() < 0.18:
                cv.px(xx + i, y - 1, c)
        xx += word + rng.randint(1, 2)
