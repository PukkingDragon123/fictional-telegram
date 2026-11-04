"""Colours for the Copper Sky room: the teahouse palette plus the night city's
lamplight, its smog and the green that old copper turns. Importing this adds them
to pixel.RAMPS / PAL / LOOKUP, so step() and the rest work on them as usual.
Ramps run dark -> light and hue-shift like the rest of the pack."""
import pixel

CYBER_RAMPS = {
    # sodium-lamp amber: windows, paper lanterns, the glow in a furnace
    'amber': [(70, 34, 14), (136, 70, 22), (206, 122, 36), (246, 186, 78), (255, 232, 170)],
    # the city at night: smog violets, cold at the top, warm toward the glow
    'smog':  [(8, 8, 20), (16, 14, 34), (26, 22, 52), (40, 32, 74), (60, 44, 96), (88, 60, 118), (124, 80, 136),
              (166, 104, 150)],
    # the haze over the city, lit from below by ten thousand windows
    'glow':  [(46, 30, 44), (76, 44, 52), (114, 64, 60), (160, 94, 70), (206, 136, 90), (240, 190, 128)],
    # verdigris: copper gone green
    'verd':  [(16, 42, 44), (26, 70, 64), (42, 106, 88), (72, 146, 116), (124, 192, 156), (184, 230, 198)],
    # bright new copper, for edges that catch the light
    'cu':    [(42, 18, 22), (76, 32, 30), (118, 54, 38), (164, 86, 50), (206, 126, 70), (238, 172, 108),
              (255, 222, 168)],
    # cold steel
    'steel': [(14, 16, 26), (28, 32, 46), (46, 52, 70), (72, 80, 100), (108, 118, 138), (156, 166, 182)],
    # red warning lights
    'warn':  [(66, 8, 18), (140, 16, 26), (224, 36, 36), (255, 110, 90), (255, 200, 170)],
}

for _ramp, _cols in CYBER_RAMPS.items():
    pixel.RAMPS[_ramp] = _cols
    for _i, _c in enumerate(_cols):
        pixel.PAL[f'{_ramp}{_i}'] = _c
        pixel.LOOKUP.setdefault(_c, (_ramp, _i))
