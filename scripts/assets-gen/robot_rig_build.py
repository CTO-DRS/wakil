"""Builds the articulated robot rig layers (v1.4) from generated art.

Inputs (work/rig-art/): rig_front_v3.png (front A-pose upper body, chroma-keyed),
rig_heads.png (3/4 + profile heads, both facing viewer's left), rig_hands.png (point / ? / fist).
Outputs: wakil/app/src/main/res/drawable-nodpi/rig_*.webp and work/rig-art/rig.json
(all coordinates in "rig units" = pixels of rig_front_v3.png, 1024x1024).
Layers are exported at EXPORT scale; each has a rig-space box (x, y, w, h).
Only the robot's right arm (screen-left) is cut; the other arm is the mirror image at x = MIRROR_X.
"""
import json, math, os
import numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage as nd

P = '/workspace/projects/63d46980-7164-4457-910d-060f812d1fca'
ART = f'{P}/work/rig-art'
RES = f'{P}/wakil/app/src/main/res/drawable-nodpi'
EXPORT = 1.0          # export pixels per rig unit
MIRROR_X = 512.0

def load(name):
    a = np.asarray(Image.open(f'{ART}/{name}').convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3] / 255.0
    # despill chroma green at the edges
    g_lim = np.maximum(rgb[..., 0], rgb[..., 2]) * 1.02 + 6
    rgb[..., 1] = np.where(rgb[..., 1] > g_lim, g_lim, rgb[..., 1])
    # soften the hard key: slight erode + blur
    m = (al > 0.5).astype(np.uint8)
    m = cv2.erode(m, np.ones((2, 2), np.uint8))
    al = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8)
    return rgb, al

def biggest(mask, seed=None):
    lab, n = nd.label(mask)
    if n == 0: return mask
    if seed is not None and lab[seed[1], seed[0]] > 0:
        return lab == lab[seed[1], seed[0]]
    sz = nd.sum(mask, lab, range(1, n + 1))
    return lab == (np.argmax(sz) + 1)

