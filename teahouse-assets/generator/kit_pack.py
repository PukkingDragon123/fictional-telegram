"""Gather the traveller's kit (everything under teahouse-assets/traveler_kit/)
into the inspect viewer and a download.

    python3 kit_pack.py viewer OUT_DIR    # index.html with the kit's index inlined; sheets are listed for publishing
    python3 kit_pack.py zip OUT.zip       # every prop folder: stills, sheets, gifs, json (no viewer, no text)

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
    'seal_plush': ('Seal Beast Plush', 'A shaggy, horned seal plush with felt tusks and bead eyes, '
                   'wearing a tea brewer\'s headband. Squeeze it, make it wriggle, make it roar.'),
    'omamori_charm': ('Omamori Charm', 'A brocade travel charm with a teacup crest in gold thread, a knotted cord and '
                      'a little bell. Flick it and it jingles.'),
}


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
            vs[c] = dict(label=c.title() if c != 'default' else 'As found',
                         animations={a: dict(src=f'{d}/{m["sheet"]}', frames=m['frames'], fps=m['fps'],
                                             w=m['frame_w'], h=m['frame_h'])
                                     for a, m in meta['animations'].items()})
        items[base] = dict(name=nm, blurb=blurb, variants=vs)
    order = ['seal_plush', 'omamori_charm', 'tea_kit', 'suitcase', 'travel_bag', 'world_map', 'train_ticket',
             'boat_pass', 'postcard']
    keys = sorted(items, key=lambda k: (order.index(k) if k in order else len(order), k))
    return dict(items={k: items[k] for k in keys})


def viewer(out):
    os.makedirs(out, exist_ok=True)
    kit = index()
    html = open(os.path.join(KIT, 'viewer', 'index.html')).read().replace('__KIT__', json.dumps(kit))
    open(os.path.join(out, 'index.html'), 'w').write(html)
    files = {}
    for it in kit['items'].values():
        for v in it['variants'].values():
            for a in v['animations'].values():
                files[a['src']] = os.path.join(KIT, a['src'])
    json.dump(files, open(os.path.join(out, 'files.json'), 'w'), indent=1)
    print(f'{len(kit["items"])} things, {len(files)} sheets -> {out}')


def pack(out):
    import package as PK                                  # the pack's phone-safe zip writer
    tmp = tempfile.mkdtemp()
    top = os.path.join(tmp, 'Traveler_Kit')
    for d in sorted(os.listdir(KIT)):
        src = os.path.join(KIT, d)
        if os.path.isdir(src) and d != 'viewer':
            shutil.copytree(src, os.path.join(top, d))
    PK._zip(tmp, out)
    shutil.rmtree(tmp)
    print(f'{out}: {os.path.getsize(out) / 2 ** 20:.1f} MiB')


if __name__ == '__main__':
    {'viewer': viewer, 'zip': pack}[sys.argv[1]](sys.argv[2])
