"""The four seasons.

The base build is summer. For the other seasons the outside view, the lake's
giant, the glass of each window, the light in the rooms and a few seasonal
things in each room are drawn again; everything else in the teahouse stays.

    spring   cherry blossom in the garden, fresh green, petals on the wind;
             a giant koi leaps from the lake
    summer   deep green, butterflies and dragonflies; the whale-like
             leviathan breaches
    autumn   maples red, orange and gold, pampas grass, leaves on the wind,
             red dragonflies; a giant fox goes skipping across the water
    winter   snow on everything, bare trees, ice at the lake edge, frost on
             the glass, snow falling; a giant red-crowned crane glides low
             over the lake

Modules read `current` while they draw; build.py sets it."""
import numpy as np
from pixel import PAL

NAMES = ('spring', 'summer', 'autumn', 'winter')
current = 'summer'


def set_season(s):
    global current
    assert s in NAMES, s
    current = s


def remap(cv, mapping, mask=None):
    """Swap palette colours in a canvas: mapping {from name: to name}."""
    a = cv.a
    rgb = a[..., :3]
    solid = a[..., 3] > 0
    if mask is not None:
        solid = solid & mask
    masks = [(solid & (rgb == np.array(PAL[src], np.uint8)).all(-1), dst) for src, dst in mapping.items()]
    for m, dst in masks:                                 # all at once, so swaps never chain
        a[m, :3] = PAL[dst]
    return cv


# grass and plant leaves in the meadows
GRASS = {
    'spring': {'leaf0': 'leaf1', 'leaf1': 'leaf2', 'leaf2': 'leaf3', 'leaf3': 'leaf4', 'leaf4': 'leaf5',
               'leaf5': 'alien4'},
    'autumn': {'leaf0': 'wood0', 'leaf1': 'copper1', 'leaf2': 'gold1', 'leaf3': 'gold2', 'leaf4': 'gold3',
               'leaf5': 'gold4'},
    'winter': {'leaf0': 'wood0', 'leaf1': 'wood1', 'leaf2': 'paper0', 'leaf3': 'paper1', 'leaf4': 'paper2',
               'leaf5': 'paper3'},
}
# a second, greener autumn grass so the meadow is not all one gold
GRASS_AUTUMN_GREEN = {'leaf0': 'leaf0', 'leaf1': 'leaf1', 'leaf2': 'gold1', 'leaf3': 'leaf3', 'leaf4': 'gold3',
                      'leaf5': 'gold4'}
