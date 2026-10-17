#!/usr/bin/env python3
"""Fill the SFX section of promo/video/CREDITS.txt with every library cue the two cuts use.
    python3 tools/video/credits.py <frames-root>
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DL = os.environ.get('DL', '/tmp/claude-0/-home-user-fictional-telegram/6488fa50-ab23-5a01-b3f9-ea75799e5abf/scratchpad/dl')
frames = sys.argv[1]
lib = json.load(open(os.path.join(HERE, 'sfxlib.json')))
fsmeta = json.load(open(os.path.join(DL, 'freesound', 'meta.json')))
used = {}
for edl in ('edl_promo.json', 'edl_trailer.json'):
    E = json.load(open(os.path.join(HERE, edl)))
    tag = 'promo' if 'promo' in edl else 'trailer'
    for c in E.get('sfx', []):
        used.setdefault(c['name'], set()).add(tag)
    for s in E['shots']:
        if not s.get('ext', True):
            continue
        aj = os.path.join(frames, s.get('src', s['id']), 'audio.json')
        if not os.path.exists(aj):
            continue
        for ev in json.load(open(aj))['audio']:
            if ev['kind'] == 'ext' and s['in'] - 0.05 <= ev['t'] < s['out']:
                used.setdefault(ev['name'], set()).add(tag)
KENNEY = {'impact-sounds': 'Impact Sounds', 'rpg-audio': 'RPG Audio', 'music-jingles': 'Music Jingles'}
lines = []
for name in sorted(used):
    f = lib[name]['file']
    m = re.search(r'freesound/(\d+)\.mp3', f)
    where = ', '.join(sorted(used[name]))
    if m:
        meta = fsmeta[m.group(1)]
        title = meta['title'].replace('Freesound - ', '')
        lines.append('  %-15s (%s)  "%s"\n                  %s  - CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)\n                  file used: %s (freesound HQ preview)' % (name, where, title, meta['page'], meta['file']))
    else:
        k = re.search(r'kenney/pk_([a-z-]+)/x/(.*)$', f)
        pack = k.group(1)
        lines.append('  %-15s (%s)  Kenney "%s" pack, %s\n                  https://kenney.nl/assets/%s  - CC0 1.0 (License.txt in the pack: "Creative Commons Zero, CC0")' % (name, where, KENNEY.get(pack, pack), k.group(2).split('/')[-1], pack))
p = os.path.join(ROOT, 'promo', 'video', 'CREDITS.txt')
s = open(p).read()
start = s.index('SOUND EFFECTS')
end = s.index('Why not myinstants.com')
head = s[:start]
block = 'SOUND EFFECTS (all CC0 1.0 public domain - no attribution required, listed for the record)\n' + '-' * 90 + '\n' + '\n'.join(lines) + '\n\n'
open(p, 'w').write(head + block + s[end:])
print('\n'.join(lines))
