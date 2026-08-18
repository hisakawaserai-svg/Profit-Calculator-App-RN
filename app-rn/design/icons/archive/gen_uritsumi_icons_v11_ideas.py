"""うりつみ アプリアイコン 案出し v11: 「2つの丸が並ぶ」構図からの脱却。

v10 の課題:
  金貨とシマエナガが同程度の大きさの丸として横に並び、互いに主張して
  ひとつの形に見えない。かつ最大面積の金貨が二重丸だけで中身が空。

3案とも「金貨と鳥をひとつのシルエットに統合する」ことを狙う。
  carry : 体の前で金貨を抱えて運ぶ(重なりで一体化)
  stack : 積み上がった金貨の山に一枚足す(=記録・積み上げの物語)
  hug   : 金貨を主役に、鳥が後ろから抱きつく(顔は上に出す)

キャラクターの造形・色は BirdMascot.tsx を正とする。
"""
import math
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
CANVAS = OUT * SS
S = CANVAS / 100.0

BG = '#FBD0D5'
COIN_EDGE = '#F0B93A'
COIN_FACE = '#FFDA6E'
COIN_MARK = '#E0A522'

# 鳥の 100 基準 → 最終座標。set_bird() で倍率と中心を決める。
_T = (1.0, 50.0, 54.0)
BODY_C = (50.0, 54.0)


def set_bird(scale, cx, cy):
    global _T
    _T = (scale, cx, cy)


def T(x, y):
    s, cx, cy = _T
    return cx + (x - BODY_C[0]) * s, cy + (y - BODY_C[1]) * s


# ── 最終座標で描くプリミティブ ──────────────────────────

def C(d, cx, cy, r, color):
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill=color)


def POLY(d, pts, color):
    d.polygon([(x * S, y * S) for x, y in pts], fill=color)


def L(d, pts, color, w):
    d.line([(x * S, y * S) for x, y in pts], fill=color,
           width=max(1, int(round(w * S))), joint='curve')
    for x, y in pts:
        C(d, x, y, w / 2, color)


def OVAL(d, cx, cy, a, b, toward, color):
    """長軸 a を toward の向きに向けたオーバル(最終座標)。"""
    ux, uy = toward[0] - cx, toward[1] - cy
    n = math.hypot(ux, uy) or 1.0
    ux, uy = ux / n, uy / n
    vx, vy = -uy, ux
    pts = []
    for i in range(72):
        t = 2 * math.pi * i / 72
        pts.append(((cx + ux * a * math.cos(t) + vx * b * math.sin(t)) * S,
                    (cy + uy * a * math.cos(t) + vy * b * math.sin(t)) * S))
    d.polygon(pts, fill=color)


# ── 金貨 ──────────────────────────────────────────────

def coin(d, cx, cy, r, mark=True):
    C(d, cx, cy, r, COIN_EDGE)
    C(d, cx, cy, r * 0.78, COIN_FACE)
    if mark:
        w = r * 0.15
        L(d, [(cx - r * 0.36, cy - r * 0.42), (cx, cy + r * 0.02)], COIN_MARK, w)
        L(d, [(cx + r * 0.36, cy - r * 0.42), (cx, cy + r * 0.02)], COIN_MARK, w)
        L(d, [(cx, cy - r * 0.02), (cx, cy + r * 0.48)], COIN_MARK, w)
        L(d, [(cx - r * 0.3, cy + r * 0.14), (cx + r * 0.3, cy + r * 0.14)], COIN_MARK, w)
        L(d, [(cx - r * 0.3, cy + r * 0.32), (cx + r * 0.3, cy + r * 0.32)], COIN_MARK, w)


# ── 鳥のパーツ(BirdMascot 準拠) ───────────────────────

def bird_tail(d):
    POLY(d, [T(55, 72), T(84, 86), T(82, 93), T(52, 81)], '#3A3A3C')


def bird_body(d):
    s = _T[0]
    cx, cy = T(50, 54)
    d.ellipse([(cx - 29 * s) * S, (cy - 31 * s) * S,
               (cx + 29 * s) * S, (cy + 31 * s) * S], fill='#FFFFFF')


def bird_foot(d, hip, tip, w=2.0):
    s = _T[0]
    h, t = T(*hip), T(*tip)
    L(d, [h, t], '#FF9500', w * s)
    ux, uy = t[0] - h[0], t[1] - h[1]
    n = math.hypot(ux, uy) or 1.0
    ux, uy = ux / n, uy / n
    px, py = -uy, ux
    r = 3 * s
    L(d, [(t[0] - px * r + ux * s, t[1] - py * r + uy * s), t,
          (t[0] + px * r + ux * s, t[1] + py * r + uy * s)], '#FF9500', w * s)


def bird_face(d, rot=11.0, dx=-4.0, dy=-2.0, eye_s=3.0):
    """顔一式。rot/dx/dy で向きを付ける(100基準で回転してから T)。"""
    a = math.radians(rot)

    def Fp(x, y):
        ox, oy = x - BODY_C[0], y - BODY_C[1]
        rx = ox * math.cos(a) - oy * math.sin(a)
        ry = ox * math.sin(a) + oy * math.cos(a)
        return T(BODY_C[0] + rx + dx, BODY_C[1] + ry + dy)

    s = _T[0]
    for cx0, mirror in ((42, False), (58, True)):
        m = -1 if mirror else 1
        L(d, [Fp(cx0 - m * eye_s, 48 - eye_s * 0.75),
              Fp(cx0 + m * eye_s * 0.55, 48),
              Fp(cx0 - m * eye_s, 48 + eye_s * 0.75)], '#1C1C1E', 2.0 * s)
    POLY(d, [Fp(47, 54), Fp(53, 54), Fp(50, 60)], '#FF9500')
    C(d, *Fp(36, 56), 3.5 * s, (255, 150, 170, 115))
    C(d, *Fp(64, 56), 3.5 * s, (255, 150, 170, 115))


