"""うりつみ アプリアイコン: BirdMascot.tsx(オンボーディングのシマエナガ)を正とし、
参考イラストの構図(コインを翼で支えて冷や汗)だけを借りた版。

キャラクターの形・色は BirdMascot.tsx の座標・カラーをそのまま使う:
  体   : Oval(21,23,58,62) #FFFFFF
  目   : (42,48)(58,48) r3 #1C1C1E の黒丸
  くちばし: 三角形 (47,54)(53,54)(50,60) #FF9500
  ほっぺ : (36,56)(64,56) r3.5 rgba(255,150,170,0.45)
  翼   : 丸いオーバル #D8D8DC (向きだけコインへ持ち上げる)
  尾   : (55,72)(84,86)(82,93)(52,81) #3A3A3C
  足   : x=45,55 #FF9500

アイコン向けの構成(過去指示分):
  - コインは左上・鳥は右下、2要素で画面の8割。端は切れてよい
  - 完全フラット(影・コインの厚み・震え線・きらきら・¥マークなし)
  - 要素は 鳥・無地の金貨・汗2滴 のみ
"""
import math
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
CANVAS = OUT * SS
S = CANVAS / 100.0

# BirdMascot 100基準 → アイコン配置への変換(その場で縮小して右下へ)
_scale = 0.78
_pivot = (50.0, 54.0)   # 体の中心
_offset = (18.0, 10.0)


def T(x, y):
    px, py = _pivot
    return (px + (x - px) * _scale + _offset[0],
            py + (y - py) * _scale + _offset[1])


def P(*xy):
    return [tuple(v * S for v in T(x, y)) for x, y in xy]


def B(dx, dy):
    """体の中心からの相対位置(100基準)→最終座標。鳥の縮尺・位置に追従する。

    翼や汗のように「最終座標で置きたいが鳥と一緒に伸縮してほしい」ものに使う。
    """
    cx, cy = T(*_pivot)
    return cx + dx * _scale, cy + dy * _scale


def box(x, y, w, h):
    x0, y0 = T(x, y)
    x1, y1 = T(x + w, y + h)
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def circle(d, cx, cy, r, color):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), fill=color)


def line(d, pts, color, w):
    d.line(P(*pts), fill=color, width=max(1, int(round(w * _scale * S))), joint='curve')
    for x, y in pts:
        circle(d, x, y, w / 2, color)


# 顔の向き(左上を向かせる): 回転角と寄せ幅。100基準の顔中心まわりに適用する。
FACE_ROT = 11.0       # 正=時計回り
FACE_DX = -4.0
FACE_DY = -2.0
FACE_PIVOT = (50.0, 54.0)


def F(x, y):
    """顔パーツ座標を「左上を向く」向きに変換する。"""
    a = math.radians(FACE_ROT)
    px, py = FACE_PIVOT
    dx, dy = x - px, y - py
    rx = dx * math.cos(a) - dy * math.sin(a)
    ry = dx * math.sin(a) + dy * math.cos(a)
    return px + rx + FACE_DX, py + ry + FACE_DY


# ── 部品 ──────────────────────────────────────────────

COIN_MARK = '#E0A522'


def _line_abs(d, pts, color, w):
    """最終座標での線(丸端)。"""
    d.line([(x * S, y * S) for x, y in pts], fill=color,
           width=max(1, int(round(w * S))), joint='curve')
    for x, y in pts:
        d.ellipse([(x - w / 2) * S, (y - w / 2) * S,
                   (x + w / 2) * S, (y + w / 2) * S], fill=color)


def coin_plain(d, cx, cy, r, yen=False, yen_rot=0.0):
    """金貨(最終座標指定・変換なし)。500円玉のように内側を一段明るい面にする。

    yen_rot は ¥ の傾き(度)。負で反時計回り。コインの中心を軸に回す。
    """
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], fill='#F6C748')
    ri = r * 0.78
    d.ellipse([(cx - ri) * S, (cy - ri) * S, (cx + ri) * S, (cy + ri) * S], fill='#FFDA6E')
    if not yen:
        return

    a = math.radians(yen_rot)

    def R(px, py):
        dx, dy = px - cx, py - cy
        return (cx + dx * math.cos(a) - dy * math.sin(a),
                cy + dx * math.sin(a) + dy * math.cos(a))

    w = r * 0.13
    for pts in (
        [(cx - r * 0.34, cy - r * 0.40), (cx, cy + r * 0.02)],
        [(cx + r * 0.34, cy - r * 0.40), (cx, cy + r * 0.02)],
        [(cx, cy - r * 0.02), (cx, cy + r * 0.46)],
        [(cx - r * 0.28, cy + r * 0.14), (cx + r * 0.28, cy + r * 0.14)],
        [(cx - r * 0.28, cy + r * 0.31), (cx + r * 0.28, cy + r * 0.31)],
    ):
        _line_abs(d, [R(*p) for p in pts], COIN_MARK, w)


def wing_oval_raised(d, cx, cy, a, b, toward):
    """丸いオーバルの翼(最終座標指定)。長軸を toward へ向けて回転。"""
    ux, uy = toward[0] - cx, toward[1] - cy
    n = math.hypot(ux, uy)
    ux, uy = ux / n, uy / n
    vx, vy = -uy, ux
    pts = []
    for i in range(72):
        t = 2 * math.pi * i / 72
        x = cx + ux * a * math.cos(t) + vx * b * math.sin(t)
        y = cy + uy * a * math.cos(t) + vy * b * math.sin(t)
        pts.append((x * S, y * S))
    d.polygon(pts, fill='#D8D8DC')


