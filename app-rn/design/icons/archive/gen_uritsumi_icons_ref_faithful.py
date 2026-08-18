"""ユーザーが送付した参考イラスト(コインを抱えて冷や汗の鳥)の忠実な再現。

元絵の構造:
  - 鳥は左へ傾いてコインを持ち上げながら歩くポーズ(体ごと回転)
  - 翼は体の左側から上へ伸び、先端が3枚の羽根に分かれてコイン下端に重なる
  - 目は `>` `<` の閉じ目、くちばしは上下二色のひし形
  - 汗はグレーで飛沫2滴+涙型1滴、震え線は縦の波線
  - コインは¥マーク+細い内リング+右縁のみのギザ(厚み)
"""
import math
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
CANVAS = OUT * SS
S = CANVAS / 100.0


def box(x, y, w, h):
    return [x * S, y * S, (x + w) * S, (y + h) * S]


def circle(d, cx, cy, r, color):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), fill=color)


def ring(d, cx, cy, r, color, w):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), outline=color, width=max(1, int(round(w * S))))


def P(*xy):
    return [(x * S, y * S) for x, y in xy]


def line(d, pts, color, w, joint='curve'):
    d.line(P(*pts), fill=color, width=max(1, int(round(w * S))), joint=joint)
    for x, y in pts:
        circle(d, x, y, w / 2, color)


def sparkle(d, cx, cy, r, color='#D9A733'):
    w = r * 0.30
    d.polygon(P((cx, cy - r), (cx + w, cy - w), (cx + r, cy), (cx + w, cy + w),
                (cx, cy + r), (cx - w, cy + w), (cx - r, cy), (cx - w, cy - w)), fill=color)


def squiggle(d, cx, cy, h, color='#ABAEB8', amp=0.8, waves=2.0, w=0.8):
    """縦の波線(震え線)。"""
    pts = []
    n = 24
    for i in range(n + 1):
        t = i / n
        pts.append((cx + amp * math.sin(t * waves * 2 * math.pi), cy - h / 2 + h * t))
    line(d, pts, color, w)


def drop(d, cx, cy, s, ang_deg, color='#9EA0AC'):
    """しずく。ang_deg の向きに尖る(-90で真上)。"""
    a = math.radians(ang_deg)
    ux, uy = math.cos(a), math.sin(a)
    px, py = -uy, ux
    r = s * 0.52
    ccx, ccy = cx - ux * s * 0.25, cy - uy * s * 0.25
    tip = (cx + ux * s, cy + uy * s)
    d.polygon(P(tip, (ccx + px * r, ccy + py * r), (ccx - px * r, ccy - py * r)), fill=color)
    circle(d, ccx, ccy, r, color)


def yen_mark(d, cx, cy, r, color):
    lw = r * 0.20
    line(d, [(cx - r * 0.55, cy - r * 0.62), (cx, cy - r * 0.05)], color, lw)
    line(d, [(cx + r * 0.55, cy - r * 0.62), (cx, cy - r * 0.05)], color, lw)
    line(d, [(cx, cy - r * 0.1), (cx, cy + r * 0.7)], color, lw)
    line(d, [(cx - r * 0.52, cy + r * 0.14), (cx + r * 0.52, cy + r * 0.14)], color, lw * 0.8)
    line(d, [(cx - r * 0.52, cy + r * 0.40), (cx + r * 0.52, cy + r * 0.40)], color, lw * 0.8)


def coin(d, cx, cy, r):
    # 側面(右にわずかにずらした濃色)で厚み
    circle(d, cx + 1.0, cy + 0.3, r, '#DFA92E')
    # 面
    circle(d, cx, cy, r, '#F6C748')
    # 内リング
    ring(d, cx, cy, r * 0.79, '#E3AC33', 0.45)
    # 右縁のみのギザ(縁の上に乗せ、はみ出させない)
    for deg in range(-32, 88, 6):
        a = math.radians(deg)
        x0, y0 = cx + r * 0.95 * math.cos(a), cy + r * 0.95 * math.sin(a)
        x1, y1 = cx + r * 1.005 * math.cos(a), cy + r * 1.005 * math.sin(a)
        line(d, [(x0, y0), (x1, y1)], '#BC8A1E', 0.5)
    yen_mark(d, cx, cy, r * 0.45, '#C7982A')


# ── 鳥(専用レイヤーに直立で描き、レイヤーごと回転して傾ける) ──────────

BODY_C = (60.0, 61.0)


