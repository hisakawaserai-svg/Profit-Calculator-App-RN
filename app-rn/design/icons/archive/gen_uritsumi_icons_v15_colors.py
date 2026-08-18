"""うりつみ アプリアイコン v15: 採用した diag(斜めグラデ + 帯)の配色違い。

前景(金貨を運ぶシマエナガ)と背景の構造(55度の斜めグラデ + 白い帯)は確定。
ここでは背景 2 色の組み合わせだけを振る。

配色の条件:
  - 体が白なので、明るい側でも白飛びしない明度に留めること
  - 金貨(#F6C748 / #FFDA6E)と競合しない色相を選ぶこと
    (黄系の背景は金貨が沈むため cream は参考として残すだけ)
"""
import math
import os
from PIL import Image, ImageDraw

import gen_uritsumi_icons_mascot as M
from gen_uritsumi_icons_v14_grad import band, grad_linear

ANGLE = 55
BAND_ALPHA = 72

THEMES = {
    'pink':       ('#FDDCE1', '#F0B2BE'),   # 現状
    'coral':      ('#FFE3D8', '#FBBCA2'),
    'cream':      ('#FDF0DA', '#F5DCAB'),
    'mint':       ('#DFF4E8', '#ACDEC6'),
    'sage':       ('#E8F0E0', '#C3D8B6'),
    'teal':       ('#DAF1EF', '#A7DBD7'),
    'sky':        ('#DDEFFB', '#AFD5F0'),
    'periwinkle': ('#E2E7FA', '#B4C0EE'),
    'lavender':   ('#EBE2F6', '#C6B6E6'),
    'lilac_pink': ('#F7E0F0', '#E7B7DA'),
    'gray':       ('#EDEFF3', '#CAD0DA'),
    'night':      ('#5A6592', '#343D63'),   # 濃色。白い体が最も際立つ
}


def make(theme):
    light, deep = THEMES[theme]

    def bg(d, img=None):
        grad_linear(d, light, deep, ANGLE)
        # 濃色テーマでは白い帯が強く出すぎるので薄める
        band(img, 40 if theme == 'night' else BAND_ALPHA)

    return bg


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v15')
    os.makedirs(outdir, exist_ok=True)

    cols, cell, pad = 4, 240, 12
    rows = math.ceil(len(THEMES) / cols)
    sheet = Image.new('RGB', (cols * (cell + pad) + pad,
                              rows * (cell + pad + 74) + pad), '#FFFFFF')
    dsheet = ImageDraw.Draw(sheet)

    for i, name in enumerate(THEMES):
        fn = make(name)
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

    sheet.save(os.path.join(outdir, 'contact_sheet_v15.png'))
