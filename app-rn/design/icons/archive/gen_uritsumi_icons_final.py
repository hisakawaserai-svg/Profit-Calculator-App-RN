"""うりつみ アプリアイコン: 参考画像(生成イラスト+公式キャラのフェイスシート)を元にした最終案。

参考画像から採用したもの:
  - 巨大な金貨を鳥が下から支え、頭上〜斜め上に構図いっぱいに配置する
  - 汗・プルプル線(震え)・影で「しんどさ」を出す
  - 画面いっぱいに大きく(背景の余白を減らす)

参考画像から採用しなかったもの:
  - 金貨の¥マーク・数字(このアプリでは一貫して不使用。円記号や数字は
    家計簿アプリっぽさに寄るため NG というプロジェクトの方針を優先)
  - 手のように尖った翼の形(ユーザー指示により、公式キャラのフェイスシート
    にある「単純な灰色の楕円」の翼に戻す。角度・位置の調整のみ)

描画順: 背景 → 影 → 金貨(奥) → 尾 → 脚 → 体・顔 → 翼(単純な楕円を回転) →
        震え線 → 汗 → きらきら
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
SWEAT = '#CFE9F7'
SPARK = '#FFFFFF'
TREMBLE = '#B7B7C0'
PALETTES = {'soft_pink': '#FCE7EC', 'mint': '#E3F6E6'}
SHADOW = {'soft_pink': '#F2B9C6', 'mint': '#B9DFC0'}

BODY_CX, BODY_CY = 64.0, 64.0
COIN_CX, COIN_CY, COIN_R = 46.0, 34.0, 40.0
FACE_SHIFT_X = -5


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
    hl_r = r * 0.22
    d.ellipse(cbox(cx - r * 0.36, cy - r * 0.36, hl_r), fill=hexrgb(GOLD_LIGHT, 230))


def star(d, cx, cy, r, color, waist=0.3):
    w = r * waist
    pts = [(cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
           (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)]
    d.polygon([pt(x, y) for x, y in pts], fill=color)


def sweat_drop(d, cx, cy, s):
    d.polygon([pt(cx, cy - s), pt(cx - s * 0.6, cy + s * 0.3), pt(cx, cy + s * 0.9), pt(cx + s * 0.6, cy + s * 0.3)],
               fill=hexrgb(SWEAT))


def tremble(d, cx, cy, s=3.5, n=3):
    pts = []
    for i in range(n + 1):
        x = cx + (i - n / 2) * s * 0.55
        y = cy + (s if i % 2 == 0 else -s) * 0.5
        pts.append((x, y))
    d.line([pt(x, y) for x, y in pts], fill=hexrgb(TREMBLE), width=max(1, int(1.6 * S)), joint='curve')


def draw_shadow(d, pal_key):
    cx, cy, rx, ry = BODY_CX + 4, 98, 26, 5
    d.ellipse(box(cx - rx, cy - ry, rx * 2, ry * 2), fill=hexrgb(SHADOW[pal_key], 200))


def draw_tail(d):
    ox, oy = BODY_CX - 50, BODY_CY - 54
    p = [(55, 72), (84, 86), (82, 93), (52, 81)]
    mirrored = [(50 - (x - 50) + ox, y + oy) for x, y in p]
    d.polygon([pt(x, y) for x, y in mirrored], fill='#3A3A3C')


def draw_legs(d):
    ox, oy = BODY_CX - 50, BODY_CY - 54
    fx, fy0, fy1 = 45 + ox, 82 + oy, 90 + oy
    d.line([pt(fx, fy0), pt(fx, fy1)], fill='#FF9500', width=max(1, int(2 * S)))
    d.line([pt(fx - 3, fy1 + 1), pt(fx, fy1), pt(fx + 3, fy1 + 1)], fill='#FF9500',
           width=max(1, int(2 * S)), joint='curve')
    fx2, fy2_0 = 57 + ox, 82 + oy
    end = (63 + ox, 90 + oy)
    d.line([pt(fx2, fy2_0), pt(*end)], fill='#FF9500', width=max(1, int(2 * S)), joint='curve')
    ex, ey = end
    d.line([pt(ex - 3, ey + 1), pt(ex, ey), pt(ex + 3, ey + 1)], fill='#FF9500',
           width=max(1, int(2 * S)), joint='curve')
    return (fx, fy1), (ex, ey)


def draw_body_face(d):
    ox, oy = BODY_CX - 50, BODY_CY - 54
    fx = ox + FACE_SHIFT_X
    d.ellipse(box(21 + ox, 23 + oy, 58, 62), fill='#FFFFFF')
    lex, ley = 42 + fx, 48 + oy
    d.line([pt(lex - 2.6, ley - 2.6), pt(lex + 1.6, ley), pt(lex - 2.6, ley + 2.6)],
           fill='#1C1C1E', width=max(1, int(2.2 * S)), joint='curve')
    rex, rey = 58 + fx, 48 + oy
    d.line([pt(rex + 2.6, rey - 2.6), pt(rex - 1.6, rey), pt(rex + 2.6, rey + 2.6)],
           fill='#1C1C1E', width=max(1, int(2.2 * S)), joint='curve')
    d.polygon([pt(47 + fx, 54 + oy), pt(53 + fx, 54 + oy), pt(50 + fx, 60 + oy)], fill='#FF9500')
    d.ellipse(cbox(36 + fx, 56 + oy, 3.5), fill=(255, 150, 170, 115))
    d.ellipse(cbox(64 + fx, 56 + oy, 3.5), fill=(255, 150, 170, 115))


def draw_wing_oval(img):
    """公式キャラと同じ単純な灰色の楕円(元は 18x32 の縦長楕円)を、
    金貨に届く角度まで回転させるだけ。形自体は変えない。"""
    # 目より下・くちばしより左の高さに付け根を置き、顔にかからないようにする。
    shoulder = (32.0, 66.0)
    contact = (63.0, 68.0)   # 金貨の縁(右下寄り)に触れる位置
    mx = shoulder[0] * 0.75 + contact[0] * 0.25
    my = shoulder[1] * 0.75 + contact[1] * 0.25

    dx, dy = contact[0] - shoulder[0], contact[1] - shoulder[1]
    angle = math.degrees(math.atan2(dy, dx)) - 90   # 既定(縦長=90度向き)からの回転量

    w, h = 16, 28
    tile = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile, 'RGBA')
    td.ellipse(cbox(mx, my, 1), fill=None)  # no-op (keeps cbox import path used)
    td.ellipse([pt(mx - w / 2, my - h / 2), pt(mx + w / 2, my + h / 2)], fill=hexrgb(WING_GRAY))
    tile = tile.rotate(-angle, resample=Image.BICUBIC, center=pt(mx, my))
    img.alpha_composite(tile)
    return shoulder, contact


def draw(pal_key, size=OUT):
    img = Image.new('RGBA', (CANVAS, CANVAS), hexrgb(PALETTES[pal_key]))
    d = ImageDraw.Draw(img, 'RGBA')

    draw_shadow(d, pal_key)
    draw_coin(d, COIN_CX, COIN_CY, COIN_R)
    star(d, 14, 20, 5.0, hexrgb(SPARK))
    star(d, 40, 4, 3.4, hexrgb(SPARK))
    star(d, 78, 12, 3.8, hexrgb(SPARK))

    draw_tail(d)
    ground_foot, step_foot = draw_legs(d)
    draw_body_face(d)
    shoulder, contact = draw_wing_oval(img)
    d = ImageDraw.Draw(img, 'RGBA')

    tremble(d, ground_foot[0] - 6, ground_foot[1] - 4)
    tremble(d, contact[0] + 4, contact[1] + 10, s=3.0)

    sweat_drop(d, 86, 40, 4.4)
    sweat_drop(d, 92, 50, 3.4)

    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v8')
    os.makedirs(outdir, exist_ok=True)
    for pal_key in PALETTES:
        draw(pal_key, OUT).save(os.path.join(outdir, f'{pal_key}_1024.png'))
        draw(pal_key, 60).save(os.path.join(outdir, f'{pal_key}_60.png'))
        print(pal_key)