def draw_bird(d):
    # 先端の羽根3枚(コインに重なる。腕より先に描き、根元を腕で覆う)
    wrist = (47.2, 52.4)
    for tip in ((40.8, 47.8), (44.4, 44.6), (49.2, 45.4)):
        vx, vy = tip[0] - wrist[0], tip[1] - wrist[1]
        n = math.hypot(vx, vy)
        px, py = -vy / n, vx / n
        d.polygon(
            P(tip, (wrist[0] + px * 1.8, wrist[1] + py * 1.8),
              (wrist[0] - px * 1.8, wrist[1] - py * 1.8)),
            fill='#A2A4B0',
        )
        circle(d, tip[0], tip[1], 0.9, '#A2A4B0')
    circle(d, wrist[0], wrist[1], 1.8, '#A2A4B0')

    # 翼の腕(体の左縁に沿って上へ。体の下に潜る部分は body が上書き)
    d.polygon(
        P((55, 67.5), (48.2, 60.5), (45.3, 55.5), (44.4, 51.8), (48.6, 50.2),
          (50.4, 54.0), (53.2, 58.5), (58.0, 64.5)),
        fill='#CBCED6',
    )

    # 尾(体の右下に覗く)
    d.polygon(P((69.5, 66.5), (75.8, 68.2), (72.6, 72.8)), fill='#CBCED6')

    # 足(歩き姿勢: 左前・右後ろ)
    line(d, [(53.5, 72), (51.0, 76.3)], '#F79E1B', 1.5)
    line(d, [(48.9, 77.4), (51.0, 76.3), (52.9, 77.3)], '#F79E1B', 1.4)
    line(d, [(63.5, 72), (65.3, 76.2)], '#F79E1B', 1.5)
    line(d, [(63.6, 77.4), (65.3, 76.2), (67.3, 77.2)], '#F79E1B', 1.4)

    # 体
    d.ellipse(box(BODY_C[0] - 12.3, BODY_C[1] - 12.3, 24.6, 24.6), fill='#FFFFFF')

    # ほっぺ
    circle(d, 53.2, 61.2, 2.3, '#F8A9BF')
    circle(d, 63.7, 62.2, 2.3, '#F8A9BF')

    # 目 `>` `<` (内側に尖る閉じ目。太め・丸キャップ)
    line(d, [(54.2, 56.4), (56.1, 57.7), (54.2, 59.0)], '#2A2A2E', 1.9)
    line(d, [(64.0, 56.4), (62.1, 57.7), (64.0, 59.0)], '#2A2A2E', 1.9)

    # くちばし(上下二色のひし形)
    d.polygon(P((59.1, 57.9), (61.3, 59.6), (56.9, 59.6)), fill='#EE7A1F')
    d.polygon(P((56.9, 59.6), (61.3, 59.6), (59.1, 61.3)), fill='#F9B23C')


def draw_all():
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')

    # 背景
    d.rectangle([(0, 0), (CANVAS, CANVAS)], fill='#FACFD4')

    # 足元の影
    d.ellipse(box(57.5 - 18.5, 75.8 - 3, 37, 6), fill='#F3A8BA')

    # きらきら4つ
    sparkle(d, 27.8, 25.4, 2.8)
    sparkle(d, 52.8, 21.6, 3.3)
    sparkle(d, 61.5, 30.1, 2.2)
    sparkle(d, 21.8, 36.9, 1.9)

    # コイン
    coin(d, 42, 41, 15.3)

    # 鳥レイヤー(直立で描いて 10° 左へ傾ける)
    bird = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bird, 'RGBA')
    draw_bird(bd)
    bird = bird.rotate(10, resample=Image.BICUBIC,
                       center=(BODY_C[0] * S, BODY_C[1] * S))
    img.alpha_composite(bird)

    # 汗(飛沫2滴+涙型1滴)と震え線は回転させず上から
    d = ImageDraw.Draw(img, 'RGBA')
    drop(d, 74.3, 50.2, 2.6, -60)
    drop(d, 77.2, 53.4, 2.2, -45)
    drop(d, 75.8, 58.6, 3.4, -90)
    squiggle(d, 45.4, 66.5, 6.0, amp=0.6, waves=1.5)
    squiggle(d, 47.5, 68.2, 5.2, amp=0.6, waves=1.5)
    squiggle(d, 76.2, 66.5, 6.0, amp=0.6, waves=1.5)
    squiggle(d, 78.2, 68.2, 5.2, amp=0.6, waves=1.5)

    return img


def draw(size=OUT):
    return draw_all().convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_ref')
    os.makedirs(outdir, exist_ok=True)
    draw(OUT).save(os.path.join(outdir, 'ref_faithful_1024.png'))
    draw(60).save(os.path.join(outdir, 'ref_faithful_60.png'))
    print('done')
