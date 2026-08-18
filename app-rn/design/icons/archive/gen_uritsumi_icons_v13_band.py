"""うりつみ アプリアイコン v13: 採用した arc_band の詰め。

前景(金貨を運ぶシマエナガ)は gen_uritsumi_icons_mascot.py で確定。
ここでは帯の角度・太さ・曲率・本数・濃さだけを振って比較する。
"""
import math
import os
from PIL import Image, ImageDraw

import gen_uritsumi_icons_mascot as M

S = M.S
CANVAS = M.CANVAS

LIGHT = '#FFE2E6'
LIGHT_SOFT = '#FDD9DE'
LIGHT_STRONG = '#FFECEF'


def band(d, y_left, y_right, thick, color=LIGHT):
    """直線の帯。左端/右端の上辺 y と厚みで指定する。"""
    d.polygon([(0, y_left * S), (CANVAS, y_right * S),
               (CANVAS, (y_right + thick) * S), (0, (y_left + thick) * S)],
              fill=color)


def arc(d, cx, cy, r_out, r_in, color=LIGHT):
    """円弧の帯(外円を塗って内円を背景色で抜く)。"""
    d.ellipse([(cx - r_out) * S, (cy - r_out) * S,
               (cx + r_out) * S, (cy + r_out) * S], fill=color)
    d.ellipse([(cx - r_in) * S, (cy - r_in) * S,
               (cx + r_in) * S, (cy + r_in) * S], fill=M.BG_PINK)


def b_current(d, img=None):
    """v12 の採用案そのまま。"""
    band(d, 22, -10, 44)


def b_thin(d, img=None):
    """細めの帯。背景の主張を弱める。"""
    band(d, 30, 6, 26)


def b_carry_dir(d, img=None):
    """左上から右下へ下る帯。金貨を運んでいく方向に沿わせる。"""
    band(d, 8, 40, 40)


def b_arc(d, img=None):
    """曲線の帯。動きが出て、直線より柔らかい。"""
    arc(d, 5, 115, 105, 72)


def b_arc_tight(d, img=None):
    """曲率を強めた弧。主役を下から掬うように回り込む。"""
    arc(d, 22, 108, 88, 60)


def b_double(d, img=None):
    """太い帯 + 細い帯。奥行きが出る。"""
    band(d, 22, -10, 44)
    band(d, 74, 52, 12, LIGHT_STRONG)


def b_soft(d, img=None):
    """現状の帯のコントラストを下げた版。60px でのノイズを避ける。"""
    band(d, 22, -10, 44, LIGHT_SOFT)


def b_strong(d, img=None):
    """逆にコントラストを上げた版。"""
    band(d, 22, -10, 44, LIGHT_STRONG)


VARIANTS = {
    'current': b_current,
    'thin': b_thin,
    'carry_dir': b_carry_dir,
    'arc': b_arc,
    'arc_tight': b_arc_tight,
    'double': b_double,
    'soft': b_soft,
    'strong': b_strong,
}


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v13')
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

    sheet.save(os.path.join(outdir, 'contact_sheet_v13.png'))
