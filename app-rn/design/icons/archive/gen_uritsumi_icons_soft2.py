"""うりつみ アプリアイコン: 柔らかい配色(ピンク/ミント)に背景の散らし要素を足す。

前回の8案(足元に積み上げ / 値札を持つ × 4配色)からピンクとミントを軸に選定。
今回の変更点:
  1. 足元の積み上げ・手に持つ値札を一回り大きくする(60pxで消えないように)
  2. 前作(スタンプ抜き)の「太陽・星・月を背景に散らす」構造を踏襲し、
     背景に小さな要素を3〜4個散らす。パターンは以下:
       - 葉っぱ/小さな芽(植物モチーフ)
       - タグを小さく散らす
       - 光の粒(前作の star() を流用)
       - 金色の光の粒(コイン系の派生。星と同じ要領で金色にする)
  3. 追加パターン: 積み上げをコインの山にする/鳥が金貨を1枚抱える
     (コインは丸い金色の面のみ。円記号・数字・札束は使わない)

コイン・円記号・数字は一切使わない。鳥の形・色・パーツ構成は元スクリプトのまま。
"""
import math
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0

_scale = 1.0
_pivot = (50.0, 54.0)
_offset = (0.0, 0.0)


def set_transform(scale, pivot, offset=(0.0, 0.0)):
    global _scale, _pivot, _offset
    _scale, _pivot, _offset = scale, pivot, offset


def T(x, y):
    px, py = _pivot
    x = px + (x - px) * _scale
    y = py + (y - py) * _scale
    return x + _offset[0], y + _offset[1]


def P(*xy):
    return [tuple(v * S for v in T(x, y)) for x, y in xy]


def box(x, y, w, h):
    x0, y0 = T(x, y)
    x1, y1 = T(x + w, y + h)
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def circle(d, cx, cy, r, color):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), fill=color)


def line(d, pts, color, w, joint='curve'):
    lw = max(w * _scale, 0.1)
    d.line(P(*pts), fill=color, width=max(1, int(round(lw * S))), joint=joint)
    for x, y in pts:
        circle(d, x, y, w / 2, color)


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def diag_gradient(c_tl, c_br):
    m = 256
    grad = Image.new('RGB', (m, m))
    px = grad.load()
    for y in range(m):
        for x in range(m):
            t = (x + y) / (2 * (m - 1))
            px[x, y] = tuple(int(round(c_tl[i] + (c_br[i] - c_tl[i]) * t)) for i in range(3))
    return grad.resize((OUT * SS, OUT * SS), Image.BICUBIC).convert('RGBA')


# ── 鳥のパーツ(共通・形と色は不変) ──────────────────────────────

def bird_tail(d):
    d.polygon(P((55, 72), (84, 86), (82, 93), (52, 81)), fill='#3A3A3C')


def bird_feet(d):
    for fx in (45, 55):
        line(d, [(fx, 82), (fx, 90)], '#FF9500', 2)
        line(d, [(fx - 3, 91), (fx, 90), (fx + 3, 91)], '#FF9500', 2)


def bird_body(d):
    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')


def bird_wing(d):
    d.ellipse(box(61, 44, 18, 32), fill='#D8D8DC')


def bird_face(d):
    circle(d, 42, 48, 3, '#1C1C1E')
    circle(d, 58, 48, 3, '#1C1C1E')
    d.polygon(P((47, 54), (53, 54), (50, 60)), fill='#FF9500')


def bird_cheeks(d):
    circle(d, 36, 56, 3.5, (255, 150, 170, 115))
    circle(d, 64, 56, 3.5, (255, 150, 170, 115))


def bird_full(d):
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    bird_wing(d)
    bird_face(d)
    bird_cheeks(d)


# ── 配色パレット(ピンク・ミントの2軸) ──────────────────────────────

PALETTES = {
    'soft_pink': {
        'label': '淡いピンク',
        'bg': ('#FCE7EC', '#F6C9D3'),
        'accent': ('#F2AEBB', '#E39CAA', '#B06478'),
    },
    'mint': {
        'label': 'ミントグリーン',
        'bg': ('#E3F6E6', '#C7ECC9'),
        'accent': ('#AEE0B4', '#8FC79A', '#4F8C5B'),
    },
}

GOLD = ('#F7DE8A', '#E8BE4D', '#B8860B')          # light, base, dark rim
LEAF = ('#BFE6C4', '#7FB88A', '#4F8C5B')
TAG_SCATTER = ('#FFFFFF', '#F4EDE3', '#B0876A')
SPARK_SILVER = '#FFFFFF'
SPARK_GOLD = '#F3CB55'

# 散らす位置(鳥のシルエットと足元の積み上げを避けた4点)
SCATTER_POS = [(14, 16), (86, 15), (10, 53), (90, 55)]


# ── 背景に散らす要素 ──────────────────────────────

def scatter_leaves(d):
    light, base, dark = LEAF
    for i, (cx, cy) in enumerate(SCATTER_POS):
        s = 1.0 if i % 2 == 0 else 0.8
        r = 5 * s
        d.polygon([(cx * S, (cy - r) * S), ((cx - r * 0.7) * S, cy * S),
                   (cx * S, (cy + r) * S), ((cx + r * 0.7) * S, cy * S)], fill=base)
        d.line([(cx * S, (cy - r) * S), (cx * S, (cy + r) * S)], fill=dark, width=max(1, int(0.6 * S)))


