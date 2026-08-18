"""うりつみ アプリアイコン: 参考イラスト(コインを持って心配顔の鳥)を
既存の鳥パーツ(体・翼・尾・足・くちばし・目・ほっぺ)のフラット様式で
アイコン化した版。

鳥の形・色は元スクリプトのまま。表情のみ「心配顔」(ハの字眉+汗)に差し替え、
翼を持ち上げてコインを支えるポーズにする。
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


def bird_cheeks(d):
    circle(d, 36, 56, 3.5, (255, 150, 170, 115))
    circle(d, 64, 56, 3.5, (255, 150, 170, 115))


def bird_wing_raised(d):
    """翼を左上へ長く伸ばし、コインの底を下から支える形。"""
    d.polygon(
        P((32, 70), (22, 56), (14, 36), (8, 18), (18, 16), (24, 32), (30, 50), (34, 66)),
        fill='#D8D8DC',
    )


def bird_face_worried(d):
    # 困り眉(眉間側が上がり、外側が下がる)
    line(d, [(38, 46), (44, 42.5)], '#1C1C1E', 1.8)
    line(d, [(62, 46), (56, 42.5)], '#1C1C1E', 1.8)
    circle(d, 42, 49, 3, '#1C1C1E')
    circle(d, 58, 49, 3, '#1C1C1E')
    # 小さく開いた「わっ」口
    circle(d, 50, 58.5, 2.2, '#FF9500')


def sweat_drop(d, cx, cy, s, color='#8FCBEA'):
    r = s * 0.55
    d.polygon(P((cx, cy - s), (cx - r, cy + r * 0.3), (cx + r, cy + r * 0.3)), fill=color)
    circle(d, cx, cy + r * 0.5, r, color)


def yen_mark(d, cx, cy, r, color):
    lw = r * 0.22
    line(d, [(cx - r * 0.5, cy - r * 0.55), (cx, cy - r * 0.05)], color, lw)
    line(d, [(cx + r * 0.5, cy - r * 0.55), (cx, cy - r * 0.05)], color, lw)
    line(d, [(cx, cy - r * 0.1), (cx, cy + r * 0.65)], color, lw)
    line(d, [(cx - r * 0.5, cy + r * 0.12), (cx + r * 0.5, cy + r * 0.12)], color, lw * 0.85)
    line(d, [(cx - r * 0.5, cy + r * 0.36), (cx + r * 0.5, cy + r * 0.36)], color, lw * 0.85)


def coin(d, cx, cy, r):
    circle(d, cx, cy, r, '#E8AE18')
    circle(d, cx, cy, r * 0.88, '#FFD24C')
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), outline='#B9800B',
              width=max(2, int(round(r * 0.05 * S))))
    d.ellipse(box(cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56),
              outline='#F6E08A', width=max(1, int(round(r * 0.025 * S))))
    yen_mark(d, cx, cy, r * 0.42, '#B9800B')


def sparkle(d, cx, cy, r, color='#F2C230'):
    w = r * 0.28
    d.polygon(P((cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
                (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)), fill=color)


def draw_coin_worry(d):
    # 背景(参考イラストのピンク)
    d.rectangle([(0, 0), (OUT * SS, OUT * SS)], fill='#FBD3D9')

    # コイン(左上・大きく)ときらきら
    coin(d, 36, 26, 27)
    sparkle(d, 78, 16, 5.5)
    sparkle(d, 86, 34, 3.4)
    sparkle(d, 72, 52, 3.0)

    # 鳥(右下寄り・小さめ)。翼だけ先に描き、体で根元を隠す。
    set_transform(0.62, (62.0, 66.0))
    bird_wing_raised(d)
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    bird_face_worried(d)
    bird_cheeks(d)
    sweat_drop(d, 74, 46, 4.2)
    sweat_drop(d, 78, 55, 3.0)


VARIANTS = {
    'coin_worry': {
        'draw': draw_coin_worry,
        'intent': '参考イラスト(コインを持って冷や汗の鳥)を既存フラット様式でアイコン化。',
    },
}


def draw(name, size=OUT):
    img = Image.new('RGBA', (OUT * SS, OUT * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    VARIANTS[name]['draw'](d)
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = 'app_icons_uritsumi_v4'
    os.makedirs(outdir, exist_ok=True)
    for name, cfg in VARIANTS.items():
        big = draw(name, OUT)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = draw(name, 60)
        small.save(os.path.join(outdir, f'{name}_60.png'))
        print(name, '-', cfg['intent'])
