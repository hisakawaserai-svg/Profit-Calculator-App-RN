"""うりつみ アプリアイコン生成スクリプト(これが唯一の正)。

アイコンを調整するときはこのファイルだけを編集する。
過去の案出しスクリプトは archive/ に置いてあるが、参照専用。

    python3 gen_uritsumi_icon.py            # プレビューを out/ に生成
    python3 gen_uritsumi_icon.py --install  # app-rn/assets/images/ へ書き出し

── 確定仕様 ──────────────────────────────────────────
前景 : 金貨を運ぶシマエナガ。造形と色は app-rn/src/components/onboarding/
       BirdMascot.tsx を正とし、座標をそのまま流用する
顔   : 左上を向く(時計回り +11 度)。目は `>` `<` の閉じ目
左足 : 前へ踏み出して浮かせる。足首の角度は右足と揃える
翼   : 体の上に描く。丸いオーバルで金貨を下から支える
金貨 : 500 円玉のような二層 + ¥ を +12 度傾ける(顔と同じ向き)
背景 : 55 度の斜めグラデーション + 白い帯(alpha 40)
配色 : night(濃紺)。periwinkle / teal も比較用に出せる

── Android アダプティブアイコン ──────────────────────
Android は前景が円やスクワークルで切り抜かれる。108dp のうち中央 66dp の
円だけが全マスクで確実に残るため、前景は透過 PNG にしたうえでその円に
収まるまで縮小する。縮小率は絵の実際の広がりから毎回計算するので、
デザインを変えても安全側に追従する(前作の ADAPTIVE_SCENE=0.66 相当の役割)。
"""
import argparse
import math
import os
from PIL import Image, ImageColor, ImageDraw

# ── キャンバス ────────────────────────────────────────
OUT = 1024
SS = 4                      # スーパーサンプリング倍率
CANVAS = OUT * SS
S = CANVAS / 100.0          # 100 基準座標 → ピクセル

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.abspath(os.path.join(HERE, '..', '..', 'assets', 'images'))

# ── 確定パラメータ ────────────────────────────────────
GRAD_ANGLE = 55
BAND_ALPHA = 40
YEN_ROT = 12.0

THEMES = {
    'night': ('#5A6592', '#343D63'),
    'periwinkle': ('#6169AE', '#3B4187'),
    'teal': ('#3F8A85', '#22615F'),
}
DEFAULT_THEME = 'night'

# Android の adaptiveIcon.backgroundColor に使う単色。
# アダプティブアイコンの背景はグラデーションを持てないので、night の
# グラデーション(#5A6592→#343D63)の中間色を単色として置く。
ANDROID_BG_COLOR = '#47517A'

# 108dp 中 66dp の円 = 全マスクで確実に残る範囲。半径は canvas 比で 0.3056。
ADAPTIVE_SAFE_R = (66.0 / 108.0) / 2.0
# 円マスク(72dp)の半径。ここを超えると円形ランチャーで欠ける。
ADAPTIVE_MASK_R = (72.0 / 108.0) / 2.0

# 鳥の 100 基準 → アイコン配置(その場で縮小して右下へ)
_scale = 0.78
_pivot = (50.0, 54.0)
_offset = (18.0, 10.0)

# 顔の向き(左上を向かせる)
FACE_ROT = 11.0
FACE_DX = -4.0
FACE_DY = -2.0

COIN_C, COIN_R = (33.0, 38.0), 29.0
COIN_EDGE, COIN_FACE, COIN_MARK = '#F6C748', '#FFDA6E', '#E0A522'
WING_REL, WING_A, WING_B = (-25.6, 8.3), 14.4, 7.8

# ほっぺ。BirdMascot.tsx は rgba(255,150,170,0.45) だが、ここでは白い体に
# 重ねた結果の色を不透明で置く。ImageDraw の 'RGBA' モードは fill のアルファを
# 合成せず置き換えるため、半透明のまま描くと体に穴が開き、透過前景を濃色背景に
# 重ねる Android 側だけ紫に濁ってしまう。
CHEEK = '#FFD0D9'


# ── 座標変換 ──────────────────────────────────────────

