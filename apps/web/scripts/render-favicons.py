#!/usr/bin/env python3
"""Renders the site's browser and search icons from the one vector mark, public/favicon.svg (needs rsvg-convert, from
`brew install librsvg`, and Pillow).

  python3 scripts/render-favicons.py

Every size is drawn from the vector, never scaled up from a smaller picture:
  public/favicon.svg           the square vector itself (not touched here)
  public/favicon.ico           16, 32 and 48 px: the tab icon and the /favicon.ico fallback
  public/favicon.png           96 px  } search results: Google wants a square whose side is a multiple of 48
  public/icon-192.png          192 px }
  public/apple-touch-icon.png  180 px: the home-screen icon on iPhone and iPad, full-bleed (iOS rounds the corners)"""
import os, subprocess, tempfile
from PIL import Image

PUBLIC = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public"))
SVG = os.path.join(PUBLIC, "favicon.svg")

def draw(px, svg=SVG):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "i.png")
        subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px), "-o", out, svg], check=True)
        im = Image.open(out).convert("RGBA"); im.load()
    assert im.size == (px, px), im.size
    return im

def save(im, name, **kw):
    path = os.path.join(PUBLIC, name)
    im.save(path, optimize=True, **kw)
    print("wrote", os.path.relpath(path), im.size[0] if name.endswith(".png") else "16/32/48", "px")

ico = [draw(px) for px in (16, 32, 48)]
save(ico[-1], "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:-1])
save(draw(96), "favicon.png")
save(draw(192), "icon-192.png")
# the touch icon fills the square: the same drawing with square corners
with tempfile.TemporaryDirectory() as tmp:
    sq = os.path.join(tmp, "square.svg")
    open(sq, "w").write(open(SVG).read().replace('rx="116"', 'rx="0"'))
    save(draw(180, sq), "apple-touch-icon.png")
