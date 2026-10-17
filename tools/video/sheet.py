# contact sheet of a frames dir: python3 tools/video/sheet.py <dir> [cols] [width]
import sys, glob, os
from PIL import Image, ImageDraw
d = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 3; w = int(sys.argv[3]) if len(sys.argv) > 3 else 640
fs = sorted(glob.glob(os.path.join(d, 'f*.jpg')))
if not fs: sys.exit('no frames')
step = max(1, len(fs) // 12)
fs = fs[::step][:12]
ims = [Image.open(f) for f in fs]
h = int(w * ims[0].height / ims[0].width)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * w, rows * h))
for i, (f, im) in enumerate(zip(fs, ims)):
    im = im.resize((w, h))
    ImageDraw.Draw(im).text((6, 4), os.path.basename(f), fill=(255, 255, 0))
    S.paste(im, ((i % cols) * w, (i // cols) * h))
S.save(os.path.join(d, 'sheet.jpg'), quality=82)
print(os.path.join(d, 'sheet.jpg'))
