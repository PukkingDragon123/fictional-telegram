#!/usr/bin/env python3
"""gif.py out.gif frame_ms f0.png f1.png ... -> looping GIF with one shared 256-colour palette.

The palette comes from a mosaic of every frame (median cut), frames are mapped onto it
without dithering (keeps the pixel art clean and the file small), and Pillow stores only
the changed rectangle of each frame.
"""
import sys
from PIL import Image

out, ms, files = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
frames = [Image.open(f).convert('RGB') for f in files]
w, h = frames[0].size
# palette from a downscaled mosaic of all frames
cols = 5
tw, th = max(1, w // 2), max(1, h // 2)
rows = (len(frames) + cols - 1) // cols
mosaic = Image.new('RGB', (tw * cols, th * rows))
for i, f in enumerate(frames):
    mosaic.paste(f.resize((tw, th), Image.NEAREST), ((i % cols) * tw, (i // cols) * th))
pal = mosaic.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=int(round(ms)), loop=0, optimize=False, disposal=1)
import os
print('wrote', out, f'{os.path.getsize(out) / 1e6:.2f} MB', len(q), 'frames', f'{w}x{h}')
