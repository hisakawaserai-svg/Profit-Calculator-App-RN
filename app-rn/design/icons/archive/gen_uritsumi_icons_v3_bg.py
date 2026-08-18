"""うりつみ アプリアイコン 方向性比較 6案(方向A/B/C ×各2)。

前2回は「鳥+小物」の構図で、意図が60pxで伝わりにくかった。
今回は前作(スタンプ抜き)のチェッカー模様が担っていた役割 ──
「背景そのものが機能を語る」構造を踏襲し、小物を鳥の隣に足す
のではなく背景側(パターン・図形・色分割)で語る。

方向A: 記録・帳面であることを背景で語る(数字/円記号/電卓/棒グラフは使わない)
方向B: 積み上げ・成長を背景で語る(階層カラー / 植物モチーフを背景規模で)
方向C: 説明しない。鳥と色・構図の印象だけで押す(顔ズーム/シルエットの発展)

鳥の形・色・パーツ構成(体・翼・尾・足・くちばし・目・ほっぺ)は元スクリプトのまま。
"""
import os
from PIL import Image, ImageDraw

OUT = 1024
SS = 4
S = OUT * SS / 100.0

_scale = 1.0
_pivot = (50.0, 54.0)
_offset = (0.0, 0.0)


def set_transform(scale, pivot, offset=(0.0, 0.0)):
    global _scale, _pivot, _offset
    _scale, _pivot, _offset = scale, pivot, offset


def T(x, y):
    px, py = _pivot
    x = px + (x - px) * _scale
    y = py + (y - py) * _scale
    return x + _offset[0], y + _offset[1]


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


# ── 鳥のパーツ(共通・形と色は不変) ──────────────────────────────

def bird_tail(d):
    d.polygon(P((55, 72), (84, 86), (82, 93), (52, 81)), fill='#3A3A3C')


def bird_feet(d):
    for fx in (45, 55):
        line(d, [(fx, 82), (fx, 90)], '#FF9500', 2)
        line(d, [(fx - 3, 91), (fx, 90), (fx + 3, 91)], '#FF9500', 2)


def bird_body(d):
    d.ellipse(box(21, 23, 58, 62), fill='#FFFFFF')


def bird_wing(d):
    d.ellipse(box(61, 44, 18, 32), fill='#D8D8DC')


def bird_face(d):
    circle(d, 42, 48, 3, '#1C1C1E')
    circle(d, 58, 48, 3, '#1C1C1E')
    d.polygon(P((47, 54), (53, 54), (50, 60)), fill='#FF9500')


def bird_cheeks(d):
    circle(d, 36, 56, 3.5, (255, 150, 170, 115))
    circle(d, 64, 56, 3.5, (255, 150, 170, 115))


def bird_full(d):
    bird_tail(d)
    bird_feet(d)
    bird_body(d)
    bird_wing(d)
    bird_face(d)
    bird_cheeks(d)


def abs_rect(d, x0, y0, x1, y1, **kw):
    d.rectangle([(x0 * S, y0 * S), (x1 * S, y1 * S)], **kw)


