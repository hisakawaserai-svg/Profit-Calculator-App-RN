"""うりつみ アプリアイコン 構図バリエーション6案。

前回(gen_uritsumi_icons.py)は3案とも「鳥中央・右に小物・背景グラデーション」で
構図が同じだった反省を受け、構図の軸そのものを変えた6案を作る。
鳥の形・色(体・翼・尾・足・くちばし・目・ほっぺ)は元スクリプトのまま。
軸ごとに鳥のスケール・位置・パーツの出し方を変える。
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0

_scale = 1.0
_pivot = (50.0, 54.0)


def T(x, y):
    px, py = _pivot
    return px + (x - px) * _scale, py + (y - py) * _scale


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


def quad(d, p0, p1, p2, color, w, n=24):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    line(d, pts, color, w)


def solid_bg(color):
    return Image.new('RGBA', (OUT * SS, OUT * SS), color)


def set_transform(scale, pivot):
    global _scale, _pivot
    _scale, _pivot = scale, pivot


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
    """通常の全身(尾→足→体→翼→顔→ほっぺの順)。"""
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    bird_wing(d)
    bird_face(d)
    bird_cheeks(d)


# ── 案1: 顔だけ大きく寄る ──────────────────────────────
def draw_v1(d):
    set_transform(1.55, (50.0, 42.0))
    bird_full(d)


# ── 案2: 鳥を小さく、積み上げ(ブロック)を主役に ──────────────────────────────
def draw_v2(d):
    # ブロックの山(絶対座標。中央揃え、下から3段、上ほど小さい)
    tiers = [
        (50, 84, 74, 22, '#D9AA55'),
        (50, 63, 58, 22, '#D4AF37'),
        (50, 44, 40, 20, '#B8752E'),
    ]
    for cx, cy, w, h, c in tiers:
        d.rectangle([( (cx - w / 2) * S, (cy - h / 2) * S),
                     ((cx + w / 2) * S, (cy + h / 2) * S)], fill=c, outline='#5C3210', width=3)
    set_transform(0.35, (50.0, 21.0))
    bird_full(d)


# ── 案3: 鳥が下、上に余白。芽が上に伸びる ──────────────────────────────
def draw_v3(d):
    stem_color = '#BFE6C4'
    leaf_color = '#9FDCA8'
    # 茎(下から上まで長く伸ばす。絶対座標)
    d.line([(50 * S, 92 * S), (50 * S, 26 * S)], fill=stem_color, width=int(2.2 * S), joint='curve')
    for cx, cy, r in ((50, 92, 1.1), (50, 26, 1.1)):
        d.ellipse([((cx - r) * S, (cy - r) * S), ((cx + r) * S, (cy + r) * S)], fill=stem_color)
    leaf_pairs = [58, 46, 34]
    for ly in leaf_pairs:
        d.polygon([(50 * S, ly * S), ((50 - 11) * S, (ly - 6) * S), ((50 - 15) * S, (ly - 16) * S),
                   ((50 - 6) * S, (ly - 9) * S)], fill=leaf_color)
        d.polygon([(50 * S, ly * S), ((50 + 11) * S, (ly - 6) * S), ((50 + 15) * S, (ly - 16) * S),
                   ((50 + 6) * S, (ly - 9) * S)], fill=leaf_color)
    set_transform(0.62, (50.0, 79.0))
    bird_full(d)


# ── 案4: 背景に図形(円+帯)を入れ、その上に鳥を重ねる ──────────────────────────────
def draw_v4(d):
    circle(d, 50, 40, 34, (237, 228, 211, 255))   # 大きな円(生成り)
    d.polygon([(-10 * S, 78 * S), (110 * S, 60 * S), (110 * S, 74 * S), (-10 * S, 92 * S)],
               fill=(122, 42, 70, 255))            # 斜めの帯(ボルドー)
    set_transform(0.78, (50.0, 54.0))
    bird_full(d)


# ── 案5: 鳥が何かを抱えている(タグを胸に抱く) ──────────────────────────────
def draw_v5(d):
    set_transform(0.82, (50.0, 55.0))
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    # 抱えるタグ(体の手前・胸のあたりに重ねる。翼より前面)
    tag_w, tag_h = 22, 16
    tx0, ty0 = 50 - tag_w / 2, 66 - tag_h / 2
    d.rectangle(box(tx0, ty0, tag_w, tag_h), fill='#FFF6D2', outline='#8A6A10', width=2)
    circle(d, tx0 + tag_h * 0.3, 66, tag_h * 0.12, '#8A6A10')
    bird_wing(d)
    bird_face(d)
    bird_cheeks(d)


# ── 案6: 鳥のシルエットのみ(白い体+目・くちばしだけ) ──────────────────────────────
def draw_v6(d):
    set_transform(0.9, (50.0, 54.0))
    bird_body(d)
    bird_face(d)


VARIANTS = {
    '1_face_zoom': {'bg': '#1B2A4A', 'draw': draw_v1,
                     'note': '濃紺・顔だけ大きく寄せる。小物なし。'},
    '2_stack_hero': {'bg': '#EDE4D3', 'draw': draw_v2,
                      'note': '生成り・ブロック3段の山に小さな鳥が乗る。'},
    '3_sprout_above': {'bg': '#1B3A2E', 'draw': draw_v3,
                        'note': '深緑・鳥は下、芽が上に長く伸びる。'},
    '4_bg_shapes': {'bg': '#33343A', 'draw': draw_v4,
                     'note': '墨色・背景に円+斜め帯、鳥は通常サイズで重なる。'},
    '5_holding': {'bg': '#B5602F', 'draw': draw_v5,
                   'note': '赤茶・鳥がタグを胸に抱える。'},
    '6_silhouette': {'bg': '#17151C', 'draw': draw_v6,
                      'note': 'ほぼ黒・白い体のシルエットのみ、目とくちばしは残す。'},
}


def hex_to_rgba(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def draw(name, size=OUT):
    cfg = VARIANTS[name]
    img = solid_bg(hex_to_rgba(cfg['bg']))
    d = ImageDraw.Draw(img, 'RGBA')
    cfg['draw'](d)
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = 'app_icons_uritsumi_v2'
    os.makedirs(outdir, exist_ok=True)
    for name, cfg in VARIANTS.items():
        big = draw(name, OUT)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = draw(name, 60)
        small.save(os.path.join(outdir, f'{name}_60.png'))
        print(name, '-', cfg['note'])
