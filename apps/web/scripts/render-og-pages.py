#!/usr/bin/env python3
"""Renders a share image (og:image, 1200x630) for every use-case page and article: public/og/<slug>.png.

  python3 scripts/render-og-pages.py --font /path/to/Inter-variable.ttf   (needs Pillow with raqm, and numpy)

Same look as public/og.png (render-og.py): Inter on warm paper with a soft teal glow. The page's H1 is on the
left; its first guide image (public/img/guides, captures of the site's own demos) is on the right. The font is NOT
in the repo: Inter's variable font (OFL), as for render-og.py.
Run it again after changing a page's H1 or its first image."""
import argparse, glob, os, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), "..")
ap = argparse.ArgumentParser()
ap.add_argument("--font", required=True)
args = ap.parse_args()
W, H = 1200, 630
LABEL = {"use-cases": "Use case", "blog": "Guide"}

def font(size, wght):
    f = ImageFont.truetype(args.font, size, layout_engine=ImageFont.Layout.RAQM)
    f.set_variation_by_axes([14, wght])
    return f

def background():
    yy, xx = np.mgrid[0:H, 0:W].astype(float) + 0.5
    a = np.clip(1 - np.sqrt(((xx - 890) / 420) ** 2 + ((yy - 330) / 380) ** 2), 0, 1) * 0.16   # a soft teal glow behind the picture
    im = np.array([247, 246, 243], float)[None, None] * (1 - a[..., None]) + np.array([92, 196, 224], float)[None, None] * a[..., None]
    return Image.fromarray(np.clip(im + 0.5, 0, 255).astype("uint8")).convert("RGBA")

KEEP_TOGETHER = ["@n-uf/motion"]   # names a line break would split

def wrap(text, f, width):
    for name in KEEP_TOGETHER:
        text = text.replace(name, name.replace(" ", " "))
    lines, line = [], ""
    for word in text.split(" "):   # plain spaces only, so a no-break space holds
        trial = f"{line} {word}".strip()
        if f.getlength(trial) <= width or not line:
            line = trial
        else:
            lines.append(line); line = word
    lines.append(line)
    # no single word alone on the last line ("Mac"): take the word before it along, if that still fits
    if len(lines) > 1 and " " not in lines[-1] and " " in lines[-2]:
        head, moved = lines[-2].rsplit(" ", 1)
        if f.getlength(f"{moved} {lines[-1]}") <= width:
            lines[-2:] = [head, f"{moved} {lines[-1]}"]
    return lines

def picture(path, box_w, box_h):
    im = Image.open(path).convert("RGBA")
    s = min(box_w / im.width, box_h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=14, fill=255)
    im.putalpha(mask)
    return im

for md in sorted(glob.glob(os.path.join(ROOT, "src/content/use-cases/*.md")) + glob.glob(os.path.join(ROOT, "src/content/blog/*.md"))):
    src = open(md, encoding="utf-8").read()
    m = re.search(r'^h1:\s*"?(.*?)"?\s*$', src, re.M)
    if not m:
        print("skipped (no h1):", md); continue
    h1 = m.group(1).replace('\\"', '"')
    shot = re.search(r"\]\(/img/guides/([^ )]+)", src)
    section = os.path.basename(os.path.dirname(md))
    slug = os.path.splitext(os.path.basename(md))[0]
    out = background()
    d = ImageDraw.Draw(out)
    # left: what it is, the page's H1, the address
    d.text((64, 104), f"n-uf motion · {LABEL[section]}", font=font(26, 650), fill=(133, 134, 140), anchor="ls")
    size = 54
    while True:
        f = font(size, 700)
        lines = wrap(h1, f, 520)
        # at most 4 lines, and no line wider than the column (a long word such as prefersReducedMotion)
        if (len(lines) <= 4 and max(f.getlength(l) for l in lines) <= 520) or size <= 40:
            break
        size -= 2
    y = 200
    for line in lines:
        d.text((64, y), line, font=f, fill=(27, 28, 31), anchor="ls")
        y += round(size * 1.18)
    d.text((64, 578), "motion.n-uf.com", font=font(20, 550), fill=(10, 118, 151), anchor="ls")
    # right: the page's first picture, with a faint edge
    if shot:
        pic = picture(os.path.join(ROOT, "public/img/guides", shot.group(1)), 500, 470)
        x, y0 = 640 + (500 - pic.width) // 2, 80 + (470 - pic.height) // 2
        edge = Image.new("RGBA", (pic.width + 2, pic.height + 2), (0, 0, 0, 0))
        ImageDraw.Draw(edge).rounded_rectangle((0, 0, pic.width + 1, pic.height + 1), radius=15, outline=(27, 28, 31, 40), width=1)
        out.alpha_composite(pic, (x, y0))
        out.alpha_composite(edge, (x - 1, y0 - 1))
    os.makedirs(os.path.join(ROOT, "public/og"), exist_ok=True)
    path = os.path.join(ROOT, "public/og", f"{slug}.png")
    out.convert("RGB").save(path, optimize=True)
    print(f"wrote public/og/{slug}.png  {os.path.getsize(path) // 1024} KB  {size}px x{len(lines)}")
