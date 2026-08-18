"""うりつみ アプリアイコン: 参考イラスト(コインを抱えて汗をかく鳥)を
アイコン向けに再構成した版。

gen_uritsumi_icons_v4_bg.py (coin_worry) をベースに、アイコンとして
成立させるための変更を加える:
  - 鳥とコインで画面の8割を占めるまで拡大し、端は切れてよい
  - 影・コインの厚み(二重リング)・震え線を除去してフラットにする
  - きらきら・円マークを削除し、要素を鳥/コイン/汗2滴のみに絞る
  - 目は黒丸2つ、翼は縁取りなし灰色単色、くちばしは三角形の
    標準キャラクターデザインに戻す
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0

_scale = 1.0
_pivot = (50.0, 54.0)
_offset = (0.0, 0.0)


def T(x, y):
    px, py = _pivot
    dx, dy = _offset
    return px + (x - px) * _scale + dx, py + (y - py) * _scale + dy


def P(*xy):
    return [tuple(v * S for v in T(x, y)) for x, y in xy]


def box(x, y, w, h):
    x0, y0 = T(x, y)
    x1, y1 = T(x + w, y + h)
    return [x0 * S, y0 * S, x1 * S, y1 * S]


def circle(d, cx, cy, r, color):
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), fill=color)


def line(d, pts, color, w, joint='curve'):
    lw = max(w * _scale, 0.1)
    d.line(P(*pts), fill=color, width=max(1, int(round(lw * S))), joint=joint)
    for x, y in pts:
        circle(d, x, y, w / 2, color)


def set_transform(scale, pivot, offset=(0.0, 0.0)):
    global _scale, _pivot, _offset
    _scale, _pivot, _offset = scale, pivot, offset


# ── 鳥のパーツ(標準デザイン) ──────────────────────────────

def bird_tail(d):
    d.polygon(P((55, 72), (84, 86), (82, 93), (52, 81)), fill='#3A3A3C')


def bird_feet(d):
    for fx in (45, 55):
        line(d, [(fx, 82), (fx, 90)], '#FF9500', 2)
        line(d, [(fx - 3, 91), (fx, 90), (fx + 3, 91)], '#FF9500', 2)


def bird_body(d):
    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')


def bird_cheeks(d):
    circle(d, 36, 56, 3.5, (255, 150, 170, 115))
    circle(d, 64, 56, 3.5, (255, 150, 170, 115))


def bird_wing_raised(d):
    """翼を左上へ長く伸ばし、コインの底を下から支える形。縁取りなしの単色。"""
    d.polygon(
        P((32, 70), (22, 56), (14, 36), (8, 18), (18, 16), (24, 32), (30, 50), (34, 66)),
        fill='#D8D8DC',
    )


def bird_face_plain(d):
    # 黒丸2つの目(スラント眉なし)
    circle(d, 42, 49, 3, '#1C1C1E')
    circle(d, 58, 49, 3, '#1C1C1E')
    # くちばし(三角形)
    d.polygon(P((47, 57), (53, 57), (50, 62)), fill='#FF9500')


def sweat_drop(d, cx, cy, s, color='#8FCBEA'):
    r = s * 0.55
    d.polygon(P((cx, cy - s), (cx - r, cy + r * 0.3), (cx + r, cy + r * 0.3)), fill=color)
    circle(d, cx, cy + r * 0.5, r, color)


def coin_flat(d, cx, cy, r):
    """厚み表現(二重リング)や円マークを持たない、平らな一枚の金貨。"""
    circle(d, cx, cy, r, '#FFD24C')
    d.ellipse(box(cx - r, cy - r, r * 2, r * 2), outline='#E8AE18',
              width=max(2, int(round(r * 0.035 * S))))


def draw_coin_worry_icon(d):
    # 背景(参考イラストのピンク、フラット単色)
    d.rectangle([(0, 0), (OUT * SS, OUT * SS)], fill='#FBD3D9')

    # コイン(左上・画面いっぱいに寄せて拡大、端は切れてよい)
    coin_flat(d, 27, 20, 33)

    # 鳥(その場で拡大してから右下へ平行移動、端は切れてよい)
    set_transform(0.92, (50, 54), (11, 12))
    bird_wing_raised(d)
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    bird_face_plain(d)
    bird_cheeks(d)
    sweat_drop(d, 66, 38, 5.0)
    sweat_drop(d, 70, 46, 3.6)


VARIANTS = {
    'coin_worry_icon': {
        'draw': draw_coin_worry_icon,
        'intent': '参考イラストをアイコン向けに再構成(拡大トリミング・フラット化・要素整理)。',
    },
}


def draw(name, size=OUT):
    img = Image.new('RGBA', (OUT * SS, OUT * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    VARIANTS[name]['draw'](d)
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = os.path.join(os.path.dirname(__file__), 'output_v9')
    os.makedirs(outdir, exist_ok=True)
    for name, cfg in VARIANTS.items():
        big = draw(name, OUT)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = draw(name, 60)
        small.save(os.path.join(outdir, f'{name}_60.png'))
        print(name, '-', cfg['intent'])