def foot(d, hip, tip, color='#FF9500', w=2):
    """脚1本: hip から tip へ伸ばし、先端に指を開く。

    指は脚の向きを基準に開くので、脚を傾けても足首の角度は左右で揃う。
    """
    line(d, [hip, tip], color, w)
    ux, uy = tip[0] - hip[0], tip[1] - hip[1]
    n = math.hypot(ux, uy)
    ux, uy = ux / n, uy / n
    px, py = -uy, ux            # 脚に垂直な向き
    line(d, [(tip[0] - px * 3 + ux, tip[1] - py * 3 + uy),
             tip,
             (tip[0] + px * 3 + ux, tip[1] + py * 3 + uy)], color, w)


def eye_closed(d, cx, cy, s, mirror, color='#1C1C1E'):
    """`>` `<` の閉じ目。mirror=True で `<`(右目)。内側に尖る。"""
    m = -1 if mirror else 1
    pts = [(cx - m * s, cy - s * 0.75),
           (cx + m * s * 0.55, cy),
           (cx - m * s, cy + s * 0.75)]
    line(d, [F(*p) for p in pts], color, 2.0)


def sweat_drop_abs(d, cx, cy, s, toward, color='#8FCBEA'):
    """汗(最終座標指定・変換なし)。toward の方向へ尖らせる。"""
    ux, uy = toward[0] - cx, toward[1] - cy
    n = math.hypot(ux, uy)
    ux, uy = ux / n, uy / n
    px, py = -uy, ux
    r = s * 0.52
    bx, by = cx - ux * s * 0.25, cy - uy * s * 0.25   # 丸い側の中心
    tip = (cx + ux * s, cy + uy * s)
    d.polygon([(tip[0] * S, tip[1] * S),
               ((bx + px * r) * S, (by + py * r) * S),
               ((bx - px * r) * S, (by - py * r) * S)], fill=color)
    d.ellipse([(bx - r) * S, (by - r) * S, (bx + r) * S, (by + r) * S], fill=color)


BG_PINK = '#FBD0D5'


def draw_icon(bg=None, yen=False, yen_rot=0.0,
              wing_under=False, wing_a=14.4, wing_rel=(-25.6, 8.3)):
    """アイコン1枚。bg に描画関数を渡すと背景だけ差し替えられる。

    前景(金貨を運ぶシマエナガ)の構図は確定。背景の検討はすべて bg 側で行う。

    yen        : 金貨に ¥ を入れる
    yen_rot    : ¥ の傾き(度)。負で反時計回り
    wing_under : 翼を体より先に描く。付け根が体に隠れて浮きが消える
                 (体の上に置くと、白い体の上にグレーの塊が乗って見えるため)
    wing_a     : 翼の長半径。体に隠れる分、wing_under では長めが要る
    """
    img = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')

    # 背景(参考イラストのピンク)
    d.rectangle([(0, 0), (CANVAS, CANVAS)], fill=BG_PINK)
    if bg is not None:
        # img も渡す。ImageDraw の 'RGBA' モードは fill のアルファを合成せず
        # 置き換えるため、半透明を重ねたい背景は img.alpha_composite を使う。
        bg(d, img)

    # コイン(左・全体が画面に収まる大きさと位置)
    coin_c, coin_r = (33.0, 38.0), 29.0
    coin_plain(d, *coin_c, coin_r, yen=yen, yen_rot=yen_rot)

    # ── 鳥(BirdMascot と同じ描画順: 尾 → 足 → 体 → 翼 → 顔) ──
    d.polygon(P((55, 72), (84, 86), (82, 93), (52, 81)), fill='#3A3A3C')

    # 左足は前(コイン側)へ斜めに踏み出す。右足は軸足でまっすぐ。
    foot(d, (41, 82), (34, 86))
    foot(d, (55, 82), (55, 90))

    def draw_wing():
        # BirdMascot の丸いオーバルを、コインを下から支える向きに回転。
        # 狙いはコインの中心ではなく右下寄り。翼が寝て支える角度になる。
        wing_oval_raised(d, *B(*wing_rel), wing_a * _scale, 7.8 * _scale,
                         toward=(coin_c[0] - 3, coin_c[1] + 22))

    if wing_under:
        draw_wing()

    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')

    if not wing_under:
        draw_wing()

    # 顔(コイン側=左上を向かせる。パーツ一式を回転+平行移動)
    eye_closed(d, 42, 48, 3.0, mirror=False)
    eye_closed(d, 58, 48, 3.0, mirror=True)
    d.polygon(P(F(47, 54), F(53, 54), F(50, 60)), fill='#FF9500')
    circle(d, *F(36, 56), 3.5, (255, 150, 170, 115))
    circle(d, *F(64, 56), 3.5, (255, 150, 170, 115))

    # 汗2滴(鳥の右上。位置・大きさは鳥に追従し、先端を顔へ向ける)
    head = T(*_pivot)
    sweat_drop_abs(d, *B(22.2, -32.2), 5.33 * _scale, toward=head)
    sweat_drop_abs(d, *B(28.3, -22.8), 3.78 * _scale, toward=head)

    return img


def draw(size=OUT, bg=None, **kw):
    return draw_icon(bg, **kw).convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v10')
    os.makedirs(outdir, exist_ok=True)
    draw(OUT).save(os.path.join(outdir, 'mascot_coin_1024.png'))
    draw(60).save(os.path.join(outdir, 'mascot_coin_60.png'))
    print('done')