def T(x, y):
    """BirdMascot の 100 基準座標 → アイコン上の 100 基準座標。"""
    px, py = _pivot
    return (px + (x - px) * _scale + _offset[0],
            py + (y - py) * _scale + _offset[1])


def B(dx, dy):
    """体の中心からの相対位置 → アイコン座標。鳥の縮尺に追従する。"""
    cx, cy = T(*_pivot)
    return cx + dx * _scale, cy + dy * _scale


def F(x, y):
    """顔パーツを「左上を向く」向きに回してから T する。"""
    a = math.radians(FACE_ROT)
    px, py = _pivot
    dx, dy = x - px, y - py
    return T(px + dx * math.cos(a) - dy * math.sin(a) + FACE_DX,
             py + dx * math.sin(a) + dy * math.cos(a) + FACE_DY)


# ── 描画プリミティブ(すべてアイコン 100 基準座標で受ける) ──

def _px(pts):
    return [(x * S, y * S) for x, y in pts]


def circle(d, cx, cy, r, color):
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=color)


def stroke(d, pts, color, w):
    """丸端の線。"""
    d.line(_px(pts), fill=color, width=max(1, int(round(w * S))), joint='curve')
    for x, y in pts:
        circle(d, x, y, w / 2, color)


def oval(d, cx, cy, a, b, toward, color):
    """長軸 a を toward の向きへ向けたオーバル。"""
    ux, uy = toward[0] - cx, toward[1] - cy
    n = math.hypot(ux, uy) or 1.0
    ux, uy = ux / n, uy / n
    vx, vy = -uy, ux
    d.polygon(_px([(cx + ux * a * math.cos(t) + vx * b * math.sin(t),
                    cy + uy * a * math.cos(t) + vy * b * math.sin(t))
                   for t in (2 * math.pi * i / 72 for i in range(72))]), color)


# ── 部品 ──────────────────────────────────────────────

def draw_coin(d):
    cx, cy, r = COIN_C[0], COIN_C[1], COIN_R
    circle(d, cx, cy, r, COIN_EDGE)
    circle(d, cx, cy, r * 0.78, COIN_FACE)

    a = math.radians(YEN_ROT)

    def R(px, py):
        dx, dy = px - cx, py - cy
        return (cx + dx * math.cos(a) - dy * math.sin(a),
                cy + dx * math.sin(a) + dy * math.cos(a))

    w = r * 0.13
    for seg in ([(cx - r * 0.34, cy - r * 0.40), (cx, cy + r * 0.02)],
                [(cx + r * 0.34, cy - r * 0.40), (cx, cy + r * 0.02)],
                [(cx, cy - r * 0.02), (cx, cy + r * 0.46)],
                [(cx - r * 0.28, cy + r * 0.14), (cx + r * 0.28, cy + r * 0.14)],
                [(cx - r * 0.28, cy + r * 0.31), (cx + r * 0.28, cy + r * 0.31)]):
        stroke(d, [R(*p) for p in seg], COIN_MARK, w)


def draw_foot(d, hip, tip, w=2.0):
    """脚1本。指は脚の向きを基準に開くので、傾けても足首の角度が揃う。"""
    h, t = T(*hip), T(*tip)
    sw = w * _scale
    stroke(d, [h, t], '#FF9500', sw)
    ux, uy = t[0] - h[0], t[1] - h[1]
    n = math.hypot(ux, uy) or 1.0
    ux, uy = ux / n, uy / n
    px, py = -uy, ux
    r = 3 * _scale
    stroke(d, [(t[0] - px * r + ux * _scale, t[1] - py * r + uy * _scale), t,
               (t[0] + px * r + ux * _scale, t[1] + py * r + uy * _scale)],
           '#FF9500', sw)


def draw_eye(d, cx, cy, s, mirror):
    """`>` `<` の閉じ目。内側に尖る。"""
    m = -1 if mirror else 1
    stroke(d, [F(cx - m * s, cy - s * 0.75),
               F(cx + m * s * 0.55, cy),
               F(cx - m * s, cy + s * 0.75)], '#1C1C1E', 2.0 * _scale)


