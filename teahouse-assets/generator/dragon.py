"""The bell and the window wyvern (room 3).

Ring the brass call bell on the counter and something answers: a fat,
friendly old rock wyvern (see wyvern.py) rises behind the bell-shaped
window, rests its chin on the sill and says hello.

The wyvern lives just outside the window (layer 'outside': after the
parallax garden, before the room shell), so the window frame hides the
rest of it.

  dragon_bell  anims: idle (1 frame), ring (10 frames, 12 fps)
  dragon_peek  anims: hidden (1 empty frame), peek (one-shot), rest (loop), 10 fps
"""
import math
from pixel import Canvas
import wyvern
from shade import lathe_shade
from objects import outline
from propkit import prop
from layout import WIN_BELL, COUNTER_Y

# ---------------------------------------------------------------- the bell
BW, BH = 48, 36


def _bell(press=0, wobble=0, rings=0):
    cv = Canvas(BW, BH)
    cx, base_y = BW // 2, BH - 6
    # wooden base, an oval seen from above
    for y in range(base_y - 2, base_y + 4):
        for x in range(cx - 14, cx + 15):
            d = ((x + 0.5 - cx) / 14.5) ** 2 + ((y + 0.5 - base_y - 0.5) / 3.6) ** 2
            if d <= 1:
                cv.px(x, y, 'wood3' if y < base_y else ('wood1' if y > base_y + 1 else 'wood2'))
    cv.hline(cx - 12, cx + 12, base_y - 2, 'wood4')
    # brass dome
    dome = lathe_shade(24, 13, lambda t: 12 * math.sqrt(max(0, 1 - (1 - t) ** 2)), ['gold0', 'gold1', 'gold2', 'gold3', 'gold4'],
                       spec=0.2, spec_col='white', wobble=0)
    cv.blit(dome, cx - 12 + wobble, base_y - 14 + press)
    cv.hline(cx - 12 + wobble, cx + 11 + wobble, base_y - 2 + press, 'gold0')
    # plunger and knob
    cv.vline(cx + wobble, base_y - 18 + press * 2, base_y - 14 + press, 'stone2')
    cv.rect(cx - 2 + wobble, base_y - 20 + press * 2, 5, 3, 'gold3')
    cv.hline(cx - 2 + wobble, cx + 2 + wobble, base_y - 20 + press * 2, 'gold4')
    cv.px(cx - 2 + wobble, base_y - 18 + press * 2, 'gold1')
    # sound: curved lines spreading out
    for r in range(rings):
        rad = 15 + r * 4
        for a in range(-50, 51, 10):
            for s in (-1, 1):
                x = cx + s * rad * math.cos(math.radians(a)) * 0.9
                y = base_y - 9 + rad * math.sin(math.radians(a)) * 0.55
                if 0 <= x < BW and 0 <= y < BH:
                    cv.px(int(x), int(y), 'paper4' if r < 2 else 'gold3')
    return outline(cv)


def bell_frames():
    seq = [(1, 0, 0), (1, 0, 1), (0, 1, 1), (0, -1, 2), (0, 1, 2), (0, -1, 3), (0, 1, 3), (0, 0, 2), (0, 0, 1), (0, 0, 0)]
    return [_bell(p, w, r) for (p, w, r) in seq]


PEEK_X = WIN_BELL['cx'] - wyvern.W // 2 + 4
PEEK_Y = WIN_BELL['bottom'] + 4 - wyvern.H


@prop('dragon_bell', 3, 'counter', WIN_BELL['cx'] - BW // 2 - 40, COUNTER_Y - BH + 1,
      'Brass call bell. Click it: it rings, and an old rock wyvern rises behind the window', fps=12,
      meta=dict(on_click=[dict(prop='dragon_bell', play='ring', then='idle'),
                          dict(prop='dragon_peek', play='peek', then='hidden', fps=10)]))
def dragon_bell():
    return {'idle': [_bell()], 'ring': bell_frames()}


@prop('dragon_peek', 3, 'outside', PEEK_X, PEEK_Y,
      'Old rock wyvern, drawn by hand, who rises behind the bell window when the bell rings: settles its chin '
      'on the sill, opens its amber eye (the third eyelid slides back), looks at the bell, breathes out, blinks, '
      f'parts its overbite jaws with a sigh and sinks back down ({len(wyvern.SCRIPT)} frames); rest: a loop of it '
      f'staying at the window, breathing and blinking ({len(wyvern.REST)} frames)', drag=False,
      fps=10, shadow='none')
def dragon_peek():
    return {'hidden': [Canvas(wyvern.W, wyvern.H)], 'peek': wyvern.peek_frames(), 'rest': wyvern.rest_frames()}
