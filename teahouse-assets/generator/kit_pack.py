"""Gather the traveller's kit (everything under teahouse-assets/traveler_kit/)
into the inspect viewer and a download.

    python3 kit_pack.py viewer OUT_DIR [--inline]   # index.html; --inline embeds every sheet (one file)
    python3 kit_pack.py zip OUT.zip       # every prop folder in two zips: stills, sheets, gifs, json (no text)

A prop folder named <thing>_<condition> (clean, worn, dirty, repaired, torn)
is one condition of <thing>; anything else is a thing on its own."""
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(os.path.dirname(HERE), 'traveler_kit')
CONDITIONS = ('clean', 'worn', 'dirty', 'repaired', 'torn')
NAMES = {
    'seal_plush': ('Seal Beast Plush', 'A shaggy, horned seal plush with felt tusks and two bead eyes, in a tea brewer\'s '
                   'headband. Squeeze it, make it wriggle, make it roar.'),
    'omamori_charm': ('Omamori Charm', 'A brocade travel charm with a teacup crest in gold thread, a knotted cord and '
                      'a little bell. Flick it and it jingles.'),
    'tea_kit': ('Tea Kit', 'A lacquered chabako tied in silk cord: open it for the whole travelling tea set, then brew.'),
    'kyusu': ('Kyusu', 'The side-handled red clay teapot. Tip it to pour.'),
    'yunomi': ('Yunomi', 'A tall tea cup for every day. Fill it and watch the steam.'),
    'chasen': ('Chasen', 'A bamboo whisk with fine tines, for whipping matcha.'),
    'chashaku': ('Chashaku', 'A bamboo scoop for measuring out powdered tea.'),
    'tea_caddy': ('Tea Caddy', 'A cherry-bark caddy for the good leaves. Lift the lid and they puff out.'),
    'tea_tin': ('Tea Tin', 'A travel tin of rolled leaves with a paper label in runes.'),
    'suitcase': ('Old Suitcase', 'Cognac leather with brass corners and stickers from every port. Open it: clothes and '
                 'a furoshiki tea bundle inside.'),
    'travel_bag': ('Travel Bag', 'A patched boro indigo bag on bamboo ring handles, a whisk and a straw mat tucked in.'),
    'world_map': ('World Map', 'A hand-drawn scroll of the islands. Unroll it and follow the route to the tea fields.'),
    'train_ticket': ('Train Ticket', 'A card ticket for the coast line. The conductor punches it.'),
    'boat_pass': ('Boat Pass', 'A ferry pass on a string, waiting for the harbour master\'s stamp.'),
    'postcard': ('Postcard', 'A painted card of the volcano at dusk. Flip it to read the back.'),
}
DEFAULT_LABEL = 'In use'
USE = {'kyusu': 'pour', 'yunomi': 'fill', 'chasen': 'whisk', 'chashaku': 'scoop', 'tea_caddy': 'open', 'tea_tin': 'open',
       'turn_open': 'turn it open'}


def _things():
    things = {}
    for d in sorted(os.listdir(KIT)):
        meta = os.path.join(KIT, d, d + '.json')
        if not os.path.isfile(meta):
            continue
        base, cond = d, 'default'
        for c in CONDITIONS:
            if d.endswith('_' + c):
                base, cond = d[:-len(c) - 1], c
        things.setdefault(base, {})[cond] = d
    return things


def index():
    """The viewer's index: things -> conditions -> animations (sheet, frames, fps, frame size)."""
    items = {}
    for base, conds in _things().items():
        nm, blurb = NAMES.get(base, (base.replace('_', ' ').title(), ''))
        vs = {}
        for c in sorted(conds, key=lambda c: CONDITIONS.index(c) if c in CONDITIONS else -1):
            d = conds[c]
            meta = json.load(open(os.path.join(KIT, d, d + '.json')))
            vs[c] = dict(label=c.title() if c != 'default' else DEFAULT_LABEL,
                         animations={a: dict(src=f'{d}/{m["sheet"]}', frames=m['frames'], fps=m['fps'],
                                             w=m['frame_w'], h=m['frame_h'])
                                     for a, m in meta['animations'].items()})
        items[base] = dict(name=nm, blurb=blurb, variants=vs,
                           labels={'use': USE.get(base, 'use'), 'turn_open': USE['turn_open']})
    order = ['seal_plush', 'omamori_charm', 'tea_kit', 'suitcase', 'travel_bag', 'world_map', 'postcard',
             'train_ticket', 'boat_pass', 'kyusu', 'yunomi', 'chasen', 'chashaku', 'tea_caddy', 'tea_tin']
    keys = sorted(items, key=lambda k: (order.index(k) if k in order else len(order), k))
    return dict(items={k: items[k] for k in keys})


def viewer(out, inline=False):
    """inline=True puts every sheet into the page as a data URI: one self-contained file."""
    os.makedirs(out, exist_ok=True)
    kit = index()
    if inline:
        import base64
        for it in kit['items'].values():
            for v in it['variants'].values():
                for a in v['animations'].values():
                    with open(os.path.join(KIT, a['src']), 'rb') as fh:
                        a['src'] = 'data:image/png;base64,' + base64.b64encode(fh.read()).decode()
    html = open(os.path.join(KIT, 'viewer', 'index.html')).read().replace('__KIT__', json.dumps(kit))
    open(os.path.join(out, 'index.html'), 'w').write(html)
    if not inline:
        files = {}
        for it in kit['items'].values():
            for v in it['variants'].values():
                for a in v['animations'].values():
                    files[a['src']] = os.path.join(KIT, a['src'])
        json.dump(files, open(os.path.join(out, 'files.json'), 'w'), indent=1)
    print(f'{len(kit["items"])} things -> {out}/index.html '
          f'({os.path.getsize(os.path.join(out, "index.html")) / 2 ** 20:.1f} MiB)')


PARTS = {'1_keepsakes_and_tea': ('seal_plush', 'omamori_charm', 'tea_kit', 'kyusu', 'yunomi', 'chasen', 'chashaku',
                                 'tea_caddy', 'tea_tin'),
         '2_luggage_and_papers': ('suitcase', 'travel_bag', 'world_map', 'postcard', 'train_ticket', 'boat_pass')}


def pack(out):
    """Two zips (each fits a 30 MB attachment): OUT_1_keepsakes_and_tea.zip and
    OUT_2_luggage_and_papers.zip. Unpack both into the same place."""
    import package as PK                                  # the pack's phone-safe zip writer
    things = _things()
    stem = out[:-4] if out.endswith('.zip') else out
    for part, bases in PARTS.items():
        tmp = tempfile.mkdtemp()
        top = os.path.join(tmp, 'Traveler_Kit')
        for b in bases:
            for d in things.get(b, {}).values():
                shutil.copytree(os.path.join(KIT, d), os.path.join(top, d))
        path = f'{stem}_{part}.zip'
        PK._zip(tmp, path)
        shutil.rmtree(tmp)
        print(f'{path}: {os.path.getsize(path) / 2 ** 20:.1f} MiB')


if __name__ == '__main__':
    if sys.argv[1] == 'viewer':
        viewer(sys.argv[2], inline='--inline' in sys.argv)
    else:
        pack(sys.argv[2])
