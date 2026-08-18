"""うりつみ アプリアイコン: 柔らかい配色 × 2構図(足元に積み上げ / 値札を持つ)。

これまでの案は背景が濃色中心だったため、今回は明るく柔らかい配色に絞って
検証する。構図は「足元に積み上げ(主役は鳥のまま)」「値札を1枚持つ(文字なし・
形だけ)」の2つのみに固定し、配色を4パターンずつ(計8案)試す。

鳥の形・色・パーツ構成(体・翼・尾・足・くちばし・目・ほっぺ)は元スクリプトのまま。
淡い背景で白い体の輪郭が溶けていないかは、60px版を目視で確認して報告する
(このスクリプト自体は判定しない。判定はレンダリング後に別途行う)。
"""
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
    """左上→右下のごく穏やかな対角グラデーション(極端にしない)。"""
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


# ── 配色パレット(4種。すべて明るく柔らかい方向) ──────────────────────────────

PALETTES = {
    'ivory_terracotta': {
        'label': 'アイボリー地 + くすんだテラコッタ差し色',
        'bg': ('#F7F0E3', '#ECD9C3'),
        'accent': ('#E3B39A', '#C98A6B', '#8C5A42'),
    },
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
    'pale_blue': {
        'label': '淡い水色(前作dayに近い系統)',
        'bg': ('#EAF6FF', '#BFE6FF'),
        'accent': ('#B6DCF2', '#8FC0E0', '#4C7FA0'),
    },
}


# ── 構図1: 足元に積み上げ(主役は鳥。積み上げは鳥より小さい) ──────────────────────────────

def draw_stack(d, accent):
    light, mid, dark = accent
    tiers = [
        (50, 96, 26, 7, light),
        (50, 90, 22, 6.5, mid),
        (50, 84.5, 17, 6, dark),
    ]
    for cx, cy, w, h, c in tiers:
        d.rounded_rectangle(box(cx - w / 2, cy - h / 2, w, h), radius=1.4 * S,
                             fill=c, outline='#FFFFFF', width=1)
    set_transform(0.78, (50.0, 54.0))
    bird_full(d)


# ── 構図2: 値札を1枚持つ(文字・記号なし。形だけで示す) ──────────────────────────────

def draw_holding_tag(d, accent):
    light, mid, dark = accent
    set_transform(0.8, (50.0, 55.0))
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    # 値札(輪郭のみで示す。文字は入れない)。胸の前で少し傾けて「持っている」感を出す。
    cx, cy, w, h, ang = 58, 63, 22, 14, -12
    import math
    rad = math.radians(ang)
    corners = []
    for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        rx = dx * math.cos(rad) - dy * math.sin(rad)
        ry = dx * math.sin(rad) + dy * math.cos(rad)
        corners.append((cx + rx, cy + ry))
    d.polygon(P(*corners), fill=mid, outline=dark, width=2)
    hole_dx, hole_dy = -w / 2 + 3.5, -h / 2 + 3.5
    hrx = hole_dx * math.cos(rad) - hole_dy * math.sin(rad)
    hry = hole_dx * math.sin(rad) + hole_dy * math.cos(rad)
    circle(d, cx + hrx, cy + hry, 1.6, '#FFFFFF')
    # 紐(穴からくちばし側へ)
    line(d, [(cx + hrx, cy + hry), (52, 58)], dark, 1.2)
    bird_wing(d)
    bird_face(d)
    bird_cheeks(d)


COMPOSITIONS = {
    'stack': ('足元に積み上げ', draw_stack),
    'holding': ('値札を持つ', draw_holding_tag),
}


def draw(comp_key, palette_key, size=OUT):
    pal = PALETTES[palette_key]
    tl, br = pal['bg']
    img = diag_gradient(hexrgb(tl)[:3], hexrgb(br)[:3])
    d = ImageDraw.Draw(img, 'RGBA')
    _, fn = COMPOSITIONS[comp_key]
    fn(d, pal['accent'])
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output')
    os.makedirs(outdir, exist_ok=True)
    for comp_key, (comp_label, _) in COMPOSITIONS.items():
        for pal_key, pal in PALETTES.items():
            name = f'{comp_key}_{pal_key}'
            big = draw(comp_key, pal_key, OUT)
            big.save(os.path.join(outdir, f'{name}_1024.png'))
            small = draw(comp_key, pal_key, 60)
            small.save(os.path.join(outdir, f'{name}_60.png'))
            print(name, '-', comp_label, '/', pal['label'])
