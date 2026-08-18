"""うりつみ アプリアイコン 確定版。

ここまでの検討で決まった仕様を1箇所に集約する。案出し用の
gen_uritsumi_icons_v1x_*.py は履歴として残すが、確定値はこのファイルが正。

確定事項:
  前景   : 金貨を運ぶシマエナガ(BirdMascot.tsx の造形をそのまま使用)
  顔     : 左上を向く(時計回り +11 度)、目は `>` `<`
  左足   : 前へ踏み出して浮かせる。足首の角度は右足と揃える
  翼     : 体の上に描く(top)。丸いオーバルで金貨を下から支える
  金貨   : 500円玉のような二層 + ¥ を +12 度傾けて配置(顔の傾きと同じ向き)
  背景   : 55 度の斜めグラデーション + 白い帯(alpha 40)
  配色   : night(濃紺)を本命。periwinkle / teal も出力して比較用に残す
"""
import os
from PIL import Image, ImageDraw

import gen_uritsumi_icons_mascot as M
from gen_uritsumi_icons_v14_grad import band, grad_linear

# ── 確定パラメータ ────────────────────────────────────
GRAD_ANGLE = 55
BAND_ALPHA = 40
YEN_ROT = 12.0

THEMES = {
    'night': ('#5A6592', '#343D63'),        # 本命
    'periwinkle': ('#6169AE', '#3B4187'),
    'teal': ('#3F8A85', '#22615F'),
}

SIZES = (1024, 180, 120, 60)


def background(theme):
    light, deep = THEMES[theme]

    def bg(d, img=None):
        grad_linear(d, light, deep, GRAD_ANGLE)
        band(img, BAND_ALPHA)

    return bg


def render(theme='night', size=1024):
    return M.draw(size, bg=background(theme), yen=True, yen_rot=YEN_ROT,
                  wing_under=False)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'final')
    os.makedirs(outdir, exist_ok=True)

    for theme in THEMES:
        for size in SIZES:
            render(theme, size).save(
                os.path.join(outdir, f'uritsumi_{theme}_{size}.png'))
        print(theme, 'ok')

    # 3 テーマを 1024 と 60px で並べた確認用シート
    cell, pad = 300, 14
    sheet = Image.new('RGB', (3 * (cell + pad) + pad, cell + pad * 2 + 76), '#FFFFFF')
    ds = ImageDraw.Draw(sheet)
    for i, theme in enumerate(THEMES):
        x = pad + i * (cell + pad)
        sheet.paste(render(theme, 1024).resize((cell, cell), Image.LANCZOS), (x, pad))
        sheet.paste(render(theme, 60), (x + cell // 2 - 30, pad + cell + 8))
        ds.text((x + 4, pad + cell + 72), theme, fill='#333333')
    sheet.save(os.path.join(outdir, 'final_sheet.png'))