def hexrgb(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


# ── 方向A: 記録・帳面であることを背景で語る ──────────────────────────────

def draw_a1_ruled(d):
    """帳面の罫線。太めの罫線+左に綴じ用の縦線(マージン線)で「記録用紙」を示す。"""
    d.rectangle([(0, 0), (OUT * SS, OUT * SS)], fill=hexrgb('#F3ECDD'))
    line_color = hexrgb('#B7C6DA')
    margin_color = hexrgb('#C85A6E')
    for y in (24, 40, 56, 72, 88):
        abs_rect(d, 6, y - 0.8, 94, y + 0.8, fill=line_color)
    abs_rect(d, 15, 2, 16.6, 98, fill=margin_color)
    set_transform(0.8, (50.0, 55.0), offset=(4, 2))
    bird_full(d)


def draw_a2_tag_field(d):
    """タグ(荷札)の形を背景いっぱいに敷く。パンチ穴も背景規模で。"""
    d.rectangle([(0, 0), (OUT * SS, OUT * SS)], fill=hexrgb('#6B4423'))
    tag_color = hexrgb('#E9CE93')
    d.rounded_rectangle([(8 * S, 8 * S), (92 * S, 94 * S)], radius=14 * S, fill=tag_color)
    circle(d, 22, 22, 7, hexrgb('#6B4423'))
    set_transform(0.78, (50.0, 58.0))
    bird_full(d)


# ── 方向B: 積み上げ・成長を背景で語る ──────────────────────────────

def draw_b1_tier_bands(d):
    """実績の階層カラーを下から積み上げた帯として背景に敷く。"""
    bands = [
        (80, 100, '#B8752E'),  # ブロンズ(最下段)
        (60, 80, '#9AA1A9'),   # シルバー
        (40, 60, '#D4AF37'),   # ゴールド
        (20, 40, '#6FA3C7'),   # プラチナ
        (0, 20, '#5A1B33'),    # ボルドー(最上段)
    ]
    for y0, y1, c in bands:
        abs_rect(d, 0, y0, 100, y1, fill=hexrgb(c))
    set_transform(0.85, (50.0, 58.0))
    bird_full(d)


def draw_b2_sprout_field(d):
    """植物モチーフ(芽)を背景規模まで拡大し、鳥を包むように配置する。"""
    d.rectangle([(0, 0), (OUT * SS, OUT * SS)], fill=hexrgb('#173324'))
    stem_color = hexrgb('#BFE6C4')
    leaf_color = hexrgb('#8FD199')
    leaf_light = hexrgb('#C9EFCB')
    abs_rect(d, 48.6, 18, 51.4, 96, fill=stem_color)
    leaf_specs = [(78, 34, 1.0), (58, 26, 1.25), (38, 20, 1.5)]
    for ly, lw_scale, s in leaf_specs:
        pass
    # 3段の大きな双葉(下から上ほど大きく)
    pairs = [(78, 0.9), (56, 1.25), (34, 1.6)]
    for ly, s in pairs:
        d.polygon([(50 * S, ly * S),
                   ((50 - 22 * s) * S, (ly - 10 * s) * S),
                   ((50 - 30 * s) * S, (ly - 28 * s) * S),
                   ((50 - 10 * s) * S, (ly - 16 * s) * S)], fill=leaf_color)
        d.polygon([(50 * S, ly * S),
                   ((50 + 22 * s) * S, (ly - 10 * s) * S),
                   ((50 + 30 * s) * S, (ly - 28 * s) * S),
                   ((50 + 10 * s) * S, (ly - 16 * s) * S)], fill=leaf_light)
    set_transform(0.62, (50.0, 82.0))
    bird_full(d)


# ── 方向C: 説明しない。印象の強さで押す ──────────────────────────────

def draw_c1_face_split(d):
    """顔ズーム(前回好評)を発展。斜め2色分割の強い背景の上に巨大な顔。"""
    c1, c2 = hexrgb('#1B2A4A'), hexrgb('#0E1830')
    d.polygon([(0, 0), (100 * S, 0), (0, 100 * S)], fill=c1)
    d.polygon([(100 * S, 0), (100 * S, 100 * S), (0, 100 * S)], fill=c2)
    set_transform(1.55, (50.0, 42.0))
    bird_full(d)


def draw_c2_silhouette_split(d):
    """シルエット(前回好評)を発展。上下2色フラットの強いコントラスト背景。"""
    top, bottom = hexrgb('#17151C'), hexrgb('#5A1B33')
    abs_rect(d, 0, 0, 100, 52, fill=top)
    abs_rect(d, 0, 52, 100, 100, fill=bottom)
    set_transform(0.9, (50.0, 54.0))
    bird_body(d)
    bird_face(d)


VARIANTS = {
    'A1_ruled_notebook': {
        'draw': draw_a1_ruled,
        'intent': '方向A: 罫線+綴じ線で「記録用紙」を語る。数字や電卓は使わない。',
    },
    'A2_tag_field': {
        'draw': draw_a2_tag_field,
        'intent': '方向A: 荷札(タグ)の形そのものを背景いっぱいに敷き、鳥をタグの上に立たせる。',
    },
    'B1_tier_bands': {
        'draw': draw_b1_tier_bands,
        'intent': '方向B: 実績の階層カラー(ブロンズ→ボルドー)を積み上げた帯として背景に敷く。',
    },
    'B2_sprout_field': {
        'draw': draw_b2_sprout_field,
        'intent': '方向B: 植物モチーフの芽を背景規模まで拡大し、鳥を包む「育つ」構図にする。',
    },
    'C1_face_split': {
        'draw': draw_c1_face_split,
        'intent': '方向C: 顔ズームを発展。斜め2色の強い背景で印象を底上げする。',
    },
    'C2_silhouette_split': {
        'draw': draw_c2_silhouette_split,
        'intent': '方向C: シルエットを発展。上下2色のフラットな色分割で旗のような強さを出す。',
    },
}


def draw(name, size=OUT):
    img = Image.new('RGBA', (OUT * SS, OUT * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    VARIANTS[name]['draw'](d)
    return img.convert('RGB').resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    outdir = 'app_icons_uritsumi_v3'
    os.makedirs(outdir, exist_ok=True)
    for name, cfg in VARIANTS.items():
        big = draw(name, OUT)
        big.save(os.path.join(outdir, f'{name}_1024.png'))
        small = draw(name, 60)
        small.save(os.path.join(outdir, f'{name}_60.png'))
        print(name, '-', cfg['intent'])
