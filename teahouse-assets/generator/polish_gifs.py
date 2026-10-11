"""Long, smooth animated GIFs of whole rooms, for showing the scene off.

    python3 teahouse-assets/generator/polish_gifs.py OUT_DIR

Each room is drawn at 2x (1280 x 720), 10 fps, with every layer and prop
animating: the seating room runs 12 s so the leviathan breaches, the others
6 s. One palette is shared by all frames (no colour flicker) and there is no
dithering, so the pixel art stays crisp. Not part of the build or the zip."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image                     # noqa: E402
import build                              # noqa: E402
import layout as LY                       # noqa: E402

FPS = 10
ROOMS = [('room1_cook_room', 0, 6.0), ('room2_seating_room', LY.SW, 12.0), ('room4_bedroom', 3 * LY.SW, 6.0)]


def main(out):
    os.makedirs(out, exist_ok=True)
    sc = build.Scene()
    for name, cam, dur in ROOMS:
        frames = [sc.view(k / FPS, cam).image(2).convert('RGB') for k in range(int(dur * FPS))]
        # one palette from a strip of frames spread through the loop
        picks = frames[::max(1, len(frames) // 8)]
        strip = Image.new('RGB', (frames[0].width, frames[0].height * len(picks)))
        for i, f in enumerate(picks):
            strip.paste(f, (0, i * f.height))
        pal = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
        path = os.path.join(out, name + '.gif')
        q[0].save(path, save_all=True, append_images=q[1:], duration=1000 // FPS, loop=0, optimize=True)
        print('wrote', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'polish'))