def bird_wing(d, rel, toward, a=14.4, b=7.8):
    """翼。rel は体中心からの相対(100基準)、toward は最終座標の狙い先。"""
    s = _T[0]
    cx, cy = T(50, 54)
    OVAL(d, cx + rel[0] * s, cy + rel[1] * s, a * s, b * s, toward, '#D8D8DC')


def sweat(d, rel, s_, toward):
    s = _T[0]
    bx, by = T(50, 54)
    cx, cy = bx + rel[0] * s, by + rel[1] * s
    ux, uy = toward[0] - cx, toward[1] - cy
    n = math.hypot(ux, uy) or 1.0
    ux, uy = ux / n, uy / n
    px, py = -uy, ux
    size = s_ * s
    r = size * 0.52
    ox, oy = cx - ux * size * 0.25, cy - uy * size * 0.25
    POLY(d, [(cx + ux * size, cy + uy * size),
             (ox + px * r, oy + py * r), (ox - px * r, oy - py * r)], '#8FCBEA')
    C(d, ox, oy, r, '#8FCBEA')


# ── 案 ────────────────────────────────────────────────

def v_carry(d):
    """体の前で金貨を抱えて運ぶ。金貨が体に重なり、輪郭がひとつながりになる。"""
    d.rectangle([(0, 0), (CANVAS, CANVAS)], fill=BG)
    set_bird(0.92, 56, 46)
    bird_tail(d)
    bird_foot(d, (45, 82), (38, 88))
    bird_foot(d, (57, 82), (58, 90))
    bird_body(d)
    bird_face(d, rot=9, dy=-3)
    # 金貨は体の下半分に重ねて持つ
    coin(d, 44, 74, 22)
    # 翼は片方だけ。体から生えて金貨の左縁に回り込む(参考イラストと同じ持ち方)
    bird_wing(d, (-24, 14), toward=(26, 80), a=14, b=7)
    sweat(d, (24, -30), 5.0, toward=T(50, 54))
    sweat(d, (30, -21), 3.6, toward=T(50, 54))


def v_stack(d):
    """積み上がった金貨に一枚足す。「記録して積み上げる」物語。"""
    d.rectangle([(0, 0), (CANVAS, CANVAS)], fill=BG)
    set_bird(0.66, 70, 60)
    bird_tail(d)
    bird_foot(d, (45, 82), (44, 90))
    bird_foot(d, (57, 82), (58, 90))
    bird_body(d)
    bird_face(d, rot=13, dx=-6, dy=-2)
    # 山: 下から3枚(少しずつずらして重ねる)
    coin(d, 33, 84, 19, mark=False)
    coin(d, 30, 68, 19, mark=False)
    coin(d, 34, 52, 19)
    # 一枚を翼で持ち上げて上に乗せるところ(根元は体の左、先は最上段の金貨へ)
    bird_wing(d, (-26, -2), toward=(40, 50), a=15, b=7)
    sweat(d, (26, -28), 5.0, toward=T(50, 54))
    sweat(d, (33, -19), 3.6, toward=T(50, 54))


def v_hug(d):
    """金貨を主役にして、鳥が後ろから抱きつく。顔は金貨の上に出す。"""
    d.rectangle([(0, 0), (CANVAS, CANVAS)], fill=BG)
    set_bird(0.86, 52, 36)
    bird_tail(d)
    bird_foot(d, (45, 82), (43, 90))
    bird_foot(d, (57, 82), (59, 90))
    bird_body(d)
    bird_face(d, rot=0, dx=0, dy=-4)
    # 金貨を体の前(下半分)に大きく重ねる
    coin(d, 51, 71, 26)
    # 翼で左右から抱える(根元は体、先は金貨の下側へ回り込ませる)
    bird_wing(d, (-26, 32), toward=(36, 86), a=13, b=6.5)
    bird_wing(d, (26, 32), toward=(66, 86), a=13, b=6.5)
    sweat(d, (26, -22), 5.0, toward=T(50, 54))
    sweat(d, (32, -13), 3.6, toward=T(50, 54))


VARIANTS = {'carry': v_carry, 'stack': v_stack, 'hug': v_hug}


def render(name, size=OUT):
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    VARIANTS[name](ImageDraw.Draw(img, 'RGBA'))
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v11')
    os.makedirs(outdir, exist_ok=True)
    sheet = Image.new('RGB', (3 * 360 + 40, 360 + 90 + 30), '#FFFFFF')
    for i, name in enumerate(VARIANTS):
        big = render(name, OUT)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = render(name, 60)
        small.save(os.path.join(outdir, f'{name}_60.png'))
        sheet.paste(big.resize((340, 340), Image.LANCZOS), (10 + i * 360, 10))
        sheet.paste(small.resize((60, 60), Image.NEAREST), (10 + i * 360 + 140, 370))
        print(name, 'ok')
    sheet.save(os.path.join(outdir, 'contact_sheet_v11.png'))
