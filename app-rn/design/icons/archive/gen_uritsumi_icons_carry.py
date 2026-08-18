"""うりつみ アプリアイコン: 鳥が右横に巨大な金貨を抱えて運んでいる(最終案)。

前回(gen_uritsumi_icons_stacking.py)の反省:
  - 金貨と鳥(翼)が接触しておらず「持っている」ように見えなかった
  - 体の傾き(±7〜8度)が小さすぎて視認できなかった
  - 両足が同じ形で「歩いている」動作が出なかった

今回は金貨を鳥の右横に配置して必ず接触させ、翼を金貨の手前に重ねて
「支えている」形にする。体は最低15度傾け、片足を上げて歩行/踏み出しの
動作を出す。

描画順: 背景 → 鳥本体(尾・脚・体・顔。翼は含まない。傾けて回転)
        → 金貨(固定・回転なし) → 翼(金貨の手前に角度を付けて重ねる)
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0
CANVAS = OUT * SS

GOLD_LIGHT, GOLD_BASE, GOLD_DARK = '#F7DE8A', '#E8BE4D', '#B8860B'
WING_GRAY = '#D8D8DC'
PALETTES = {'soft_pink': '#FCE7EC', 'mint': '#E3F6E6'}

COIN_CX, COIN_CY, COIN_R = 88, 70, 34


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


def draw_leg(d, fx, fy0, fy1, fanx=3, fany=1, angled_to=None):
    """片脚を描く。angled_to があれば (fx,fy0)→angled_to の斜め脚(上げ足)にする。"""
    if angled_to is None:
        end = (fx, fy1)
    else:
        end = angled_to
    d.line([pt(fx, fy0), pt(*end)], fill='#FF9500', width=max(1, int(2 * S)), joint='curve')
    ex, ey = end
    d.line([pt(ex - fanx, ey + fany), pt(ex, ey), pt(ex + fanx, ey + fany)],
           fill='#FF9500', width=max(1, int(2 * S)), joint='curve')
    for cx, cy in ((fx, fy0), (ex, ey), (ex - fanx, ey + fany), (ex + fanx, ey + fany)):
        d.ellipse(box(cx - 1, cy - 1, 2, 2), fill='#FF9500')


def bird_base_layer(lifted='right', style='small'):
    """尾・軸足(体の後ろ)・体・上げ足(体の手前=常に見える)・顔。
    翼は含まない(金貨の上に別で重ねるため)。
    上げ足は体の下に隠れて見えなくなるのを避けるため、体より後に(手前に)描く。"""
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    d.polygon([pt(*p) for p in ((55, 72), (84, 86), (82, 93), (52, 81))], fill='#3A3A3C')  # 尾

    if lifted == 'right':
        draw_leg(d, 45, 82, 90)   # 左脚(軸足。体の後ろのまま)
    else:
        draw_leg(d, 55, 82, 90)   # 右脚(軸足)

    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')                          # 体

    if lifted == 'right':
        if style == 'small':
            draw_leg(d, 55, 78, 82, angled_to=(63, 83))     # 右脚を軽く前へ
        else:  # large: 踏み出す途中
            draw_leg(d, 55, 76, 82, angled_to=(74, 86))     # 右脚を大きく前へ
    else:  # lifted == 'left'
        draw_leg(d, 45, 78, 82, angled_to=(35, 83))         # 左脚を軽く前へ

    d.ellipse(box(42 - 3, 48 - 3, 6, 6), fill='#1C1C1E')
    d.ellipse(box(58 - 3, 48 - 3, 6, 6), fill='#1C1C1E')
    d.polygon([pt(47, 54), pt(53, 54), pt(50, 60)], fill='#FF9500')
    d.ellipse(box(36 - 3.5, 56 - 3.5, 7, 7), fill=(255, 150, 170, 115))
    d.ellipse(box(64 - 3.5, 56 - 3.5, 7, 7), fill=(255, 150, 170, 115))
    return img


def draw_wing_over_coin(d):
    """翼(元の楕円ではなく、金貨に沿う角度付きの腕として描く。色はWING_GRAYのまま)。"""
    shoulder = pt(69, 47)
    rest = pt(83, 76)
    d.line([shoulder, rest], fill=hexrgb(WING_GRAY), width=int(15 * S), joint='curve')
    d.ellipse(box(69 - 8, 47 - 8, 16, 16), fill=hexrgb(WING_GRAY))
    d.ellipse(box(83 - 9, 76 - 9, 18, 18), fill=hexrgb(WING_GRAY))


VARIANTS = {
    'v1_15deg_small_step': {'angle': 15, 'lifted': 'right', 'style': 'small', 'pivot': (45, 90)},
    'v2_20deg_big_step': {'angle': 20, 'lifted': 'right', 'style': 'large', 'pivot': (45, 90)},
    'v3_15deg_left_lift': {'angle': 15, 'lifted': 'left', 'style': 'small', 'pivot': (55, 90)},
}


def draw(variant_key, pal_key, size=OUT):
    cfg = VARIANTS[variant_key]
    img = Image.new('RGBA', (CANVAS, CANVAS), hexrgb(PALETTES[pal_key]))
    d = ImageDraw.Draw(img, 'RGBA')

    base = bird_base_layer(lifted=cfg['lifted'], style=cfg['style'])
    base = base.rotate(cfg['angle'], resample=Image.BICUBIC, center=pt(*cfg['pivot']))
    img.alpha_composite(base)

    draw_coin(ImageDraw.Draw(img, 'RGBA'), COIN_CX, COIN_CY, COIN_R)
    draw_wing_over_coin(ImageDraw.Draw(img, 'RGBA'))

    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v6')
    os.makedirs(outdir, exist_ok=True)
    for variant_key in VARIANTS:
        for pal_key in PALETTES:
            name = f'{variant_key}_{pal_key}'
            draw(variant_key, pal_key, OUT).save(os.path.join(outdir, f'{name}_1024.png'))
            draw(variant_key, pal_key, 60).save(os.path.join(outdir, f'{name}_60.png'))
            print(name)
