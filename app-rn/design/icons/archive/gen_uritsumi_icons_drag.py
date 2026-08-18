"""うりつみ アプリアイコン: 手描きラフの再現。

鳥は右を向いて進み、左後方の巨大な金貨(鳥の2〜3倍)を
翼を後ろへ伸ばして引きずっている。これまでの案(金貨を横に並べる)
とは構図が根本的に違う:
  - 金貨は鳥の「後ろ」に置き、体と重なる(体が金貨の手前)
  - 翼は体の横ではなく、斜め後ろ下へ伸ばして金貨に届かせる
  - 金貨のサイズは鳥の2〜3倍。画面左側の大半を占め、キャンバス外に
    はみ出してよい

描画順: 背景 → 金貨(奥) → 尾(金貨側=左へ、動きの反対方向) →
        脚(前へ踏み出す) → 体・顔(金貨の手前に重なる) →
        翼(後ろへ伸ばして金貨に触れさせる) → 汗マーク → きらきら
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0
CANVAS = OUT * SS

GOLD_LIGHT, GOLD_BASE, GOLD_DARK = '#F7DE8A', '#E8BE4D', '#B8860B'
WING_GRAY = '#D8D8DC'
SWEAT = '#CFE9F7'
SPARK = '#FFFFFF'
PALETTES = {'soft_pink': '#FCE7EC', 'mint': '#E3F6E6'}

BODY_CX, BODY_CY = 63.0, 56.0   # 元は (50,54)。右へ寄せる
COIN_RIGHT_EDGE = 42.0          # 金貨の右端をここに固定し、大きさが変わっても鳥を埋めない


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def pt(x, y):
    return x * S, y * S


def box(x, y, w, h):
    return [pt(x, y), pt(x + w, y + h)]


def cbox(cx, cy, r):
    return [pt(cx - r, cy - r), pt(cx + r, cy + r)]


def draw_coin(d, cx, cy, r):
    d.ellipse(cbox(cx, cy, r), fill=hexrgb(GOLD_BASE), outline=hexrgb(GOLD_DARK),
               width=max(2, int(0.03 * r * S)))
    inner = r * 0.88
    d.ellipse(cbox(cx, cy, inner), outline=hexrgb(GOLD_DARK, 140), width=max(1, int(0.015 * r * S)))
    hl_r = r * 0.24
    d.ellipse(cbox(cx - r * 0.34, cy - r * 0.34, hl_r), fill=hexrgb(GOLD_LIGHT, 230))


def star(d, cx, cy, r, color, waist=0.3):
    w = r * waist
    pts = [(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
           (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)]
    d.polygon([pt(x, y) for x, y in pts], fill=color)


def sweat_drop(d, cx, cy, s):
    d.polygon([pt(cx, cy - s), pt(cx - s * 0.6, cy + s * 0.3), pt(cx, cy + s * 0.9), pt(cx + s * 0.6, cy + s * 0.3)],
               fill=hexrgb(SWEAT))


def draw_tail(d):
    ox, oy = BODY_CX - 50, BODY_CY - 54
    p = [(55, 72), (84, 86), (82, 93), (52, 81)]
    mirrored = [(50 - (x - 50) + ox, y + oy) for x, y in p]
    d.polygon([pt(x, y) for x, y in mirrored], fill='#3A3A3C')


def draw_legs(d):
    ox, oy = BODY_CX - 50, BODY_CY - 54
    # 軸足(体の真下)
    fx, fy0, fy1 = 45 + ox, 82 + oy, 90 + oy
    d.line([pt(fx, fy0), pt(fx, fy1)], fill='#FF9500', width=max(1, int(2 * S)))
    d.line([pt(fx - 3, fy1 + 1), pt(fx, fy1), pt(fx + 3, fy1 + 1)], fill='#FF9500',
           width=max(1, int(2 * S)), joint='curve')
    # 前へ踏み出す足
    fx2, fy2_0 = 55 + ox, 82 + oy
    end = (66 + ox, 90 + oy)
    d.line([pt(fx2, fy2_0), pt(*end)], fill='#FF9500', width=max(1, int(2 * S)), joint='curve')
    ex, ey = end
    d.line([pt(ex - 3, ey + 1), pt(ex, ey), pt(ex + 3, ey + 1)], fill='#FF9500',
           width=max(1, int(2 * S)), joint='curve')


FACE_SHIFT_X = -7   # 顔パーツ全体を左(金貨側)へ寄せ、振り返っているように見せる


def draw_body_face(d):
    ox, oy = BODY_CX - 50, BODY_CY - 54
    fx = ox + FACE_SHIFT_X
    d.ellipse(box(21 + ox, 23 + oy, 58, 62), fill='#FFFFFF')                  # 体
    # 目(しんどそうに中央へ眇めた「>」「<」。左右の点が中心を向く)
    lex, ley = 42 + fx, 48 + oy
    d.line([pt(lex - 2.6, ley - 2.6), pt(lex + 1.6, ley), pt(lex - 2.6, ley + 2.6)],
           fill='#1C1C1E', width=max(1, int(2.2 * S)), joint='curve')
    rex, rey = 58 + fx, 48 + oy
    d.line([pt(rex + 2.6, rey - 2.6), pt(rex - 1.6, rey), pt(rex + 2.6, rey + 2.6)],
           fill='#1C1C1E', width=max(1, int(2.2 * S)), joint='curve')
    d.polygon([pt(47 + fx, 54 + oy), pt(53 + fx, 54 + oy), pt(50 + fx, 60 + oy)], fill='#FF9500')
    d.ellipse(cbox(36 + fx, 56 + oy, 3.5), fill=(255, 150, 170, 115))
    d.ellipse(cbox(64 + fx, 56 + oy, 3.5), fill=(255, 150, 170, 115))


def _rot(px, py, cx, cy, deg):
    import math
    r = math.radians(deg)
    dx, dy = px - cx, py - cy
    return (cx + dx * math.cos(r) - dy * math.sin(r), cy + dx * math.sin(r) + dy * math.cos(r))


def draw_wing_reaching_back(d, coin_cx, coin_cy, coin_r):
    """本物の翼らしい、根元が太く先が細いしずく形。体の側面(元の翼の付け根に近い高さ)
    から、金貨に向けて斜め後ろへ伸ばす(腕っぽい丸棒にしない)。"""
    import math
    # 体の左側面(目より左・目と同じ高さ帯)から生やす。目と水平方向に離れているので重ならない。
    shoulder = (36.0, 48.0)
    end = (coin_cx + coin_r * 0.8, coin_cy + coin_r * 0.5)
    dx, dy = end[0] - shoulder[0], end[1] - shoulder[1]
    length = math.hypot(dx, dy)
    angle = math.degrees(math.atan2(dy, dx))

    base_w = length * 0.30
    local = [
        (0, -base_w * 0.5), (length * 0.32, -base_w * 0.46), (length * 0.62, -base_w * 0.26),
        (length * 0.88, -base_w * 0.08), (length, 0),
        (length * 0.88, base_w * 0.08), (length * 0.62, base_w * 0.26),
        (length * 0.32, base_w * 0.46), (0, base_w * 0.5),
    ]
    poly = [_rot(lx, ly, 0, 0, angle) for lx, ly in local]
    poly = [(x + shoulder[0], y + shoulder[1]) for x, y in poly]
    d.polygon([pt(x, y) for x, y in poly], fill=hexrgb(WING_GRAY))
    d.ellipse(cbox(shoulder[0], shoulder[1], base_w * 0.52), fill=hexrgb(WING_GRAY))


def draw(ratio, pal_key, size=OUT):
    img = Image.new('RGBA', (CANVAS, CANVAS), hexrgb(PALETTES[pal_key]))
    d = ImageDraw.Draw(img, 'RGBA')

    coin_r = 30.0 * ratio   # 鳥の体直径(≈60)の半分基準。ratio=2〜3 で「鳥の2〜3倍」相当
    coin_cx, coin_cy = COIN_RIGHT_EDGE - coin_r, 50.0

    draw_coin(d, coin_cx, coin_cy, coin_r)
    # 金貨の大きさが変わっても画面内に残るよう、きらきらは固定位置にする
    star(d, 9, 14, 4.4, hexrgb(SPARK))
    star(d, 30, 7, 3.0, hexrgb(SPARK))
    star(d, 6, 58, 3.6, hexrgb(SPARK))

    draw_tail(d)
    draw_legs(d)
    draw_body_face(d)
    draw_wing_reaching_back(d, coin_cx, coin_cy, coin_r)

    sweat_drop(d, 90, 30, 4.2)
    sweat_drop(d, 97, 40, 3.4)

    return img.convert('RGB').resize((size, size), Image.LANCZOS)


RATIOS = {'r1_2.0x': 2.0, 'r2_2.5x': 2.5, 'r3_3.0x': 3.0}

if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v7')
    os.makedirs(outdir, exist_ok=True)
    for rkey, ratio in RATIOS.items():
        for pal_key in PALETTES:
            name = f'{rkey}_{pal_key}'
            draw(ratio, pal_key, OUT).save(os.path.join(outdir, f'{name}_1024.png'))
            draw(ratio, pal_key, 60).save(os.path.join(outdir, f'{name}_60.png'))
            print(name)
