"""うりつみ アプリアイコン v12: 前景は確定、背景だけを比較する。

前景(金貨を運ぶシマエナガ)は gen_uritsumi_icons_mascot.py の構図で固定。
このスクリプトは背景の付け足し方だけを差し替えて並べる。
キャラクターの位置・大きさ・ポーズはここでは一切いじらない。
"""
import math
import os
from PIL import Image, ImageDraw

import gen_uritsumi_icons_mascot as M

S = M.S
CANVAS = M.CANVAS

# 背景ピンク #FBD0D5 に対する、同系の明/暗トーン。
# 前景と競合しないよう彩度差ではなく明度差だけで作る。
LIGHT = '#FFE2E6'
DARK = '#F3BDC4'
GOLD_GHOST = '#F7C6C8'


def _circle(d, cx, cy, r, color):
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=color)


def bg_plain(d, img=None):
    """現状。無地。"""


def bg_scene_circle(d, img=None):
    """中央に一段明るい大円。BirdMascot のシーン円と同じ語彙。"""
    _circle(d, 50, 50, 46, LIGHT)


def bg_ground(d, img=None):
    """下部に地面のアーチ。鳥が立っている場所ができる。"""
    _circle(d, 50, 128, 62, DARK)


def bg_scene_and_ground(d, img=None):
    """シーン円 + 地面。奥行きが二段になる。"""
    _circle(d, 50, 50, 46, LIGHT)
    _circle(d, 50, 128, 62, DARK)


def bg_mini_coins(d, img=None):
    """背景に小さな金貨のゴースト。数の多さ=積み上がりを匂わせる。"""
    for cx, cy, r in ((80, 18, 7), (16, 78, 6), (90, 66, 5), (58, 12, 4.5)):
        _circle(d, cx, cy, r, GOLD_GHOST)
        _circle(d, cx, cy, r * 0.62, M.BG_PINK)


def bg_dots(d, img=None):
    """薄い水玉。面が単調になるのを防ぐだけの控えめな texture。"""
    for row in range(7):
        for col in range(7):
            cx = 8 + col * 14 + (7 if row % 2 else 0)
            cy = 8 + row * 14
            _circle(d, cx, cy, 1.6, LIGHT)


def bg_diagonal(d, img=None):
    """斜めに 2 トーン。左上(金貨側)を明るくして視線を集める。"""
    d.polygon([(0, 0), (CANVAS, 0), (0, CANVAS)], fill=LIGHT)


def bg_arc_band(d, img=None):
    """左上から右下へ抜ける太い帯。運んでいる方向の動線になる。"""
    d.polygon([(0, 22 * S), (CANVAS, -10 * S), (CANVAS, 34 * S), (0, 66 * S)],
              fill=LIGHT)


VARIANTS = {
    'plain': bg_plain,
    'scene_circle': bg_scene_circle,
    'ground': bg_ground,
    'scene_and_ground': bg_scene_and_ground,
    'mini_coins': bg_mini_coins,
    'dots': bg_dots,
    'diagonal': bg_diagonal,
    'arc_band': bg_arc_band,
}


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v12')
    os.makedirs(outdir, exist_ok=True)

    cols, cell, pad = 4, 250, 12
    rows = math.ceil(len(VARIANTS) / cols)
    sheet = Image.new('RGB', (cols * (cell + pad) + pad,
                              rows * (cell + pad + 74) + pad), '#FFFFFF')
    dsheet = ImageDraw.Draw(sheet)

    for i, (name, fn) in enumerate(VARIANTS.items()):
        big = M.draw(M.OUT, bg=fn)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = M.draw(60, bg=fn)
        small.save(os.path.join(outdir, f'{name}_60.png'))

        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y = pad + r * (cell + pad + 74)
        sheet.paste(big.resize((cell, cell), Image.LANCZOS), (x, y))
        sheet.paste(small, (x + cell // 2 - 30, y + cell + 6))
        dsheet.text((x + 4, y + cell + 70), name, fill='#333333')
        print(name, 'ok')

    sheet.save(os.path.join(outdir, 'contact_sheet_v12.png'))