def draw_sweat(d, rel, size, toward):
    cx, cy = B(*rel)
    size *= _scale
    ux, uy = toward[0] - cx, toward[1] - cy
    n = math.hypot(ux, uy) or 1.0
    ux, uy = ux / n, uy / n
    px, py = -uy, ux
    r = size * 0.52
    bx, by = cx - ux * size * 0.25, cy - uy * size * 0.25
    d.polygon(_px([(cx + ux * size, cy + uy * size),
                   (bx + px * r, by + py * r), (bx - px * r, by - py * r)]), '#8FCBEA')
    circle(d, bx, by, r, '#8FCBEA')


def draw_foreground(d):
    """金貨を運ぶシマエナガ。描画順は BirdMascot と同じ(尾→足→体→翼→顔)。"""
    draw_coin(d)

    d.polygon(_px([T(55, 72), T(84, 86), T(82, 93), T(52, 81)]), '#3A3A3C')

    draw_foot(d, (41, 82), (34, 86))     # 左足: 前へ踏み出して浮かせる
    draw_foot(d, (55, 82), (55, 90))     # 右足: 軸足

    bx0, by0 = T(21, 23)
    bx1, by1 = T(79, 85)
    d.ellipse([bx0 * S, by0 * S, bx1 * S, by1 * S], fill='#FFFFFF')

    # 翼は体の上。狙いは金貨の中心ではなく右下寄りで、寝た角度で下から支える
    oval(d, *B(*WING_REL), WING_A * _scale, WING_B * _scale,
         toward=(COIN_C[0] - 3, COIN_C[1] + 22), color='#D8D8DC')

    draw_eye(d, 42, 48, 3.0, mirror=False)
    draw_eye(d, 58, 48, 3.0, mirror=True)
    d.polygon(_px([F(47, 54), F(53, 54), F(50, 60)]), '#FF9500')
    circle(d, *F(36, 56), 3.5 * _scale, CHEEK)
    circle(d, *F(64, 56), 3.5 * _scale, CHEEK)

    head = T(*_pivot)
    draw_sweat(d, (22.2, -32.2), 5.33, head)
    draw_sweat(d, (28.3, -22.8), 3.78, head)


# ── 背景 ──────────────────────────────────────────────

def _lerp(c0, c1, t):
    a, b = ImageColor.getrgb(c0), ImageColor.getrgb(c1)
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_background(img, d, theme):
    """斜めグラデーション + 白い帯。

    帯は ImageDraw ではなく別レイヤーで合成する。ImageDraw の 'RGBA' モードは
    fill のアルファを合成せず置き換えるため、直接描くと不透明の白になる。
    """
    c0, c1 = THEMES[theme]
    a = math.radians(GRAD_ANGLE)
    ux, uy = math.cos(a), math.sin(a)
    px, py = -uy, ux
    span = 100.0 * (abs(ux) + abs(uy))
    steps = 256
    for i in range(steps):
        d0 = (i / steps - 0.5) * span
        d1 = ((i + 1.4) / steps - 0.5) * span      # わずかに重ねて継ぎ目を消す
        d.polygon(_px([(50 + ux * d0 + px * 100, 50 + uy * d0 + py * 100),
                       (50 + ux * d0 - px * 100, 50 + uy * d0 - py * 100),
                       (50 + ux * d1 - px * 100, 50 + uy * d1 - py * 100),
                       (50 + ux * d1 + px * 100, 50 + uy * d1 + py * 100)]),
                  _lerp(c0, c1, i / (steps - 1)))

    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).polygon(
        _px([(0, 22), (100, -10), (100, 34), (0, 66)]), (255, 255, 255, BAND_ALPHA))
    img.alpha_composite(ov)


# ── レンダリング ──────────────────────────────────────

def render(theme=DEFAULT_THEME, size=OUT, background=True):
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    if background:
        draw_background(img, d, theme)
        d = ImageDraw.Draw(img, 'RGBA')
    draw_foreground(d)
    img = img.resize((size, size), Image.LANCZOS)
    return img.convert('RGB') if background else img


def content_radius(img):
    """中心から絵の最も遠い不透明ピクセルまでの距離(キャンバス比)。"""
    a = img.getchannel('A').resize((256, 256), Image.BILINEAR)
    px = a.load()
    c = 127.5
    best = 0.0
    for y in range(256):
        for x in range(256):
            if px[x, y] > 8:
                best = max(best, math.hypot(x - c, y - c))
    return best / 256.0


