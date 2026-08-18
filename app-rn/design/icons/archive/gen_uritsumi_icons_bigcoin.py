"""うりつみ アプリアイコン: 鳥が自分より大きい金貨を抱える(振り切り3段階)。

60pxに縮小したとき「白い鳥」「金色の大きな円」「淡い背景」の3層の色面だけで
成立するかを検証する。金貨は鳥の1.2倍/1.0倍(同等)/1.5倍以上の3パターン。
翼は「抱えている」形に見えるよう、腕のように弧を描いて金貨の手前に重ねる
(角度・位置の調整可、色・パーツ構成自体は変えない)。顔は常に金貨の上に
見える位置を維持する。

金貨は円記号・数字・文字なし。丸い金色の面+リム+ハイライトのみ。
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0

_offset = (0.0, -8.0)   # 鳥全体を上にずらし、下に金貨のスペースを作る


def T(x, y):
    return x + _offset[0], y + _offset[1]


def P(*xy):
    return [tuple(v * S for v in T(x, y)) for x, y in xy]


def box(x, y, w, h):
    x0, y0 = T(x, y)
    x1, y1 = T(x + w, y + h)
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def circle(d, cx, cy, r, color, outline=None, width=0):
    b = box(cx - r, cy - r, r * 2, r * 2)
    d.ellipse(b, fill=color, outline=outline, width=width)


def line(d, pts, color, w, joint='curve'):
    d.line(P(*pts), fill=color, width=max(1, int(round(w * S))), joint=joint)
    for x, y in pts:
        circle(d, x, y, w / 2, color)


def quad(d, p0, p1, p2, color, w, n=28):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    line(d, pts, color, w)


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


GOLD_LIGHT, GOLD_BASE, GOLD_DARK = '#F7DE8A', '#E8BE4D', '#B8860B'
WING_GRAY = '#D8D8DC'

PALETTES = {'soft_pink': '#FCE7EC', 'mint': '#E3F6E6'}

BIRD_DIAMETER_REF = 60.0   # 体(58x62)のおおよその直径を基準にする
RATIOS = {
    'r1_1.2x': 1.2,
    'r2_1.0x': 1.0,
    'r3_1.5x': 1.5,
}


def draw_coin(d, cx, cy, r):
    circle(d, cx, cy, r, GOLD_BASE, outline=GOLD_DARK, width=int(3 * S / S) or 3)
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), outline=GOLD_DARK, width=max(2, int(0.03 * r * S)))
    # 内側の縁取りリング
    inner = r * 0.86
    d.ellipse(box(cx - inner, cy - inner, inner * 2, inner * 2), outline=hexrgb(GOLD_DARK, 140),
               width=max(1, int(0.015 * r * S)))
    # ハイライト(左上に一つ)
    hl_r = r * 0.28
    hl_cx, hl_cy = cx - r * 0.32, cy - r * 0.32
    circle(d, hl_cx, hl_cy, hl_r, hexrgb(GOLD_LIGHT, 230))


def draw_bird_base(d):
    """尾・足・体(翼と顔は別関数。金貨を体の手前に描くため描画順を分ける)。"""
    d.polygon(P((55, 72), (84, 86), (82, 93), (52, 81)), fill='#3A3A3C')   # 尾
    for fx in (45, 55):
        line(d, [(fx, 82), (fx, 90)], '#FF9500', 2)
        line(d, [(fx - 3, 91), (fx, 90), (fx + 3, 91)], '#FF9500', 2)
    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')                          # 体


def draw_hugging_wings(d):
    """元の翼(右側)をそのまま左右にミラーし、金貨の上に乗せる。
    形・色は元スクリプトの翼と同一(角度は付けず、位置を左右対称にするだけ)。"""
    d.ellipse(box(61, 44, 18, 32), fill=WING_GRAY)   # 右翼(元のまま)
    d.ellipse(box(21, 44, 18, 32), fill=WING_GRAY)   # 左翼(ミラー)


def draw_face(d):
    circle(d, 42, 48, 3, '#1C1C1E')
    circle(d, 58, 48, 3, '#1C1C1E')
    d.polygon(P((47, 54), (53, 54), (50, 60)), fill='#FF9500')
    circle(d, 36, 56, 3.5, (255, 150, 170, 115))
    circle(d, 64, 56, 3.5, (255, 150, 170, 115))


def draw(ratio_key, pal_key, size=OUT):
    ratio = RATIOS[ratio_key]
    coin_d = BIRD_DIAMETER_REF * ratio
    coin_r = coin_d / 2
    coin_top = 55.0
    coin_cy = coin_top + coin_r

    img = Image.new('RGBA', (OUT * SS, OUT * SS), hexrgb(PALETTES[pal_key]))
    d = ImageDraw.Draw(img, 'RGBA')

    draw_bird_base(d)
    draw_coin(d, 50, coin_cy, coin_r)
    draw_hugging_wings(d)
    draw_face(d)

    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v4')
    os.makedirs(outdir, exist_ok=True)
    for ratio_key in RATIOS:
        for pal_key in PALETTES:
            name = f'{ratio_key}_{pal_key}'
            draw(ratio_key, pal_key, OUT).save(os.path.join(outdir, f'{name}_1024.png'))
            draw(ratio_key, pal_key, 60).save(os.path.join(outdir, f'{name}_60.png'))
            print(name)
