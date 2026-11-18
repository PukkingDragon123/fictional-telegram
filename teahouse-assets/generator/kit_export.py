"""Writes one prop of the traveller's kit to teahouse-assets/traveler_kit/<prop>/:

    <prop>.png              the still (first frame of the first animation), 1x
    <prop>_4x.png           the same at 4x
    <anim>_sheet.png        every frame of an animation left to right, 1x
    <anim>.gif              the animation at 4x, looping
    <prop>.json             frame size, frames and fps per animation

    export_prop('suitcase', {'idle': [rgba, ...], 'open': [...]}, fps=12)

Frames are RGBA uint8 numpy arrays (or pixel.Canvas), all the same size within
an animation. Nothing is resampled except the plain nearest-neighbour 4x."""
import json
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'traveler_kit')
GIF_BG = (34, 28, 36)          # the gif has no alpha worth keeping: a dark warm card behind


def _arr(f):
    return f.a if hasattr(f, 'a') else np.asarray(f, np.uint8)


def _gif(frames, path, fps, scale=4, bg=GIF_BG):
    ims = []
    for f in frames:
        a = _arr(f).astype(np.float32)
        al = a[..., 3:4] / 255.0
        rgb = a[..., :3] * al + np.array(bg, np.float32) * (1 - al)
        im = Image.fromarray(np.clip(rgb + 0.5, 0, 255).astype(np.uint8))
        ims.append(im.resize((im.width * scale, im.height * scale), Image.NEAREST))
    pal = Image.fromarray(np.concatenate([np.asarray(i) for i in ims[::max(1, len(ims) // 8)]], 0)).quantize(
        colors=255, method=Image.MEDIANCUT, dither=Image.NONE)
    q = [i.quantize(palette=pal, dither=Image.NONE) for i in ims]
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(round(1000 / fps)), loop=0, disposal=2)


def export_prop(name, anims, fps=12, root=ROOT, note=None, gif_scale=4):
    out = os.path.join(root, name)
    os.makedirs(out, exist_ok=True)
    meta = dict(name=name, animations={})
    first = None
    for an, frames in anims.items():
        frames = [_arr(f) for f in frames]
        f_fps = fps[an] if isinstance(fps, dict) else fps
        h, w = frames[0].shape[:2]
        sheet = np.concatenate(frames, 1)
        Image.fromarray(sheet, 'RGBA').save(os.path.join(out, f'{an}_sheet.png'), optimize=True)
        _gif(frames, os.path.join(out, f'{an}.gif'), f_fps, gif_scale)
        meta['animations'][an] = dict(frames=len(frames), fps=f_fps, frame_w=w, frame_h=h, sheet=f'{an}_sheet.png',
                                      gif=f'{an}.gif')
        if first is None:
            first = frames[0]
    im = Image.fromarray(first, 'RGBA')
    im.save(os.path.join(out, f'{name}.png'), optimize=True)
    im.resize((im.width * 4, im.height * 4), Image.NEAREST).save(os.path.join(out, f'{name}_4x.png'), optimize=True)
    if note:
        meta['note'] = note
    with open(os.path.join(out, f'{name}.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    return out
