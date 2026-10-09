"""Scene geometry (v2). One screen = 640x360 (3x -> 1920x1080); four
rooms of one screen each make a 2560x360 panorama."""

SW, SH = 640, 360                 # one screen / one room
W, H = 4 * SW, SH                 # whole panorama
EYE_Y = 150                       # eye line: surfaces below it show their tops

CEIL = 16                         # ceiling boards 0..15
BEAM = (16, 36)                   # main beam (front face + underside)
WALL_TOP = 36
RAIL = (198, 205)                 # jade rail
WAINS = (205, 258)                # wainscot
BASE = (258, 265)                 # baseboard
FLOOR = 265

PILLARS = [0, 640, 1280, 1920, 2552]
PILLAR_W = 18

ROOMS = [dict(id=1, name='cook room', x0=0, x1=640),
         dict(id=2, name='seating & window', x0=640, x1=1280),
         dict(id=3, name='tea ritual', x0=1280, x1=1920),
         dict(id=4, name="traveler's bedroom", x0=1920, x1=2560)]

WIN_MAIN = dict(x=772, y=52, w=376, h=150)        # room 2 lattice window
WIN_ROUND = dict(cx=2150, cy=124, r=66)           # room 4 moon window

# furniture surfaces (screen y of the back and front edge of each top)
TABLE = dict(x0=214, x1=606, back=262, front=294)      # room 1 prep table
HEARTH = dict(x0=16, x1=206)                           # room 1 kamado hearth
COUNTER = dict(x0=704, x1=1920, back=266, front=304)   # rooms 2-3 counter

TABLE_Y = 284         # stand things on the prep table here (their bottom y)
TABLE_SHELF_Y = 336   # lower shelf of the prep table
COUNTER_Y = 292       # stand things on the counter here
SILL_Y = WIN_MAIN['y'] + WIN_MAIN['h'] + 10        # window sill top
SHELF1_Y = 66         # room-1 wall shelf top
SHELF3_Y = 176        # room-3 teaware shelf top


def top_depth(y, depth):
    """How many pixels of a horizontal surface at screen height y we see,
    for a surface `depth` units deep (first-person: lower = more top)."""
    t = (y - EYE_Y) / (SH - EYE_Y)
    return int(round(depth * max(-0.6, min(1.0, t))))
