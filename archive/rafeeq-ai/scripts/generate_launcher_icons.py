#!/usr/bin/env python3
"""Generate the alternate launcher icon designs for Rafeeq AI.

Seven abstract, geometric designs (no fonts, no fake screenshots) rendered
with PIL at 4x supersampling. For every design and density this writes the
two adaptive-icon layers the withLauncherIcons config plugin installs:

  assets/launcher-icons/<id>/<dpi>/ic_launcher_<id>_bg.png   (full-bleed)
  assets/launcher-icons/<id>/<dpi>/ic_launcher_<id>_fg.png   (transparent, safe zone)

Plus one 128px thumbnail per design (and the default) for the in-app picker:
  assets/launcher-icons/thumbs/<id>.png
"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "launcher-icons")

# Android adaptive icon: 108dp canvas, ~66% safe zone; density scale factors.
DENSITIES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
SS = 4  # supersample factor


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def vgrad(size, top, bottom):
    g = Image.new("RGB", (1, 64))
    for y in range(64):
        g.putpixel((0, y), lerp(top, bottom, y / 63))
    return g.resize((size, size), Image.BILINEAR).convert("RGBA")


def rgrad(size, inner, outer, cx=0.5, cy=0.42):
    g = Image.new("RGB", (96, 96))
    for y in range(96):
        for x in range(96):
            d = min(1.0, (((x / 95 - cx) * 1.35) ** 2 + ((y / 95 - cy) * 1.35) ** 2) ** 0.5)
            g.putpixel((x, y), lerp(inner, outer, d))
    return g.resize((size, size), Image.BILINEAR).convert("RGBA")


def canvas(px):
    return Image.new("RGBA", (px * SS, px * SS), (0, 0, 0, 0))


def down(img, px):
    return img.resize((px, px), Image.LANCZOS)


def S(img):
    """Draw context for the supersampled image, scaled to 0..1 coordinates."""
    return img, img.size[0]


def poly(d, pts, fill, scale):
    d.polygon([(x * scale, y * scale) for (x, y) in pts], fill=fill)


def ellipse(d, box, fill, scale, width=None, outline=None):
    b = [box[0] * scale, box[1] * scale, box[2] * scale, box[3] * scale]
    d.ellipse(b, fill=fill, width=int(width * scale) if width else None, outline=outline)


def rrect(d, box, r, fill, scale, width=None, outline=None):
    b = [box[0] * scale, box[1] * scale, box[2] * scale, box[3] * scale]
    d.rounded_rectangle(b, radius=r * scale, fill=fill, width=int(width * scale) if width else None, outline=outline)


def arc(d, box, start, end, fill, width, scale):
    b = [box[0] * scale, box[1] * scale, box[2] * scale, box[3] * scale]
    d.arc(b, start=start, end=end, fill=fill, width=int(width * scale))


# ---- design painters: (bg painter, fg painter) -----------------------------

def bg_midnight(px):
    return vgrad(px, (16, 22, 44), (49, 46, 129))


def fg_midnight(px):
    img = canvas(px); d = ImageDraw.Draw(img); _, s = S(img)
    hi, lo = (167, 139, 250, 255), (37, 99, 235, 255)
    poly(d, [(0.30, 0.28), (0.52, 0.50), (0.30, 0.72)], hi, s)
    poly(d, [(0.52, 0.28), (0.74, 0.50), (0.52, 0.72)], lo, s)
    ellipse(d, (0.66, 0.62, 0.78, 0.74), (34, 211, 238, 255), s)
    return down(img, px)


def bg_gold(px):
    return rgrad(px, (30, 28, 22), (10, 10, 11), 0.5, 0.42)


def fg_gold(px):
    img = canvas(px); d = ImageDraw.Draw(img); _, s = S(img)
    gold = (212, 175, 55, 255); pale = (232, 199, 102, 255)
    arc(d, (0.16, 0.16, 0.84, 0.84), 0, 360, (212, 175, 55, 90), 0.012, s)
    poly(d, [(0.50, 0.24), (0.76, 0.50), (0.50, 0.76), (0.24, 0.50)], gold, s)
    poly(d, [(0.50, 0.40), (0.60, 0.50), (0.50, 0.60), (0.40, 0.50)], (20, 16, 8, 255), s)
    ellipse(d, (0.46, 0.46, 0.54, 0.54), pale, s)
    return down(img, px)


def bg_glass(px):
    return vgrad(px, (14, 165, 233), (99, 102, 241))


def fg_glass(px):
    img = canvas(px); d = ImageDraw.Draw(img); _, s = S(img)
    rrect(d, (0.18, 0.18, 0.82, 0.82), 0.24, (255, 255, 255, 74), s, width=0.016, outline=(255, 255, 255, 150))
    poly(d, [(0.42, 0.34), (0.42, 0.66), (0.68, 0.50)], (94, 234, 212, 255), s)
    return down(img, px)


def bg_cyber(px):
    return rgrad(px, (44, 12, 38), (11, 8, 18), 0.32, 0.30)


def fg_cyber(px):
    img = canvas(px); d = ImageDraw.Draw(img); _, s = S(img)
    poly(d, [(0.56, 0.18), (0.30, 0.54), (0.48, 0.54), (0.40, 0.82), (0.70, 0.44), (0.52, 0.44)], (255, 45, 140, 255), s)
    ellipse(d, (0.62, 0.66, 0.74, 0.78), (255, 209, 102, 255), s)
    return down(img, px)


def bg_neon(px):
    return vgrad(px, (7, 11, 8), (13, 26, 18))


def fg_neon(px):
    img = canvas(px); d = ImageDraw.Draw(img); _, s = S(img)
    ellipse(d, (0.20, 0.20, 0.80, 0.80), None, s, width=0.035, outline=(74, 255, 159, 255))
    ellipse(d, (0.34, 0.34, 0.66, 0.66), None, s, width=0.030, outline=(74, 255, 159, 220))
    ellipse(d, (0.44, 0.44, 0.56, 0.56), (56, 229, 255, 255), s)
    return down(img, px)


def bg_mono(px):
    return vgrad(px, (242, 242, 242), (224, 224, 228))


def fg_mono(px):
    img = canvas(px); d = ImageDraw.Draw(img); _, s = S(img)
    rrect(d, (0.22, 0.22, 0.78, 0.78), 0.18, None, s, width=0.045, outline=(17, 17, 20, 255))
    ellipse(d, (0.58, 0.58, 0.72, 0.72), (99, 102, 241, 255), s)
    return down(img, px)


def bg_sunset(px):
    return vgrad(px, (244, 63, 94), (245, 158, 11))


def fg_sunset(px):
    img = canvas(px); d = ImageDraw.Draw(img); _, s = S(img)
    arc(d, (0.24, 0.24, 0.86, 0.86), 205, 305, (255, 255, 255, 160), 0.05, s)
    ellipse(d, (0.40, 0.28, 0.62, 0.50), (255, 255, 255, 255), s)
    ellipse(d, (0.47, 0.35, 0.55, 0.43), (244, 63, 94, 110), s)
    return down(img, px)


DESIGNS = {
    "midnight": (bg_midnight, fg_midnight),
    "gold": (bg_gold, fg_gold),
    "glass": (bg_glass, fg_glass),
    "cyber": (bg_cyber, fg_cyber),
    "neon": (bg_neon, fg_neon),
    "mono": (bg_mono, fg_mono),
    "sunset": (bg_sunset, fg_sunset),
}

THUMB_DPI = {"thumb": 192}


def main():
    written = 0
    for design, (bgp, fgp) in DESIGNS.items():
        for dpi, px in {**DENSITIES, **THUMB_DPI}.items():
            out = os.path.join(ROOT, design, dpi)
            os.makedirs(out, exist_ok=True)
            bgp(px).convert("RGB").save(os.path.join(out, f"ic_launcher_{design}_bg.png"))
            fgp(px).save(os.path.join(out, f"ic_launcher_{design}_fg.png"))
            written += 2
        # The picker thumbnail: bg + fg composite at 192px.
        thumb = bgp(192)
        fg = fgp(192)
        thumb.alpha_composite(fg)
        os.makedirs(os.path.join(ROOT, "thumbs"), exist_ok=True)
        thumb.save(os.path.join(ROOT, "thumbs", f"{design}.png"))
        written += 1
    print(f"OK: {written} files under {ROOT}")


if __name__ == "__main__":
    main()
