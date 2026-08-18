"""うりつみ アプリアイコン v17: ¥ の傾き比較。

確定しているもの:
  - 前景「金貨を運ぶシマエナガ」、翼は体の上に置く(top)
  - 背景は 55 度の斜めグラデ + 白い帯、濃色 night
  - 金貨に ¥ を入れる

ここで比べるのは ¥ の傾きだけ。負が反時計回り。
"""
import math
import os
from PIL import Image, ImageDraw

import gen_uritsumi_icons_mascot as M
from gen_uritsumi_icons_v14_grad import band, grad_linear

ANGLE = 55
BAND_ALPHA = 40
THEMES = {
    'night': ('#5A6592', '#343D63'),
    'periwinkle': ('#6169AE', '#3B4187'),
    'teal': ('#3F8A85', '#22615F'),
}


def bg_for(theme):
    light, deep = THEMES[theme]

    def bg(d, img=None):
        grad_linear(d, light, deep, ANGLE)
        band(img, BAND_ALPHA)

    return bg


ROTS = [-20, -15, -12, -8, 0, 8, 12, 20]


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v17')
    os.makedirs(outdir, exist_ok=True)

    cols, cell, pad = 4, 240, 12
    rows = math.ceil(len(ROTS) / cols)
    sheet = Image.new('RGB', (cols * (cell + pad) + pad,
                              rows * (cell + pad + 74) + pad), '#FFFFFF')
    dsheet = ImageDraw.Draw(sheet)

    for i, rot in enumerate(ROTS):
        kw = dict(bg=bg_for('night'), yen=True, yen_rot=rot, wing_under=False)
        name = f'night_yen{rot:+d}'
        big = M.draw(M.OUT, **kw)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = M.draw(60, **kw)
        small.save(os.path.join(outdir, f'{name}_60.png'))

        r, c = divmod(i, cols)
        x = pad + c * (cell + pad)
        y = pad + r * (cell + pad + 74)
        sheet.paste(big.resize((cell, cell), Image.LANCZOS), (x, y))
        sheet.paste(small, (x + cell // 2 - 30, y + cell + 6))
        dsheet.text((x + 4, y + cell + 70), f'{rot:+d}°', fill='#333333')
        print(name, 'ok')

    sheet.save(os.path.join(outdir, 'contact_sheet_v17.png'))
