"""Scene geometry (v3). One screen = 640x360 (3x -> 1920x1080); four
rooms of one screen each make a 2560x360 panorama.

Every room is a box seen in one-point perspective: the vanishing point
sits at the centre of the room on the eye line, the back wall is inset,
and the ceiling, the two side walls and the floor all run towards it.
A dark post in the foreground hides the seam between neighbouring rooms."""

SW, SH = 640, 360                 # one screen / one room
W, H = 4 * SW, SH                 # whole panorama
EYE_Y = 150                       # eye line: surfaces below it show their tops

# back wall of each room (room-local x) and its height bands (screen y)
BX = 48                           # side-wall width at the back: back wall is BX..SW-BX
CEIL_Y = 40                       # ceiling plane height (girder runs CEIL_Y..WALL_TOP)
WALL_TOP = 52
RAIL = (198, 205)                 # jade rail
WAINS = (205, 258)                # wainscot
BASE = (258, 265)                 # baseboard
FLOOR = 265
F_DEPTH = 600                     # focal length, back-wall pixels (spaces floor boards etc.)
K_EDGE = (SW / 2) / (SW / 2 - BX)  # depth (magnification) where the side walls leave the screen
FURN_CONV = 0.86                  # how far furniture tops/sides recede (1 = flat, eased perspective)

POSTS = [0, 640, 1280, 1920, 2560]   # foreground posts between rooms (full height)
POST_W = 26

ROOMS = [dict(id=1, name='cook room', x0=0, x1=640),
         dict(id=2, name='seating & window', x0=640, x1=1280),
         dict(id=3, name='tea ritual', x0=1280, x1=1920),
         dict(id=4, name="traveler's bedroom", x0=1920, x1=2560)]

WIN_MAIN = dict(x=800, y=66, w=320, h=136)        # room 2 lattice window
WIN_ROUND = dict(cx=2152, cy=128, r=60)           # room 4 moon window
WALL_T = 0.04                                     # wall thickness (window reveals), as a depth fraction

# furniture (screen y of the back and front edge of each top)
TABLE = dict(x0=270, x1=604, back=262, front=294)      # room 1 prep table
HEARTH = dict(x0=26, x1=256)                           # room 1 stone furnace (front face)
COUNTER = dict(x0=690, x1=1906, back=266, front=304)   # rooms 2-3 counter

TABLE_Y = 284         # stand things on the prep table here (their bottom y)
TABLE_SHELF_Y = 336   # lower shelf of the prep table
COUNTER_Y = 292       # stand things on the counter here
SILL_Y = WIN_MAIN['y'] + WIN_MAIN['h'] + 10        # window sill top
CHEST_TOP_Y = 96      # room-1 apothecary chest top (jars stand on it)
SHELF1_Y = CHEST_TOP_Y
SHELF3_Y = 184        # room-3 teaware shelf top


def room_of(x):
    return max(0, min(3, int(x // SW)))


def vp(room_index):
    """Vanishing point (scene x, y) of room 0..3."""
    return room_index * SW + SW // 2, EYE_Y


def proj(x, y, k, room_index):
    """A point drawn at (x, y) on the back-wall plane, brought forward to
    depth k (k=1 back wall, k>1 nearer the viewer)."""
    vx, vy = vp(room_index)
    return vx + (x - vx) * k, vy + (y - vy) * k


def recede(x, y, room_index, amount=FURN_CONV):
    """Where the far edge of a piece of furniture lands, given its near edge."""
    vx, vy = vp(room_index)
    return vx + (x - vx) * amount, vy + (y - vy) * amount


def top_depth(y, depth):
    """How many pixels of a horizontal surface at screen height y we see,
    for a surface `depth` units deep (first-person: lower = more top)."""
    t = (y - EYE_Y) / (SH - EYE_Y)
    return int(round(depth * max(-0.6, min(1.0, t))))
