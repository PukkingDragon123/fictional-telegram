"""The four seasons, and the night of the blood moon.

The base build is summer. For the others the outside view (with its birds and
fish), the glass of each window, the light in the rooms and the lanterns are
drawn again; everything else in the teahouse stays.

    spring     cherry blossom in the garden, fresh green, petals on the wind
    summer     deep green, butterflies and dragonflies
    autumn     maples red, orange and gold, pampas grass, leaves on the wind,
               red dragonflies
    winter     snow on everything, bare trees, ice at the lake edge, frost on
               the glass, snow falling
    bloodmoon  night: a red moon over the lake, everything lit by it, bats and
               fireflies; the rooms dark but for the lanterns, the fire and
               the red moonlight through the windows (bloodmoon.py)

Modules read `current` while they draw; build.py sets it."""
import numpy as np
from pixel import PAL

NAMES = ('spring', 'summer', 'autumn', 'winter', 'bloodmoon')
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