def scatter_tags(d):
    white, cream, dark = TAG_SCATTER
    w, h = 9, 6.5
    for i, (cx, cy) in enumerate(SCATTER_POS):
        ang = 10 if i % 2 == 0 else -10
        rad = math.radians(ang)
        corners = []
        for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
            rx = dx * math.cos(rad) - dy * math.sin(rad)
            ry = dx * math.sin(rad) + dy * math.cos(rad)
            corners.append(((cx + rx) * S, (cy + ry) * S))
        d.polygon(corners, fill=cream, outline=dark)
        d.ellipse([((cx - w / 2 + 2) * S, (cy - 1) * S), ((cx - w / 2 + 4) * S, (cy + 1) * S)], fill=white)


def _star(d, cx, cy, r, color, waist=0.28):
    w = r * waist
    d.polygon([(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
               (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)],
              fill=color)


def scatter_sparkle(d, color):
    sizes = [3.2, 2.4, 2.8, 2.2]
    for (cx, cy), r in zip(SCATTER_POS, sizes):
        _star(d, cx * S, cy * S, r * S, color)
    extra = [(30, 10, 1.0), (70, 12, 1.1), (18, 70, 1.0), (82, 30, 1.0)]
    for cx, cy, r in extra:
        d.ellipse([((cx - r) * S, (cy - r) * S), ((cx + r) * S, (cy + r) * S)], fill=color)


# ── 構図1: 足元に積み上げ(タグ/ブロック版・一回り拡大) ──────────────────────────────

def draw_stack(d, accent):
    light, mid, dark = accent
    tiers = [
        (50, 94, 34, 9, light),
        (50, 85.5, 28, 8, mid),
        (50, 77.5, 22, 7, dark),
    ]
    for cx, cy, w, h, c in tiers:
        d.rounded_rectangle(box(cx - w / 2, cy - h / 2, w, h), radius=1.6 * S,
                             fill=c, outline='#FFFFFF', width=2)
    set_transform(0.78, (50.0, 54.0))
    bird_full(d)


# ── 構図1の派生: 足元をコインの山にする ──────────────────────────────

def draw_coin_stack(d, _accent=None):
    light, base, dark = GOLD
    w, h = 32, 8
    n = 5
    base_cy = 97
    for i in range(n):
        cy = base_cy - i * 4.6
        d.ellipse(box(50 - w / 2, cy - h / 2, w, h), fill=base, outline=dark, width=2)
    top_cy = base_cy - (n - 1) * 4.6
    d.ellipse(box(50 - w / 2 + 4, top_cy - h / 2 + 1.4, w - 8, h - 2.8), fill=light)
    set_transform(0.78, (50.0, 54.0))
    bird_full(d)


# ── 構図2: 値札を1枚持つ(一回り拡大) ──────────────────────────────

def draw_holding_tag(d, accent):
    light, mid, dark = accent
    set_transform(0.8, (50.0, 55.0))
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    cx, cy, w, h, ang = 59, 63, 30, 20, -12
    rad = math.radians(ang)
    corners = []
    for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        rx = dx * math.cos(rad) - dy * math.sin(rad)
        ry = dx * math.sin(rad) + dy * math.cos(rad)
        corners.append((cx + rx, cy + ry))
    d.polygon(P(*corners), fill=mid, outline=dark, width=2)
    hole_dx, hole_dy = -w / 2 + 4.5, -h / 2 + 4.5
    hrx = hole_dx * math.cos(rad) - hole_dy * math.sin(rad)
    hry = hole_dx * math.sin(rad) + hole_dy * math.cos(rad)
    circle(d, cx + hrx, cy + hry, 2.0, '#FFFFFF')
    line(d, [(cx + hrx, cy + hry), (52, 58)], dark, 1.3)
    bird_wing(d)
    bird_face(d)
    bird_cheeks(d)


# ── 構図2の派生: 鳥が金貨を1枚抱える ──────────────────────────────

def draw_holding_coin(d, _accent=None):
    light, base, dark = GOLD
    set_transform(0.8, (50.0, 55.0))
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    cx, cy, r = 60, 64, 13
    circle(d, cx, cy, r, base)
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), outline=dark, width=2)
    circle(d, cx - r * 0.3, cy - r * 0.3, r * 0.45, light)
    bird_wing(d)
    bird_face(d)
    bird_cheeks(d)


COMPOSITIONS = {
    'stack': draw_stack,
    'coin_stack': draw_coin_stack,
    'holding': draw_holding_tag,
    'holding_coin': draw_holding_coin,
}

SCATTERS = {
    'leaves': lambda d, pal: scatter_leaves(d),
    'tags': lambda d, pal: scatter_tags(d),
    'sparkle': lambda d, pal: scatter_sparkle(d, SPARK_SILVER),
    'gold_sparkle': lambda d, pal: scatter_sparkle(d, SPARK_GOLD),
}

# (構図, 散らしパターン, 配色キー) の組み合わせ一覧
JOBS = []
for comp in ('stack', 'holding'):
    for scat in ('leaves', 'tags', 'sparkle'):
        for pal in ('soft_pink', 'mint'):
            JOBS.append((comp, scat, pal))
for comp in ('coin_stack', 'holding_coin'):
    for pal in ('soft_pink', 'mint'):
        JOBS.append((comp, 'gold_sparkle', pal))


def draw(comp_key, scat_key, pal_key, size=OUT):
    pal = PALETTES[pal_key]
    tl, br = pal['bg']
    img = diag_gradient(hexrgb(tl)[:3], hexrgb(br)[:3])
    d = ImageDraw.Draw(img, 'RGBA')
    SCATTERS[scat_key](d, pal)
    COMPOSITIONS[comp_key](d, pal['accent'])
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v2')
    os.makedirs(outdir, exist_ok=True)
    for comp_key, scat_key, pal_key in JOBS:
        name = f'{comp_key}_{scat_key}_{pal_key}'
        big = draw(comp_key, scat_key, pal_key, OUT)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = draw(comp_key, scat_key, pal_key, 60)
        small.save(os.path.join(outdir, f'{name}_60.png'))
        print(name)
