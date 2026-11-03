#!/usr/bin/env python3
"""gif.py out.gif frame_ms [--start N] [--colors K] f0.png f1.png ... -> looping GIF, one shared palette.

The palette comes from a mosaic of every frame (median cut), frames are mapped onto it
without dithering (keeps the pixel art clean and the file small). Each frame after the first
stores only what changed: pixels equal to the frame before become the transparent index, so the
LZW runs stay long, and Pillow crops each frame to the rectangle that changed.
--start N rotates the loop so it opens on frame N (the still), --colors K caps the palette (<= 255).
"""
import os
import sys
import numpy as np
from PIL import Image

args = sys.argv[1:]
out, ms = args[0], float(args[1])
rest = args[2:]
start, colors = 0, 255
while rest and rest[0].startswith('--'):
    if rest[0] == '--start':
        start = int(rest[1]); rest = rest[2:]
    elif rest[0] == '--colors':
        colors = min(255, int(rest[1])); rest = rest[2:]
    else:
        rest = rest[1:]
files = rest[start:] + rest[:start]
frames = [Image.open(f).convert('RGB') for f in files]
w, h = frames[0].size
# palette from a downscaled mosaic of all frames
cols = 5
tw, th = max(1, w // 2), max(1, h // 2)
rows = (len(frames) + cols - 1) // cols
mosaic = Image.new('RGB', (tw * cols, th * rows))
for i, f in enumerate(frames):
    mosaic.paste(f.resize((tw, th), Image.NEAREST), ((i % cols) * tw, (i // cols) * th))
pal = mosaic.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
# index 255 is never used by the palette (<= 255 colours): it marks "unchanged"
TR = 255
outq = [q[0]]
prev = np.asarray(q[0])
for im in q[1:]:
    cur = np.asarray(im)
    d = Image.fromarray(np.where(cur == prev, TR, cur).astype(np.uint8), 'P')
    d.putpalette(im.getpalette())
    outq.append(d)
    prev = cur
outq[0].save(out, save_all=True, append_images=outq[1:], duration=int(round(ms)), loop=0, optimize=False, disposal=1, transparency=TR)
print('wrote', out, f'{os.path.getsize(out) / 1e6:.2f} MB', len(q), 'frames', f'{w}x{h}', f'start {start}')
