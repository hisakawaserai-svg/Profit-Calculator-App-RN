"""うりつみ アプリアイコン v16: 濃色に絞って ¥ と翼の付け根を詰める。

確定しているもの:
  - 前景は「金貨を運ぶシマエナガ」
  - 背景は 55 度の斜めグラデ + 白い帯(diag)

ここで比べるもの:
  - 金貨の ¥ の有無
  - 濃色テーマ 3 種(night / periwinkle / teal)
  - 翼の付け根の処理(体の上に置く従来版 vs 体の下に潜らせる版)
"""
import math
import os
from PIL import Image, ImageDraw

import gen_uritsumi_icons_mascot as M
from gen_uritsumi_icons_v14_grad import band, grad_linear

ANGLE = 55
BAND_ALPHA = 40          # 濃色では白い帯が強く出るので薄め

# 濃色 3 種。白い体と金貨が最も立つ明度帯にそろえる。
THEMES = {
    'night':      ('#5A6592', '#343D63'),
    'periwinkle': ('#6169AE', '#3B4187'),
    'teal':       ('#3F8A85', '#22615F'),
}

# 翼を体の下に潜らせる場合、体に隠れる分だけ長さと位置を足す
WING_UNDER = dict(wing_under=True, wing_a=20.0, wing_rel=(-27.0, 9.0))
WING_TOP = dict(wing_under=False, wing_a=14.4, wing_rel=(-25.6, 8.3))


def bg_for(theme):
    light, deep = THEMES[theme]

    def bg(d, img=None):
        grad_linear(d, light, deep, ANGLE)
        band(img, BAND_ALPHA)

    return bg


CASES = [
    ('night_yen_under', 'night', True, WING_UNDER),
    ('night_yen_top', 'night', True, WING_TOP),
    ('night_noyen_under', 'night', False, WING_UNDER),
    ('periwinkle_yen_under', 'periwinkle', True, WING_UNDER),
    ('periwinkle_yen_top', 'periwinkle', True, WING_TOP),
    ('teal_yen_under', 'teal', True, WING_UNDER),
    ('teal_yen_top', 'teal', True, WING_TOP),
    ('teal_noyen_under', 'teal', False, WING_UNDER),
]


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v16')
    os.makedirs(outdir, exist_ok=True)

    cols, cell, pad = 4, 240, 12
    rows = math.ceil(len(CASES) / cols)
    sheet = Image.new('RGB', (cols * (cell + pad) + pad,
                              rows * (cell + pad + 74) + pad), '#FFFFFF')
    dsheet = ImageDraw.Draw(sheet)

    for i, (name, theme, yen, wing) in enumerate(CASES):
        kw = dict(bg=bg_for(theme), yen=yen, **wing)
        big = M.draw(M.OUT, **kw)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = M.draw(60, **kw)
        small.save(os.path.join(outdir, f'{name}_60.png'))

        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y = pad + r * (cell + pad + 74)
        sheet.paste(big.resize((cell, cell), Image.LANCZOS), (x, y))
        sheet.paste(small, (x + cell // 2 - 30, y + cell + 6))
        dsheet.text((x + 4, y + cell + 70), name, fill='#333333')
        print(name, 'ok')

    sheet.save(os.path.join(outdir, 'contact_sheet_v16.png'))
