"""The golden hour: a second palette for the teahouse pack. Every ramp of the
pack's palette has a partner ramp here, same length, same role, so any pack
art can be swapped into it colour for colour and keep every hand-placed
cluster. The sun is low and on the left: lights go gold and peach, shadows
fall to violet and slate, greens turn olive and teal, water and snow pick up
the sky's rose and lavender.

    from golden_palette import swap
    rgba = swap(rgba)                 # numpy RGBA array, pack colours -> golden hour

Colours not in the pack's palette (blends, alpha edges) go to the nearest
pack colour first. GOLD_RAMPS also holds the new sky and sun ramps."""
import numpy as np
import pixel

GOLD = {
    'ink':    [(22, 16, 34), (40, 28, 48)],
    'wood':   [(30, 20, 34), (52, 32, 44), (80, 48, 50), (112, 68, 56), (150, 94, 62), (196, 128, 76), (236, 176, 106)],
    'red':    [(64, 20, 40), (102, 30, 46), (146, 44, 50), (190, 62, 56), (230, 98, 68), (252, 150, 96)],
    'jade':   [(24, 40, 56), (36, 62, 70), (54, 92, 84), (82, 126, 96), (128, 160, 106), (186, 196, 128)],
    'gold':   [(92, 52, 40), (152, 94, 44), (212, 148, 60), (246, 200, 100), (255, 238, 176)],
    'paper':  [(110, 74, 74), (160, 110, 96), (210, 156, 120), (240, 198, 150), (255, 230, 188)],
    'sky':    [(52, 58, 112), (92, 84, 150), (168, 118, 168), (232, 148, 140), (250, 198, 150)],
    'cloud':  [(118, 92, 140), (190, 124, 140), (242, 170, 140), (255, 224, 176)],
    'smoke':  [(66, 58, 88), (104, 92, 120), (150, 130, 150)],
    'haze':   [(96, 82, 140), (138, 104, 158), (186, 132, 162), (226, 166, 164)],
    'leaf':   [(28, 34, 52), (40, 60, 62), (58, 90, 70), (96, 122, 72), (156, 152, 82), (222, 192, 112)],
    'bark':   [(36, 24, 44), (64, 38, 56), (98, 56, 62), (140, 80, 68), (190, 116, 80), (234, 168, 108)],
    'pink':   [(118, 52, 84), (176, 84, 112), (232, 132, 150), (252, 180, 180), (255, 222, 212)],
    'purp':   [(56, 40, 86), (96, 66, 126), (146, 104, 164), (196, 156, 200)],
    'alien':  [(40, 64, 62), (76, 104, 70), (132, 146, 76), (196, 184, 92), (242, 222, 140)],
    'stone':  [(40, 34, 58), (70, 58, 84), (108, 90, 110), (154, 128, 138), (212, 174, 160)],
    'water':  [(64, 58, 108), (102, 84, 138), (172, 118, 150)],
    'fire':   [(96, 26, 40), (164, 46, 40), (220, 86, 44), (246, 146, 60), (255, 206, 104), (255, 242, 200)],
    'indigo': [(28, 24, 56), (42, 38, 88), (66, 60, 126), (102, 92, 160), (150, 134, 190)],
    'copper': [(66, 30, 34), (112, 50, 40), (162, 82, 52), (210, 124, 72), (246, 176, 112)],
    'teal':   [(30, 40, 66), (46, 70, 84), (70, 104, 102), (120, 146, 118)],
    'hinoki': [(104, 64, 58), (150, 98, 70), (196, 140, 92), (226, 178, 122), (246, 210, 156), (255, 236, 196)],
    'fgrey':  [(34, 32, 54), (58, 54, 82), (90, 80, 108), (128, 112, 134), (172, 146, 156), (220, 188, 180)],
    'gloss':  [(16, 14, 30), (30, 26, 52), (48, 44, 86), (72, 70, 128), (110, 104, 172)],
    'scarlet': [(104, 22, 44), (164, 34, 50), (214, 58, 58), (242, 104, 80), (255, 162, 128)],
    'lilac':  [(64, 42, 92), (104, 76, 140), (146, 114, 186), (190, 158, 220), (226, 204, 240)],
    'pong':   [(30, 26, 52), (46, 46, 80), (68, 70, 110), (98, 98, 142), (136, 132, 176), (182, 172, 210)],
    'night':  [(14, 10, 26), (24, 16, 40), (38, 24, 58), (58, 36, 78), (82, 52, 98), (114, 76, 124)],
    'nleaf':  [(12, 16, 30), (20, 28, 44), (30, 42, 58), (44, 60, 72), (62, 82, 90)],
    'blood':  [(48, 10, 24), (86, 16, 32), (134, 28, 40), (182, 46, 46), (222, 86, 62), (250, 146, 100),
               (255, 210, 162)],
}
# the new sky: from a deep indigo zenith to the gold over the low sun
GOLD['g_sky'] = [(40, 42, 92), (60, 58, 120), (94, 76, 146), (138, 96, 160), (186, 116, 158), (226, 140, 146),
                 (246, 172, 138), (254, 206, 150), (255, 232, 178)]
GOLD['g_sun'] = [(255, 214, 150), (255, 236, 190), (255, 250, 228)]

# register them so drawing code can use 'g_sky3' etc.
for _r, _cols in GOLD.items():
    if _r.startswith('g_'):
        pixel.RAMPS[_r] = _cols
        for _i, _c in enumerate(_cols):
            pixel.PAL[f'{_r}{_i}'] = _c
            pixel.LOOKUP.setdefault(_c, (_r, _i))

_SRC, _DST = [], []
for _ramp, _cols in pixel.RAMPS.items():
    if _ramp.startswith('g_') or _ramp not in GOLD:
        continue
    new = GOLD[_ramp]
    for _i, _c in enumerate(_cols):
        _SRC.append(_c)
        _DST.append(new[min(len(new) - 1, round(_i * (len(new) - 1) / max(1, len(_cols) - 1)))])
_SRC = np.array(_SRC, np.float32)
_DST = np.array(_DST, np.uint8)
_EXACT = {tuple(int(v) for v in s): tuple(int(v) for v in d) for s, d in zip(_SRC, _DST)}


def swap(rgba):
    """Pack colours -> golden hour. Works on (..., 3) or (..., 4) uint8 arrays; alpha is kept."""
    a = np.asarray(rgba)
    out = a.copy()
    rgb = a[..., :3]
    flat = rgb.reshape(-1, 3)
    key = (flat[:, 0].astype(np.int64) << 16) | (flat[:, 1].astype(np.int64) << 8) | flat[:, 2]
    uniq, inv = np.unique(key, return_inverse=True)
    cols = np.stack([(uniq >> 16) & 255, (uniq >> 8) & 255, uniq & 255], -1).astype(np.float32)
    d = ((cols[:, None, :] - _SRC[None]) ** 2).sum(-1)
    near = d.argmin(1)
    mapped = _DST[near]
    exact = d[np.arange(len(uniq)), near] < 1
    # off-palette blends: keep their offset from the nearest pack colour, carried onto its partner
    off = cols - _SRC[near]
    mapped = np.where(exact[:, None], mapped, np.clip(mapped.astype(np.float32) + off * 0.8, 0, 255)).astype(np.uint8)
    out[..., :3] = mapped[inv].reshape(rgb.shape)
    return out