def adaptive_scale():
    """Android 前景の縮小率。絵の広がりから安全側に計算する。"""
    return ADAPTIVE_SAFE_R / content_radius(render(size=OUT, background=False))


def render_adaptive_foreground(size=OUT, k=None):
    """Android adaptiveIcon 用の透過前景。中央 66dp の円に収める。"""
    fg = render(size=size, background=False)
    k = adaptive_scale() if k is None else k
    inner = max(1, int(round(size * k)))
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    off = (size - inner) // 2
    out.paste(fg.resize((inner, inner), Image.LANCZOS), (off, off))
    return out


def render_adaptive_background(theme=DEFAULT_THEME, size=OUT):
    """Android adaptiveIcon 用の背景画像。

    backgroundColor では単色しか置けず、グラデーションと帯が失われる。
    背景は前景と違ってマスクで切られる前提の全面絵なのでセーフゾーンは不要。
    """
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    draw_background(img, ImageDraw.Draw(img, 'RGBA'), theme)
    return img.resize((size, size), Image.LANCZOS).convert('RGB')


# ── 検証 ──────────────────────────────────────────────

def mask_preview(size=512):
    """Android の各マスクで欠けが出ないかを目視するための並び画像。"""
    fg = render_adaptive_foreground(size)
    bg = render_adaptive_background(size=size).convert('RGBA')
    full = Image.alpha_composite(bg, fg)

    def masked(shape):
        m = Image.new('L', (size, size), 0)
        md = ImageDraw.Draw(m)
        if shape == 'circle72':
            r = size * ADAPTIVE_MASK_R
            md.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r], fill=255)
        elif shape == 'circle66':
            r = size * ADAPTIVE_SAFE_R
            md.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r], fill=255)
        else:                                    # スクワークル(角丸正方形)
            h = size * ADAPTIVE_MASK_R
            md.rounded_rectangle([size / 2 - h, size / 2 - h, size / 2 + h, size / 2 + h],
                                 radius=h * 0.45, fill=255)
        out = Image.new('RGBA', (size, size), (255, 255, 255, 255))
        out.paste(full, (0, 0), m)
        return out.convert('RGB')

    shapes = ['circle72', 'circle66', 'squircle']
    pad = 12
    sheet = Image.new('RGB', (len(shapes) * (size + pad) + pad, size + pad * 2), '#FFFFFF')
    for i, s in enumerate(shapes):
        sheet.paste(masked(s), (pad + i * (size + pad), pad))
    return sheet


# ── 書き出し ──────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--install', action='store_true',
                    help='app-rn/assets/images/ へ本番アセットを書き出す')
    ap.add_argument('--theme', default=DEFAULT_THEME, choices=list(THEMES))
    args = ap.parse_args()

    k = adaptive_scale()
    print(f'adaptive scale = {k:.3f} '
          f'(絵の広がり {content_radius(render(size=OUT, background=False)):.3f} → '
          f'安全円 {ADAPTIVE_SAFE_R:.3f})')

    outdir = os.path.join(HERE, 'out')
    os.makedirs(outdir, exist_ok=True)
    render(args.theme, 1024).save(os.path.join(outdir, f'preview_{args.theme}_1024.png'))
    render(args.theme, 60).save(os.path.join(outdir, f'preview_{args.theme}_60.png'))
    render_adaptive_foreground(1024, k).save(os.path.join(outdir, 'preview_adaptive_fg.png'))
    mask_preview().save(os.path.join(outdir, 'preview_android_masks.png'))
    print('preview →', outdir)

    if args.install:
        os.makedirs(ASSETS, exist_ok=True)
        icon = os.path.join(ASSETS, 'icon.png')
        fg = os.path.join(ASSETS, 'android-icon-foreground.png')
        bg = os.path.join(ASSETS, 'android-icon-background.png')
        render(args.theme, 1024).save(icon)
        render_adaptive_foreground(1024, k).save(fg)
        render_adaptive_background(args.theme, 1024).save(bg)
        for p_ in (icon, fg, bg):
            print('install →', p_)
        print(f'backgroundColor(背景画像が使えない場合の下地): {ANDROID_BG_COLOR}')


if __name__ == '__main__':
    main()
