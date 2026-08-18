"""うりつみ アプリアイコン: 背景グリッドで「積み上がっていく過程」を語る。

前作(スタンプ抜き)は、背景のチェッカーが左上から右下へ徐々に現れることで
「透過されていく過程」を背景そのもので語っていた。この構造をうりつみに移植する。
動詞は「透過」ではなく「積む」── 空のマス目が徐々に埋まっていく背景にする。

前作は 1024px に対し 64px セル(16マス/辺)だったが、60px 縮小時にノイズ化する
ため、うりつみでは 8マス/辺 まで減らす(必要ならさらに減らして再出力する)。

3方向:
  1. 下から上へ(下段は完全に埋まり、上へ行くほど疎になる)
  2. 対角(左下から右上へ。前作と同じ方向)
  3. 左から右へ(左が埋まり、右が空)

埋まったセルはパレットのアクセント色(背景より一段濃い)。空セルは薄い枠線のみ。
鳥は中央に通常サイズで配置。形・色は元スクリプトのまま。背景で語るため、
足元の積み上げや持ち物は付けない(鳥+背景の2要素のみ)。
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0

GRID_N = 8   # 1辺あたりのマス数(8〜10の範囲。潰れる場合はここを減らす)


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def bayer_matrix(n):
    """n=2^k のオーダードディザ用 Bayer 行列(0..n*n-1)。"""
    if n == 1:
        return [[0]]
    half = bayer_matrix(n // 2)
    size = n // 2
    m = [[0] * n for _ in range(n)]
    for i in range(size):
        for j in range(size):
            v = half[i][j]
            m[i][j] = 4 * v
            m[i][j + size] = 4 * v + 2
            m[i + size][j] = 4 * v + 3
            m[i + size][j + size] = 4 * v + 1
    return m


def smoothstep(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def draw_grid(d, pattern, bg_hex, fill_hex, n=GRID_N):
    bayer = bayer_matrix(n)
    denom = n * n
    cs = 100.0 / n
    outline = hexrgb(fill_hex, 70)
    fill_color = hexrgb(fill_hex, 255)

    for img_row in range(n):
        row_from_bottom = n - 1 - img_row
        for col in range(n):
            if pattern == 'bottom_up':
                t = row_from_bottom / (n - 1)
            elif pattern == 'diagonal':
                t = (row_from_bottom + col) / (2 * (n - 1))
            else:  # left_right
                t = col / (n - 1)
            p = smoothstep(1 - t)
            threshold = (bayer[img_row][col] + 0.5) / denom
            x0, y0 = col * cs, img_row * cs
            x1, y1 = x0 + cs, y0 + cs
            rect = [(x0 * S, y0 * S), (x1 * S, y1 * S)]
            if p > threshold:
                d.rectangle(rect, fill=fill_color, outline=hexrgb('#FFFFFF', 160), width=2)
            else:
                d.rectangle(rect, outline=outline, width=2)


# ── 鳥のパーツ(共通・形と色は不変) ──────────────────────────────
_scale = 0.86
_pivot = (50.0, 54.0)


def T(x, y):
    px, py = _pivot
    return px + (x - px) * _scale, py + (y - py) * _scale


def P(*xy):
    return [tuple(v * S for v in T(x, y)) for x, y in xy]


def box(x, y, w, h):
    x0, y0 = T(x, y)
    x1, y1 = T(x + w, y + h)
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def circle(d, cx, cy, r, color):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), fill=color)


def line(d, pts, color, w, joint='curve'):
    lw = w * _scale
    d.line(P(*pts), fill=color, width=max(1, int(round(lw * S))), joint=joint)
    for x, y in pts:
        circle(d, x, y, w / 2, color)


def bird_full(d):
    d.polygon(P((55, 72), (84, 86), (82, 93), (52, 81)), fill='#3A3A3C')       # 尾
    for fx in (45, 55):
        line(d, [(fx, 82), (fx, 90)], '#FF9500', 2)
        line(d, [(fx - 3, 91), (fx, 90), (fx + 3, 91)], '#FF9500', 2)
    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')                              # 体
    d.ellipse(box(61, 44, 18, 32), fill='#D8D8DC')                              # 翼
    circle(d, 42, 48, 3, '#1C1C1E')
    circle(d, 58, 48, 3, '#1C1C1E')
    d.polygon(P((47, 54), (53, 54), (50, 60)), fill='#FF9500')
    circle(d, 36, 56, 3.5, (255, 150, 170, 115))
    circle(d, 64, 56, 3.5, (255, 150, 170, 115))


PALETTES = {
    'soft_pink': {'bg': '#FCE7EC', 'fill': '#E39CAA'},
    'mint': {'bg': '#E3F6E6', 'fill': '#7FB88A'},
}

PATTERNS = ['bottom_up', 'diagonal', 'left_right']


def draw(pattern, pal_key, size=OUT, n=GRID_N):
    pal = PALETTES[pal_key]
    img = Image.new('RGBA', (OUT * SS, OUT * SS), hexrgb(pal['bg']))
    d = ImageDraw.Draw(img, 'RGBA')
    draw_grid(d, pattern, pal['bg'], pal['fill'], n=n)
    bird_full(d)
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v3')
    os.makedirs(outdir, exist_ok=True)
    for pattern in PATTERNS:
        for pal_key in PALETTES:
            name = f'{pattern}_{pal_key}'
            draw(pattern, pal_key, OUT).save(os.path.join(outdir, f'{name}_1024.png'))
            draw(pattern, pal_key, 60).save(os.path.join(outdir, f'{name}_60.png'))
            print(name)
