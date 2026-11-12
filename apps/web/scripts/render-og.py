#!/usr/bin/env python3
"""Renders the share images (og:image, 1200x630) of the fixed pages: public/og.png (home) and public/og/<slug>.png for
the four demo pages. Inter on warm paper with a soft teal glow, and a capture of the page's demo on the right
(scripts/og-src/*.png, made by scripts/capture-og.mjs). No browser needed here.

  python3 scripts/render-og.py --font /path/to/InterVariable.ttf   (needs Pillow with raqm, and numpy)

The font is NOT in the repo: use Inter's variable font (family Inter, axes opsz + wght; https://fonts.google.com/specimen/Inter
or the rsms/inter release). Edit CARDS below to change the wording; the use-case pages and articles get theirs from
render-og-pages.py."""
import argparse, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
W, H = 1200, 630
INK, MUTED, FAINT, ACCENT = (27, 28, 31), (85, 86, 92), (133, 134, 140), (10, 118, 151)
# out file, small label, headline, sub line, capture (in scripts/og-src), picture box (width, height)
CARDS = [
    ("public/og.png", "n-uf motion & placement", "Window motion and docking", "@n-uf/motion moves windows with a settle that never overshoots; @n-uf/placement docks them", "home.png", (560, 420)),
    ("public/og/window-motion.png", "@n-uf/motion · Window motion", "Fast at the start, gentle at the end", "Settle against Hyprland's springs and a typical app's tweens", "window-motion.png", (560, 470)),
    ("public/og/drag-intent.png", "@n-uf/motion · Drag intent", "An indicator only once you aim", "No flicker on borders; the drop lands where it showed", "drag-intent.png", (560, 440)),
    ("public/og/desk-layouts.png", "@n-uf/placement · Desk layouts", "Nine ways to build a desk", "Docks, a tiling tree, a strip, drawers and palettes", "desk-layouts.png", (560, 440)),
    ("public/og/toolbar-groups.png", "@n-uf/placement · Toolbar groups", "One handle per group", "Five hosts, three zones, and a lock that hides every grip", "toolbar-groups.png", (560, 440)),
]

ap = argparse.ArgumentParser()
ap.add_argument("--font", required=True)
args = ap.parse_args()

def font(size, wght):
    f = ImageFont.truetype(args.font, size, layout_engine=ImageFont.Layout.RAQM)
    f.set_variation_by_axes([14, wght])
    return f

def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(float) + 0.5
    a = np.clip(1 - np.sqrt(((xx - 900) / 520) ** 2 + ((yy - 315) / 420) ** 2), 0, 1) * 0.16   # a soft teal glow behind the picture
    im = np.array([247, 246, 243], float)[None, None] * (1 - a[..., None]) + np.array([92, 196, 224], float)[None, None] * a[..., None]
    return Image.fromarray(np.clip(im + 0.5, 0, 255).astype("uint8")).convert("RGBA")

def wrap(text, f, width):
    lines, line = [], ""
    for word in text.split(" "):
        trial = f"{line} {word}".strip()
        if f.getlength(trial) <= width or not line:
            line = trial
        else:
            lines.append(line); line = word
    lines.append(line)
    return lines

def picture(path, box_w, box_h):
    """The capture scaled into its box, on a white card with rounded corners and a hairline."""
    im = Image.open(path).convert("RGBA")
    s = min(box_w / im.width, box_h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    pad, r = 14, 16
    card = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    mask = Image.new("L", card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, card.width - 1, card.height - 1), r, fill=255)
    card.paste((255, 255, 255, 255), (0, 0), mask)
    ImageDraw.Draw(card).rounded_rectangle((0, 0, card.width - 1, card.height - 1), r, outline=(222, 220, 214, 255), width=2)
    card.alpha_composite(im, (pad, pad))
    return card

def mark(d, x, y, s):
    """The site's mark (a settle curve ending on its target line) at (x, y), s px square."""
    k = s / 24
    d.line([(x + 3 * k, y + 5.5 * k), (x + 21 * k, y + 5.5 * k)], fill=(190, 188, 180), width=max(1, round(1.5 * k)))
    pts = []
    for i in range(41):
        t = i / 40   # the cubic of the mark's path: M3 20.5 C5.2 9.6 8.4 6.6 21 5.5
        bx = (1 - t) ** 3 * 3 + 3 * (1 - t) ** 2 * t * 5.2 + 3 * (1 - t) * t * t * 8.4 + t ** 3 * 21
        by = (1 - t) ** 3 * 20.5 + 3 * (1 - t) ** 2 * t * 9.6 + 3 * (1 - t) * t * t * 6.6 + t ** 3 * 5.5
        pts.append((x + bx * k, y + by * k))
    d.line(pts, fill=INK, width=round(2.2 * k), joint="curve")
    d.ellipse((x + 19 * k, y + 3.5 * k, x + 23 * k, y + 7.5 * k), fill=ACCENT)

for out_path, label, head, sub, pic, box in CARDS:
    out = background()
    d = ImageDraw.Draw(out)
    mark(d, 64, 76, 34)
    d.text((110, 104), label, font=font(26, 650), fill=FAINT, anchor="ls")
    size = 60
    while True:
        f = font(size, 700)
        lines = wrap(head, f, 470)
        if (len(lines) <= 4 and max(f.getlength(l) for l in lines) <= 470) or size <= 40:
            break
        size -= 2
    y = 210
    for line in lines:
        d.text((64, y), line, font=f, fill=INK, anchor="ls")
        y += round(size * 1.12)
    sf = font(24, 450)
    for line in wrap(sub, sf, 460):
        d.text((64, y + 22), line, font=sf, fill=MUTED, anchor="ls")
        y += 34
    d.text((64, 578), "motion.n-uf.com", font=font(20, 550), fill=ACCENT, anchor="ls")
    img = picture(os.path.join(ROOT, "scripts/og-src", pic), *box)
    x, y0 = 1200 - 48 - img.width, (H - img.height) // 2
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    shadow.paste((20, 20, 16, 60), (x, y0 + 16), img.split()[3])
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(22)))
    out.alpha_composite(img, (x, y0))
    path = os.path.join(ROOT, out_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.convert("RGB").save(path, optimize=True)
    print(f"wrote {out_path}  {os.path.getsize(path) // 1024} KB  {size}px x{len(lines)}")
