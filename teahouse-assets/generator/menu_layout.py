"""The main menu scene's layout, shared by every part of it so they line up.

One screen, 640x360 (3x -> 1920x1080), animated over N frames at FPS that loop.

    sky, clouds, mountains        y 0 .. ~175 (the horizon / far meadow edge at HORIZON)
    the far meadow and forest     HORIZON .. ~215
    the teahouse                  stands on the meadow at TEAHOUSE (its ground-centre point), left of centre
    the river                     rises at the horizon right of centre and winds down to the bottom right,
                                  widening as it comes (river_centre(y), river_half(y))
    the big tree                  right foreground: trunk foot at TREE_FOOT, crown over the top right,
                                  one long branch reaching left across the sky
    the menu                      title over the sky top-left (TITLE_BOX), buttons bottom-left (MENU_BOX):
                                  keep the scenery there quiet

Wind: wind(x, f) is how hard the gust is pushing at screen x on frame f (0 calm .. 1 strong). A gust
rolls across from left to right once per loop, on top of a gentle breeze, so the grass, the trees,
the noren and the lanterns all lean together and the wave of it travels across the screen."""
import math

W, H = 640, 360
N = 96                 # frames per loop
FPS = 12
HORIZON = 176          # where the far meadow meets the foot of the mountains

TEAHOUSE = (238, 246)  # ground-centre of the teahouse (its veranda front edge)
TEAHOUSE_BOX = (150, 120, 330, 252)   # x0, y0, x1, y1: roughly what it covers
TREE_FOOT = (586, 372) # the big tree's trunk foot (just below the bottom edge)
TREE_BOX = (430, 0, 640, 360)
TITLE_BOX = (20, 16, 300, 96)
MENU_BOX = (20, 236, 170, 346)


def river_centre(y):
    """x of the river's middle at screen row y (only for y >= HORIZON + 2)."""
    t = max(0.0, min(1.0, (y - HORIZON) / (H - HORIZON)))
    return 372 + 46 * math.sin(t * 3.4 + 0.3) + 150 * t ** 1.6


def river_half(y):
    """Half the river's width at row y: a thread at the horizon, broad at the bottom."""
    t = max(0.0, min(1.0, (y - HORIZON) / (H - HORIZON)))
    return 2.0 + 64 * t ** 1.35


def ground_y(x):
    """The meadow surface is flat in screen terms (rows are distance); this is just the horizon."""
    return HORIZON


def wind(x, f):
    """Gust strength at screen x, frame f: a breeze plus one gust rolling left to right per loop."""
    t = f / N
    front = (t * 1.35 - 0.2) * W           # the gust front moves across, off screen for part of the loop
    d = (x - front) / 120.0
    gust = math.exp(-d * d)
    breeze = 0.18 + 0.08 * math.sin(2 * math.pi * (t * 2) + x * 0.012)
    return min(1.0, breeze + 0.8 * gust)


def sway(x, f, amp=1.0, lag=0.0):
    """A signed lean (pixels at amp=1) for something at screen x: pushed right by the wind,
    springing back a little behind it. lag delays it (in frames) for heavy things."""
    w0 = wind(x, f - lag)
    w1 = wind(x, f - lag - 3)
    return amp * (w0 * 1.6 + (w0 - w1) * 2.2 - 0.3)
