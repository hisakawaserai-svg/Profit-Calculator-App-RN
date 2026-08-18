"""うりつみ アプリアイコン v14: 背景にグラデーションを入れる。

前景(金貨を運ぶシマエナガ)は gen_uritsumi_icons_mascot.py で確定。
採用された arc_band(current / strong)を土台に、背景をグラデーションにする。

帯は不透明の色ではなく半透明の白で置く。下地がグラデーションでも
帯の濃さが場所によって破綻しないため。
"""
import math
import os
from PIL import Image, ImageColor, ImageDraw

import gen_uritsumi_icons_mascot as M

S = M.S
CANVAS = M.CANVAS

# 白い鳥が背景に溶けないよう、一番明るいところでも「ピンクである」ことを保つ。
# 上を白に寄せすぎると体の輪郭が消えるため、明側は #FDDCE1 で止める。
PINK_LIGHT = '#FDDCE1'
PINK_BASE = '#FBD0D5'
PINK_DEEP = '#F0B2BE'
PINK_DEEPER = '#E99DAD'
PEACH = '#FDDDD3'


def _lerp(c0, c1, t):
    a = ImageColor.getrgb(c0)
    b = ImageColor.getrgb(c1)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def grad_linear(d, c0, c1, angle_deg=90, steps=256):
    """線形グラデーション。細い帯の連続で描くので ImageDraw だけで完結する。

    angle_deg はグラデーションの進行方向(90=上から下)。
    """
    a = math.radians(angle_deg)
    ux, uy = math.cos(a), math.sin(a)
    px, py = -uy, ux
    span = 100.0 * (abs(ux) + abs(uy))
    half = 100.0
    for i in range(steps):
        t = i / (steps - 1)
        d0 = (i / steps - 0.5) * span
        d1 = ((i + 1.4) / steps - 0.5) * span   # わずかに重ねて継ぎ目を消す
        col = _lerp(c0, c1, t)
        d.polygon([((50 + ux * d0 + px * half) * S, (50 + uy * d0 + py * half) * S),
                   ((50 + ux * d0 - px * half) * S, (50 + uy * d0 - py * half) * S),
                   ((50 + ux * d1 - px * half) * S, (50 + uy * d1 - py * half) * S),
                   ((50 + ux * d1 + px * half) * S, (50 + uy * d1 + py * half) * S)],
                  fill=col)


def grad_radial(d, c_in, c_out, cx=42, cy=40, r_max=105, steps=220):
    """放射グラデーション。外側の円から内側へ順に塗る。"""
    d.rectangle([(0, 0), (CANVAS, CANVAS)], fill=ImageColor.getrgb(c_out))
    for i in range(steps, 0, -1):
        t = i / steps
        r = r_max * t
        d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S],
                  fill=_lerp(c_in, c_out, t))


def band(img, alpha, y_left=22, y_right=-10, thick=44):
    """arc_band と同じ形の帯。半透明の白を重ねる。

    ImageDraw の 'RGBA' モードは fill のアルファを合成せず置き換えてしまうため、
    別レイヤーに描いてから alpha_composite する。
    """
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).polygon(
        [(0, y_left * S), (CANVAS, y_right * S),
         (CANVAS, (y_right + thick) * S), (0, (y_left + thick) * S)],
        fill=(255, 255, 255, alpha))
    img.alpha_composite(ov)


# ── 案 ────────────────────────────────────────────────

def v_vert_soft(d, img=None):
    """縦グラデ(上が明るい)+ current 相当の淡い帯。"""
    grad_linear(d, PINK_LIGHT, PINK_DEEP, 90)
    band(img, 40)


def v_vert_strong(d, img=None):
    """縦グラデ + strong 相当のはっきりした帯。"""
    grad_linear(d, PINK_LIGHT, PINK_DEEP, 90)
    band(img, 72)


def v_vert_deep(d, img=None):
    """縦グラデのコントラストを上げた版。"""
    grad_linear(d, PINK_LIGHT, PINK_DEEPER, 90)
    band(img, 72)


def v_diag(d, img=None):
    """斜めグラデ(左上が明るい)。金貨のある側から光が来る。"""
    grad_linear(d, PINK_LIGHT, PINK_DEEP, 55)
    band(img, 72)


def v_radial(d, img=None):
    """放射グラデ。金貨のあたりを中心に明るく。"""
    grad_radial(d, PINK_LIGHT, PINK_DEEP)
    band(img, 66)


def v_warm(d, img=None):
    """上を桃色寄りにした 2 色グラデ。単調なピンクを避ける。"""
    grad_linear(d, PEACH, PINK_DEEP, 100)
    band(img, 72)


def v_reverse(d, img=None):
    """上が濃く下が明るい逆方向。主役の背後が締まる。"""
    grad_linear(d, PINK_DEEP, PINK_LIGHT, 90)
    band(img, 72)


def v_no_band(d, img=None):
    """グラデーションのみ。帯が本当に要るかの確認用。"""
    grad_linear(d, PINK_LIGHT, PINK_DEEP, 90)


VARIANTS = {
    'vert_soft': v_vert_soft,
    'vert_strong': v_vert_strong,
    'vert_deep': v_vert_deep,
    'diag': v_diag,
    'radial': v_radial,
    'warm': v_warm,
    'reverse': v_reverse,
    'no_band': v_no_band,
}


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v14')
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

    sheet.save(os.path.join(outdir, 'contact_sheet_v14.png'))