def joint_disc(r, ring=True, s=4):
    """Dark mechanical joint cap (RGBA float arrays), size 2r x 2r rig px, supersampled."""
    R = int(math.ceil(r * s)); D = 2 * R
    yy, xx = np.mgrid[0:D, 0:D].astype(np.float32) + 0.5
    dx, dy = (xx - R) / R, (yy - R) / R
    d = np.sqrt(dx * dx + dy * dy)
    a = np.clip((1 - d) * R / 1.5, 0, 1)
    # metallic shading: light from top-left
    shade = np.clip(0.5 - 0.45 * (dx * 0.6 + dy * 0.8), 0, 1)
    base = np.array([14, 17, 24], np.float32) + shade[..., None] * np.array([52, 58, 72], np.float32)
    # concentric grooves
    groove = (np.abs(d - 0.62) < 0.035) | (np.abs(d - 0.86) < 0.03)
    base[groove] *= 0.45
    if ring:
        cy = np.exp(-((d - 0.74) / 0.05) ** 2)
        base += cy[..., None] * np.array([40, 150, 255], np.float32) * 0.55
    hub = d < 0.22
    base[hub] = base[hub] * 0.6 + np.array([30, 34, 44]) * 0.4
    rgba = np.dstack([np.clip(base, 0, 255), a * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA').resize((max(2, round(2 * r)), max(2, round(2 * r))), Image.LANCZOS)
    return im

class Layer:
    def __init__(self, rgb, al, name):
        self.rgb, self.al, self.name = rgb, al, name

def to_img(rgb, al):
    return Image.fromarray(np.dstack([rgb, al * 255]).clip(0, 255).astype(np.uint8), 'RGBA')

def crop_export(img, name, pad=4, extra=None):
    """img: RGBA PIL in rig space (any size, origin 0,0 = rig 0,0 unless extra offset). Returns rig box."""
    ox, oy = extra or (0, 0)
    bb = img.getbbox()
    x0, y0, x1, y1 = bb
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad); x1 = min(img.width, x1 + pad); y1 = min(img.height, y1 + pad)
    c = img.crop((x0, y0, x1, y1))
    w, h = round(c.width * EXPORT), round(c.height * EXPORT)
    out = c.resize((w, h), Image.LANCZOS)
    path = f'{RES}/rig_{name}.webp'
    out.save(path, 'WEBP', quality=86, method=6)
    out.save(f'{ART}/layers/{name}.png')
    return dict(x=x0 + ox, y=y0 + oy, w=x1 - x0, h=y1 - y0, file=f'rig_{name}', px=[w, h], bytes=os.path.getsize(path))

os.makedirs(f'{ART}/layers', exist_ok=True)
rgb, al = load('rig_front_v3.png')
H_, W_ = al.shape
yy, xx = np.mgrid[0:H_, 0:W_].astype(np.float32)

# ---------------- pivots (rig units) ----------------
SH = (288.0, 472.0)   # shoulder ball joint (under pauldron)
EL = (219.0, 672.0)   # elbow
WR = (144.0, 843.0)   # wrist
HD = (512.0, 330.0)   # neck / head pivot

def axis(a, b):
    v = np.array([b[0] - a[0], b[1] - a[1]], np.float32); L = np.linalg.norm(v); return v / L, L

# ---------------- arm ----------------
armMask = biggest((al > 0.02) & (xx < 338), seed=(150, 700))
u_up, Lup = axis(SH, EL)
u_fa, Lfa = axis(EL, WR)
t_up = (xx - SH[0]) * u_up[0] + (yy - SH[1]) * u_up[1]
t_fa = (xx - EL[0]) * u_fa[0] + (yy - EL[1]) * u_fa[1]
t_hd = (xx - WR[0]) * u_fa[0] + (yy - WR[1]) * u_fa[1]

pauld_poly = Image.new('L', (W_, H_), 0)
ImageDraw.Draw(pauld_poly).polygon([(190, 340), (342, 340), (342, 455), (318, 478), (290, 500), (248, 522), (196, 545)], fill=1)
pauld = armMask & (np.asarray(pauld_poly) > 0)
upper = armMask & ~pauld & (t_up <= Lup + 26) & (t_fa < 30)
fore = armMask & (t_fa >= 2) & (t_hd <= 10) & ~pauld
hand = armMask & (t_hd >= -4)

def part(mask, feather=0.0):
    a = al * mask
    return to_img(rgb, a)

def paste_disc(img, c, r, ring=True, behind=True):
    d = joint_disc(r, ring)
    lay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    lay.paste(d, (round(c[0] - d.width / 2), round(c[1] - d.height / 2)), d)
    if behind:
        lay.alpha_composite(img); return lay
    img.alpha_composite(lay); return img

rig = {'units': 'v3px', 'export': EXPORT, 'mirrorX': MIRROR_X,
       'pivots': {'shoulder': SH, 'elbow': EL, 'wrist': WR, 'neck': HD}, 'layers': {}}

up_img = paste_disc(part(upper), SH, 46)          # ball at the top (hidden under pauldron at rest)
fa_img = paste_disc(part(fore), EL, 40)          # elbow cap behind the forearm top
hand_img = paste_disc(part(hand), WR, 22, ring=False)
pa_img = part(pauld)
rig['layers']['upperArm'] = crop_export(up_img, 'upper_arm')
rig['layers']['forearm'] = crop_export(fa_img, 'forearm')
rig['layers']['handOpen'] = crop_export(hand_img, 'hand_open')
rig['layers']['pauldron'] = crop_export(pa_img, 'pauldron')

# ---------------- torso ----------------
torsoMask = (al > 0.02) & (xx >= 338) & (xx <= 2 * MIRROR_X - 338)
head_poly = Image.new('L', (W_, H_), 0)
ImageDraw.Draw(head_poly).polygon([(300, 0), (724, 0), (724, 300), (600, 318), (560, 336), (464, 336), (424, 318), (300, 300)], fill=1)
headMask = torsoMask & (np.asarray(head_poly) > 0)
torso = torsoMask & ~headMask
# torso keeps the neck; fade the hips out (hologram bust)
fade = np.clip((900 - yy) / 140, 0, 1) ** 1.3
t_img = to_img(rgb, al * torso * fade)
# shoulder sockets behind the arms (both sides)
t_img = paste_disc(t_img, SH, 58)
t_img = paste_disc(t_img, (2 * MIRROR_X - SH[0], SH[1]), 58)
rig['layers']['torso'] = crop_export(t_img, 'torso')

# front head: helmet + a neck stub that fades into the torso neck
hfade = np.clip((352 - yy) / 26, 0, 1)
h_img = to_img(rgb, al * (headMask | (torsoMask & (yy < 352) & (np.abs(xx - 512) < 62))) * hfade)
rig['layers']['headFront'] = crop_export(h_img, 'head_front')

# ---------------- side heads ----------------
hr, ha = load('rig_heads.png')
Hs, Ws = ha.shape
yy2, xx2 = np.mgrid[0:Hs, 0:Ws].astype(np.float32)
FRONT_H = 320 - 62     # helmet top..chin in the front view
heads = {
    # name: (x-range, top, chin, neck anchor x, anchor y)
    'head34': ((0, 520), 205, 612, 292, 625),
    'headSide': ((520, 1024), 205, 605, 812, 618),
}
heads_lens = {'head34': (428, 408), 'headSide': (803, 401)}
for name, ((xa, xb), top, chin, ax, ay) in heads.items():
    s = FRONT_H / (chin - top) * 1.02
    m = (ha > 0.02) & (xx2 >= xa) & (xx2 < xb)
    m = biggest(m)
    f = np.clip((ay + 22 - yy2) / 30, 0, 1)
    img = to_img(hr, ha * m * f)
    bb = img.getbbox(); img = img.crop(bb)
    img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    # place so that the neck anchor lands on the neck pivot (slightly above it, like the front head)
    ox = HD[0] - (ax - bb[0]) * s
    oy = HD[1] - (ay - bb[1]) * s
    canvas = Image.new('RGBA', (W_, H_), (0, 0, 0, 0))
    canvas.alpha_composite(img, (round(ox), round(oy))) if ox >= 0 and oy >= 0 else canvas.paste(img, (round(ox), round(oy)), img)
    rig.setdefault('lens', {})[name] = [HD[0] + (heads_lens[name][0] - ax) * s, HD[1] + (heads_lens[name][1] - ay) * s]
    rig['layers'][name] = crop_export(canvas, name.replace('head34', 'head_34').replace('headSide', 'head_side'))

# ---------------- hand variants (point, fist) ----------------
nr, na = load('rig_hands.png')
Hh, Wh = na.shape
yy3, xx3 = np.mgrid[0:Hh, 0:Wh].astype(np.float32)
# open hand reference: palm width & wrist->knuckle length in rig units
def sheet_hand(xa, xb, anchor, knuck, cut, name, flip=False):
    m = biggest((na > 0.02) & (xx3 >= xa) & (xx3 < xb))
    m = m & (yy3 < cut)
    f = np.clip((cut - yy3) / 10, 0, 1)
    img = to_img(nr, na * m * f)
    s = knuck  # scale (rig units per sheet px), chosen so the palm width matches the open hand
    img = img.resize((round(Wh * s), round(Hh * s)), Image.LANCZOS)
    if flip: img = img.transpose(Image.FLIP_LEFT_RIGHT); anchor = (Wh - anchor[0], anchor[1])
    ax, ay = anchor[0] * s, anchor[1] * s
    # rotate so "up" (wrist->fingers) maps to the forearm direction u_fa
    ang = math.degrees(math.atan2(u_fa[1], u_fa[0])) - (-90.0)   # rotate -90deg(up) -> u_fa
    big = Image.new('RGBA', (img.width * 2, img.height * 2), (0, 0, 0, 0))
    big.paste(img, (round(img.width - ax), round(img.height - ay)), img)
    big = big.rotate(-ang, resample=Image.BICUBIC, center=(img.width, img.height))
    canvas = Image.new('RGBA', (W_, H_), (0, 0, 0, 0))
    canvas.paste(big, (round(WR[0] - img.width), round(WR[1] - img.height)), big)
    canvas = paste_disc(canvas, WR, 22, ring=False)
    return crop_export(canvas, name)

with open(f'{ART}/hand_sheet_anchors.json') as fh:
    hs = json.load(fh)
for k, v in hs.items():
    rig['layers'][k] = sheet_hand(v['xa'], v['xb'], tuple(v['wrist']), v['knuckle'], v['cut'], v['file'], v.get('flip', False))

json.dump(rig, open(f'{ART}/rig.json', 'w'), indent=1)
tot = sum(l['bytes'] for l in rig['layers'].values())
print(json.dumps({k: (v['x'], v['y'], v['w'], v['h'], v['px'], v['bytes']) for k, v in rig['layers'].items()}))
print('total bytes', tot)
