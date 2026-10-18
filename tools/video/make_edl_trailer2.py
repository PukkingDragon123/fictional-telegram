#!/usr/bin/env python3
"""Writes tools/video/edl_trailer2.json: the trailer v2 cut, timed to the music.

Music: "Call to Adventure" (Kevin MacLeod, CC BY 4.0). Bars of 1.4368 s (166.9 bpm, 4/4), downbeats
on 219.93 + k * bar. Two pieces: 162.48 -> 196.95 (quiet build, the orchestra kicks in on the downbeat
at 189.77) and, after one 8-bar phrase is skipped (196.95 and 208.44 start the same phrase, chroma
similarity 0.99, so the edit is seamless), 208.44 -> the end (final hit 237.17, ring-out).
"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
BAR = 1.4368
A0, A1, B0 = 162.48, 196.95, 208.44
SEG_B_AT = A1 - A0            # 34.47: timeline time of the music edit
def V(m):                      # music time -> timeline time
    return m - A0 if m < A1 + 1e-6 else m - B0 + SEG_B_AT
KICK = V(189.77)               # 27.29: the orchestra kicks in
HIT = V(237.17)                # 63.20: the final hit (title slam)
def bar(t0, k):
    return t0 + k * BAR

cuts = []                      # (shot id, src, timeline start, timeline end, in, tin)
def shot(sid, t0, t1, i0=0.0, src=None, tin=None, **kw):
    cuts.append(dict(id=sid, src=src or sid, t0=t0, t1=t1, i0=i0, tin=tin, **kw))

T_WAKE = 20.9
shot('t2_dawn', 0.0, T_WAKE, 0.0, game_db=-6)
shot('t2_wake', T_WAKE, KICK, 1.3, tin={'type': 'zoom', 'dur': 1.2, 'cx': 0.5, 'cy': 0.47, 'za': 2.2, 'zb': 0.5, 'glow': 0.45}, game_db=-2)
b = KICK
shot('t2_hatch', b, bar(b, 2), 0.25, tin={'type': 'whip', 'dur': 0.36, 'dir': 1}, game_db=-8)
shot('t2_march', bar(b, 2), SEG_B_AT, 0.2, game_db=-8)
c0 = SEG_B_AT
shot('t2_feast', c0, bar(c0, 2), 0.3, tin={'type': 'flash', 'dur': 0.26, 'amt': 0.85}, game_db=-9)
shot('t2_rich', bar(c0, 2), bar(c0, 4), 0.3, tin={'type': 'whip', 'dur': 0.32, 'dir': -1}, game_db=-9)
shot('t2_build', bar(c0, 4), bar(c0, 6), 0.3, game_db=-8)
shot('t2_beavers', bar(c0, 6), bar(c0, 8), 0.3, tin={'type': 'whip', 'dur': 0.32, 'dir': 1}, game_db=-10)
d0 = bar(c0, 8)
shot('t2_resort', d0, bar(d0, 2), 0.4, tin={'type': 'dissolve', 'dur': 0.5}, game_db=-10)
shot('t2_winter', bar(d0, 2), bar(d0, 4), 0.4, tin={'type': 'dissolve', 'dur': 0.4}, game_db=-10)
shot('t2_rampage', bar(d0, 4), bar(d0, 6), 0.3, game_db=-6)
shot('t2_falls', bar(d0, 6), bar(d0, 8), 0.5, tin={'type': 'dip', 'dur': 0.4}, game_db=-12)
e0 = bar(d0, 8)
half = BAR / 2
flashes = [('t2_hatch', 2.0), ('t2_build', 2.2), ('t2_resort', 2.4), ('t2_winter', 2.4)]
for k, (src, i0) in enumerate(flashes):
    shot('fl%d_%s' % (k, src), e0 + k * half, e0 + (k + 1) * half, i0, src=src, tin={'type': 'flash', 'dur': 0.16, 'amt': 0.7}, game_db=-14, ext=False)
shot('t2_laugh', bar(e0, 2), bar(e0, 3), 0.3, tin={'type': 'whip', 'dur': 0.3, 'dir': -1}, game_db=-2)
END = HIT + 6.5
shot('t2_title', bar(e0, 3), END, 0.6, tin={'type': 'zoom', 'dur': 0.6, 'cx': 0.5, 'cy': 0.45, 'za': 1.4, 'zb': 0.35, 'glow': 0.5}, game_db=-12)

shots = []
for c in cuts:
    s = {'id': c['id'], 'src': c['src'], 'in': round(c['i0'], 4), 'out': round(c['i0'] + c['t1'] - c['t0'], 4)}
    if c['tin']:
        s['tin'] = c['tin']
    for k in ('game_db', 'ext', 'game'):
        if k in c:
            s[k] = c[k]
    shots.append(s)

# kinetic text on the beats (no tagline, no dialogue)
T = []
def word(lines, t0, dur, y=0.5, size=125, fill='gold', anim='squash', x=0.5, rot=0, **kw):
    d = dict(type='card', lines=lines if isinstance(lines, list) else [lines], t0=round(t0, 3), t1=round(t0 + dur, 3), x=x, y=y, size=size, anim=anim, fill=fill, rot=rot, outline=5, outer=4, outlineColor='#2a0f1e', outerColor='#fff6e0', outAnim='squash', outDur=0.16)
    d.update(kw)
    T.append(d)
word('BREED.', KICK + 0.03, 2 * BAR - 0.4, y=0.5, rot=-2)
word('THE BEARS', bar(KICK, 2) + 0.03, BAR * 2.8, y=0.36, size=104, fill='hot', rot=-2)
word('ARE COMING.', bar(KICK, 3) + 0.03, BAR * 1.8, y=0.6, size=104, fill='hot', rot=2)
word('FEED.', c0 + 0.05, 2 * BAR - 0.4, rot=2)
word('GET RICH.', bar(c0, 2) + 0.03, 2 * BAR - 0.4, rot=-3)
word('BUILD.', bar(c0, 4) + 0.03, 2 * BAR - 0.4, fill='green', rot=2)
word('EXPAND.', bar(c0, 6) + 0.03, 2 * BAR - 0.4, rot=-2)
word('LUXURY.', d0 + 0.05, 2 * BAR - 0.4, fill='pink', rot=-2)
word('EVERY SEASON.', bar(d0, 2) + 0.03, 2 * BAR - 0.4, fill='ice', outlineColor='#10203a', rot=2)
word('UH-OH.', bar(d0, 4) + 0.85, 2 * BAR - 1.2, fill='hot', anim='slam', rot=-4)
for k, w in enumerate(['BREED.', 'FEED.', 'BUILD.', 'REPEAT.']):
    word(w, e0 + k * half + 0.01, half - 0.06, size=145, outAnim='cut', rot=(-3, 2, -2, 3)[k])
T.append(dict(type='card', lines=['THE BEAR', 'MUST EAT'], t0=round(HIT, 3), t1=999, x=0.5, y=0.47, size=125, sizes=[104.17, 145.83], gap=-14, anim='slam', fill='gold', rot=-3, outline=5, outer=4, outlineColor='#3a1408', outerColor='#fff6e0'))
T.append(dict(type='text', text='Music: "Call to Adventure" by Kevin MacLeod (incompetech.com), CC BY 4.0', t0=round(HIT + 1.4, 3), t1=999, x=0.5, y=0.835, size=19, color='#e8dcc8', outline=2))
# foreground parallax: reeds and a spruce sliding past the lens in the dawn crane, bushes in the night orbit
T += [
    dict(type='fg', sprite='cattail_0', px=34, t0=1.5, t1=9.0, **{'from': [0.18, 1.06], 'to': [-0.25, 1.1]}, blur=16, dark=0.22, ease='smooth', fadeIn=0.8, fadeOut=0.3),
    dict(type='fg', sprite='reeds_0', px=40, t0=2.5, t1=10.0, **{'from': [0.62, 1.12], 'to': [0.05, 1.12]}, blur=20, dark=0.2, ease='smooth', fadeIn=0.8, fadeOut=0.3, flip=True),
    dict(type='fg', sprite='cattail_1', px=30, t0=4.5, t1=11.0, **{'from': [1.05, 1.08], 'to': [0.62, 1.1]}, blur=13, dark=0.25, ease='smooth', fadeIn=0.6, fadeOut=0.4),
    dict(type='fg', sprite='spruce_0', px=26, t0=9.5, t1=15.5, **{'from': [1.25, 1.25], 'to': [0.86, 1.3]}, blur=18, dark=0.14, ease='smooth', fadeIn=0.6, fadeOut=0.6),
    dict(type='fg', sprite='bush_0', px=44, t0=d0 - 0.25, t1=bar(d0, 2) + 0.3, **{'from': [1.0, 1.08], 'to': [0.62, 1.08]}, blur=16, dark=0.16, fadeIn=0.2, fadeOut=0.3),
    dict(type='fg', sprite='bush_1', px=40, t0=bar(d0, 2) - 0.2, t1=bar(d0, 4) + 0.1, **{'from': [-0.05, 1.1], 'to': [0.3, 1.1]}, blur=16, dark=0.25, fadeIn=0.2, fadeOut=0.2),
]

leaks = [
    dict(t0=0.5, t1=12.0, x=0.92, y=0.12, r=0.42, amp=0.34, color=[255, 168, 92], drift=[-0.25, 0.05]),
    dict(t0=6.0, t1=17.5, x=0.75, y=0.2, r=0.28, amp=0.22, color=[255, 120, 80], drift=[-0.3, 0.1], sx=0.6),
    dict(t0=T_WAKE - 0.2, t1=KICK - 0.3, x=0.15, y=0.25, r=0.4, amp=0.28, color=[255, 196, 120], drift=[0.15, 0.05]),
    dict(t0=bar(c0, 2), t1=bar(c0, 4), x=0.85, y=0.15, r=0.3, amp=0.2, color=[255, 190, 90], drift=[-0.2, 0.0]),
    dict(t0=HIT - 0.3, t1=END + 0.5, x=0.88, y=0.18, r=0.45, amp=0.3, color=[255, 170, 90], drift=[-0.3, 0.05]),
]

# SFX on the transitions and words (CC0 library, see sfxlib.json / CREDITS.txt)
S = []
def sfx(name, at, gain_db=0.0):
    S.append(dict(name=name, at=round(at, 3), gain_db=gain_db))
sfx('whoosh', 20.15, -13)   # through the glass
sfx('riser_hit', KICK, -7)
sfx('whoosh', KICK, -4)
sfx('dramatic_boom', KICK + 0.02, -4)
sfx('swish', bar(KICK, 2), -2)
sfx('dramatic_boom', bar(KICK, 3) + 0.02, -8)
for t in (c0, bar(c0, 2), bar(c0, 4), bar(c0, 6), d0, bar(d0, 2)):
    sfx('swish', t + 0.02, -3)
for t in (bar(c0, 2), bar(c0, 6)):
    sfx('whoosh', t, -7)
sfx('dramatic_boom', bar(d0, 4) + 0.85, -3)
sfx('whoosh', bar(d0, 6), -9)
for k in range(4):
    sfx('swish', e0 + k * half + 0.01, -1)
sfx('whoosh', bar(e0, 2), -6)
sfx('riser_hit', HIT, -4)
sfx('dramatic_boom', HIT + 0.01, 0)

E = {
    '_doc': 'Trailer v2 (generated by make_edl_trailer2.py; edit that, not this).',
    'module': 'shots_trailer2',
    'out': 'promo/video/the-bear-must-eat-trailer.mp4',
    'frames': '${VFRAMES}',
    'render_size': [1280, 720],
    'size': [1920, 1080],
    'fps': 30,
    'kbps': 4300,
    'letterbox': 2.39,
    'title_scale': 1.5,
    'grade': 'eq=contrast=1.05:saturation=1.06:gamma=0.98,colorbalance=rs=0.02:gs=0.0:bs=-0.03:rm=0.02:bm=-0.02:rh=0.03:bh=-0.04,vignette=angle=PI/4.6,noise=c0s=5:c0f=t',
    'shots': shots,
    'titles': T,
    'leaks': leaks,
    'music': [
        {'file': '${DL}/music/Call to Adventure.mp3', 'at': 0.0, 'from': A0, 'to': A1 + 0.02, 'gain_db': -1, 'fade_in': 0.8, 'fade_out': 0.03},
        {'file': '${DL}/music/Call to Adventure.mp3', 'at': SEG_B_AT - 0.01, 'from': B0 - 0.01, 'to': B0 + (END - SEG_B_AT) + 0.4, 'gain_db': -1, 'fade_in': 0.02, 'fade_out': 2.0},
    ],
    'duck': [],
    'sfx': S,
    'game_gain_db': -2,
    'ext_gain_db': -2,
}
json.dump(E, open(os.path.join(HERE, 'edl_trailer2.json'), 'w'), indent=1)
tot = sum(s['out'] - s['in'] for s in shots)
print('trailer2: %.2f s, %d shots, kick %.2f, edit %.2f, hit %.2f' % (tot, len(shots), KICK, SEG_B_AT, HIT))
for c in cuts:
    print('  %-16s %6.2f - %6.2f  (%.2f)  in %.2f' % (c['id'], c['t0'], c['t1'], c['t1'] - c['t0'], c['i0']))
