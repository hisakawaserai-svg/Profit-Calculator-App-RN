"""うりつみ アプリアイコン案を 1024px PNG (+60px 確認用) で書き出す。

gen_app_icons.py の鳥キャラクター(100x100 座標系: 体・翼・尾・足・くちばし・目・
ほっぺ)をそのまま流用し、形と色は変更しない。変更するのは背景(チェッカー廃止・
単色/グラデーションに置き換え)と、鳥に持たせる要素(案ごとに1つだけ)のみ。

3案:
  A: ボルドー(実績レジェンド色) グラデーション + 積み重なったタグ
  B: 緑系グラデーション(植物モチーフ) + 芽
  C: ゴールド(実績ゴールド色) グラデーション + 積み上がったブロック

まだ ios/ android/ には配置しない(案を選んでから install する)。
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4                      # supersampling
S = OUT * SS / 100.0        # 100基準 → ピクセル

CHAR_SCALE = 0.78
PIVOT = (50.0, 54.0)
_char = False

_scene = 1.0


def T(x, y):
    if _char:
        x = PIVOT[0] + (x - PIVOT[0]) * CHAR_SCALE
        y = PIVOT[1] + (y - PIVOT[1]) * CHAR_SCALE
    if _scene != 1.0:
        x = 50 + (x - 50) * _scene
        y = 50 + (y - 50) * _scene
    return x, y


def P(*xy):
    return [tuple(v * S for v in T(x, y)) for x, y in xy]


def box(x, y, w, h):
    x0, y0 = T(x, y)
    x1, y1 = T(x + w, y + h)
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def circle(d, cx, cy, r, color):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), fill=color)


def line(d, pts, color, w, joint='curve'):
    lw = w * _scene * (CHAR_SCALE if _char else 1.0)
    d.line(P(*pts), fill=color, width=int(round(lw * S)), joint=joint)
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


def diag_gradient(c_top_left, c_bottom_right):
    """左上→右下の対角グラデーション背景(チェッカーの代わり)。"""
    m = 256
    grad = Image.new('RGB', (m, m))
    px = grad.load()
    for y in range(m):
        for x in range(m):
            t = (x + y) / (2 * (m - 1))
            px[x, y] = tuple(
                int(round(c_top_left[i] + (c_bottom_right[i] - c_top_left[i]) * t))
                for i in range(3)
            )
    return grad.resize((OUT * SS, OUT * SS), Image.BICUBIC)


def draw_bird(d):
    """共通の鳥キャラクター本体(色・形は変更しない)。"""
    d.polygon(P((55, 72), (84, 86), (82, 93), (52, 81)), fill='#3A3A3C')   # 尾
    for fx in (45, 55):
        line(d, [(fx, 82), (fx, 90)], '#FF9500', 2)
        line(d, [(fx - 3, 91), (fx, 90), (fx + 3, 91)], '#FF9500', 2)
    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')                          # 体
    d.ellipse(box(61, 44, 18, 32), fill='#D8D8DC')                          # 翼

    circle(d, 42, 48, 3, '#1C1C1E')                                          # 目
    circle(d, 58, 48, 3, '#1C1C1E')
    d.polygon(P((47, 54), (53, 54), (50, 60)), fill='#FF9500')               # くちばし

    circle(d, 36, 56, 3.5, (255, 150, 170, 115))                            # ほっぺ
    circle(d, 64, 56, 3.5, (255, 150, 170, 115))


# 鳥の右側(体・翼・尾のシルエット外)にある空き空間。ここに要素を1つだけ置く。
ACC_X = 90


def tag(d, cx, cy, w, h, color, outline):
    """小さなタグ(荷札)を1枚。矩形+左側に穴。"""
    x0, y0 = cx - w / 2, cy - h / 2
    d.rectangle(box(x0, y0, w, h), fill=color, outline=outline, width=1)
    circle(d, x0 + h * 0.35, cy, h * 0.14, '#FFFFFF')


def accessory_tags(d):
    """積み重なったタグ(3枚)。鳥の右どなりに縦積みする。"""
    colors = [('#F4CB9B', '#8A5A22'), ('#FFF6D2', '#8A6A10'), ('#D8F0DA', '#3A6B44')]
    base_cy = 72
    for i, (fill, outline) in enumerate(colors):
        tag(d, ACC_X, base_cy - i * 11, 20, 12, fill, outline)


def accessory_sprout(d):
    """芽(実績システムの植物モチーフ)。鳥の右どなりから伸びる小さな双葉。"""
    stem_color = '#3F7D4A'
    leaf_color = '#6FBF73'
    leaf_light = '#B7E6B8'
    quad(d, (ACC_X, 88), (ACC_X, 74), (ACC_X, 58), stem_color, 3)
    d.polygon(P((ACC_X, 68), (ACC_X - 10, 63), (ACC_X - 14, 53),
                (ACC_X - 5, 58), (ACC_X, 68)), fill=leaf_color)
    d.polygon(P((ACC_X, 68), (ACC_X + 10, 63), (ACC_X + 14, 53),
                (ACC_X + 5, 58), (ACC_X, 68)), fill=leaf_light)


def accessory_blocks(d):
    """積み上がったブロック(3段)。鳥の右どなりに積む。"""
    colors = ['#E8B04A', '#D4AF37', '#B8752E']
    w, h = 18, 14
    base_cy = 82
    for i, c in enumerate(colors):
        cy = base_cy - i * (h - 1)
        x0 = ACC_X - w / 2
        d.rectangle(box(x0, cy - h / 2, w, h), fill=c, outline='#5C3210', width=2)


VARIANTS = {
    'a_bordeaux_tags': {
        'bg': (('#7A2A46', '#3A1020')),
        'accessory': accessory_tags,
    },
    'b_green_sprout': {
        'bg': (('#BFE8C4', '#4E9A5A')),
        'accessory': accessory_sprout,
    },
    'c_gold_blocks': {
        'bg': (('#FCE8A8', '#B8752E')),
        'accessory': accessory_blocks,
    },
}


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def draw(name, size=OUT):
    global _char
    cfg = VARIANTS[name]
    tl, br = cfg['bg']
    img = diag_gradient(hex_to_rgb(tl), hex_to_rgb(br)).convert('RGBA')
    d = ImageDraw.Draw(img, 'RGBA')
    _char = True
    draw_bird(d)
    cfg['accessory'](d)
    _char = False
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = 'app_icons_uritsumi'
    os.makedirs(outdir, exist_ok=True)
    for name in VARIANTS:
        big = draw(name, OUT)
        p_big = os.path.join(outdir, f'{name}_1024.png')
        big.save(p_big)
        print(p_big)

        small = draw(name, 60)
        p_small = os.path.join(outdir, f'{name}_60.png')
        small.save(p_small)
        print(p_small)
