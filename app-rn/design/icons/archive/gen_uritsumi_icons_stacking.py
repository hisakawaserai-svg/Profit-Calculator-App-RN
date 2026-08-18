"""うりつみ アプリアイコン: 鳥が巨大な金貨を、金貨の山の上に「今まさに積もうとしている」動作。

「積む」動作そのものを描く。要素は 鳥 + 巨大金貨(抱えている) + 低く単純な山(金貨3枚
程度)の3点に絞り、山は描き込みすぎない。動作を出すため、鳥の体を傾けて描画する
(体一式を別レイヤーに描いてから回転させ、足のあたりを軸にする=踏ん張って傾いている
ように見せる)。金貨は鳥のパーツと違い回転させても見た目が変わらないので、位置だけを
変えて「掲げる/抱える/山に半分乗せる」を表現する。

3案:
  1. 金貨を頭上に掲げ、山の真上に構えている
  2. 金貨を胸の前に抱え、山に近づけている(体は山の方向へ傾く)
  3. 金貨を山の上に半分乗せ、押し上げている途中

鳥のパーツの形・色は元スクリプトのまま。金貨は円記号・数字なし、GOLD三色のみ。
"""
import math
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0
CANVAS = OUT * SS

GOLD_LIGHT, GOLD_BASE, GOLD_DARK = '#F7DE8A', '#E8BE4D', '#B8860B'
WING_GRAY = '#D8D8DC'
PALETTES = {'soft_pink': '#FCE7EC', 'mint': '#E3F6E6'}


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def pt(x, y):
    return x * S, y * S


def box(x, y, w, h):
    return [pt(x, y), pt(x + w, y + h)]


def draw_coin(d, cx, cy, r):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), fill=hexrgb(GOLD_BASE), outline=hexrgb(GOLD_DARK),
               width=max(2, int(0.03 * r * S)))
    inner = r * 0.86
    d.ellipse(box(cx - inner, cy - inner, inner * 2, inner * 2), outline=hexrgb(GOLD_DARK, 140),
               width=max(1, int(0.015 * r * S)))
    hl_r = r * 0.28
    d.ellipse(box(cx - r * 0.32 - hl_r, cy - r * 0.32 - hl_r, hl_r * 2, hl_r * 2), fill=hexrgb(GOLD_LIGHT, 230))


def draw_pile(d, cx, base_cy, n=3):
    """低く単純な山(金貨n枚。平たい円盤を少しずつずらして積む)。"""
    w, h = 30, 8
    for i in range(n):
        cy = base_cy - i * (h * 0.62)
        shade = [GOLD_BASE, GOLD_LIGHT, GOLD_BASE][i % 3]
        d.ellipse(box(cx - w / 2, cy - h / 2, w, h), fill=hexrgb(shade), outline=hexrgb(GOLD_DARK), width=2)
    return base_cy - (n - 1) * (h * 0.62) - h / 2   # 山の一番上の縁の y


def bird_layer():
    """鳥本体(尾・足・体・翼・顔)を透明レイヤーに描く(未回転・未オフセット)。"""
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    d.polygon([pt(*p) for p in ((55, 72), (84, 86), (82, 93), (52, 81))], fill='#3A3A3C')  # 尾
    for fx in (45, 55):
        d.line([pt(fx, 82), pt(fx, 90)], fill='#FF9500', width=max(1, int(2 * S)))
        d.line([pt(fx - 3, 91), pt(fx, 90), pt(fx + 3, 91)], fill='#FF9500', width=max(1, int(2 * S)), joint='curve')
    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')                          # 体
    d.ellipse(box(61, 44, 18, 32), fill=WING_GRAY)                          # 右翼
    d.ellipse(box(21, 44, 18, 32), fill=WING_GRAY)                          # 左翼(ミラー。抱える動作の腕として)
    d.ellipse(box(42 - 3, 48 - 3, 6, 6), fill='#1C1C1E')
    d.ellipse(box(58 - 3, 48 - 3, 6, 6), fill='#1C1C1E')
    d.polygon([pt(47, 54), pt(53, 54), pt(50, 60)], fill='#FF9500')
    d.ellipse(box(36 - 3.5, 56 - 3.5, 7, 7), fill=(255, 150, 170, 115))
    d.ellipse(box(64 - 3.5, 56 - 3.5, 7, 7), fill=(255, 150, 170, 115))
    return img


def draw(variant, pal_key, size=OUT):
    img = Image.new('RGBA', (CANVAS, CANVAS), hexrgb(PALETTES[pal_key]))
    d = ImageDraw.Draw(img, 'RGBA')

    bird = bird_layer()

    if variant == 'overhead':
        # 山は中央足元。金貨は頭上に掲げ、山の真上に構える。体はやや後ろに反って踏ん張る。
        pile_top = draw_pile(d, 50, 96, n=3)
        pivot = pt(50, 84)   # 足元を軸に
        bird = bird.rotate(-7, resample=Image.BICUBIC, center=pivot)
        img.alpha_composite(bird)
        coin_r = 30
        draw_coin(ImageDraw.Draw(img, 'RGBA'), 50, 10, coin_r)

    elif variant == 'chest':
        # 山はやや右寄り。体を山の方へ傾け、金貨を胸の前に抱えて近づける。
        # 顔が隠れないよう、金貨はやや小さめ・低い位置(顎の下)に置く。
        pile_top = draw_pile(d, 68, 96, n=3)
        pivot = pt(46, 84)
        bird = bird.rotate(8, resample=Image.BICUBIC, center=pivot)
        img.alpha_composite(bird)
        coin_r = 20
        draw_coin(ImageDraw.Draw(img, 'RGBA'), 60, 78, coin_r)

    else:  # 'half_on_pile'
        # 山は中央。金貨を山の上に半分乗せ、横から押し上げている途中。
        pile_top = draw_pile(d, 50, 96, n=3)
        pivot = pt(44, 84)
        bird = bird.rotate(8, resample=Image.BICUBIC, center=pivot)
        img.alpha_composite(bird)
        coin_r = 26
        draw_coin(ImageDraw.Draw(img, 'RGBA'), 62, pile_top + coin_r * 0.3, coin_r)

    return img.convert('RGB').resize((size, size), Image.LANCZOS)


VARIANTS = ['overhead', 'chest', 'half_on_pile']

if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v5')
    os.makedirs(outdir, exist_ok=True)
    for variant in VARIANTS:
        for pal_key in PALETTES:
            name = f'{variant}_{pal_key}'
            draw(variant, pal_key, OUT).save(os.path.join(outdir, f'{name}_1024.png'))
            draw(variant, pal_key, 60).save(os.path.join(outdir, f'{name}_60.png'))
            print(name)
