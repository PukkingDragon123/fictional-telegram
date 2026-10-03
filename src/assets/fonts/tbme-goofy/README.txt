TBME Goofy: how it is made (Python 3 + fontTools + Pillow + brotli)
  npm pack @fontsource/chewy && tar xzf fontsource-chewy-*.tgz     (Chewy, Apache 2.0, Font Diner / Sideshow)
  python3 -c "from fontTools.ttLib import TTFont as T; f=T('package/files/chewy-latin-400-normal.woff2'); f.flavor=None; f.save('chewy-400.ttf')"
  python3 build_goofy.py chewy-400.ttf ..                  -> ../TBMEGoofy-Regular.woff2
  python3 gen_goofy_js.py chewy-400.ttf ../../../ui/goofyFont.js   -> canvas bitmap tables
pix.py rasterizes the vector font onto a 20 px em pixel grid (caps 14 px; 8x supersampled
coverage, 50% threshold) and gives every letter a fixed little hop (+-1 px) and tilt
(+-3 deg); build.py draws the symbols (male/female, stars, hearts, arrows, ticks...) on the
same grid and writes the woff2 (UPM 1000, 1 pixel = 50 units, ascent 0.95em, descent 0.25em).
build_goofy.py redraws a few glyphs for clarity (B, flagged 1, serif I, + x - middle dot).
