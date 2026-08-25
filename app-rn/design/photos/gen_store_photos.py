"""ストア掲載用スクリーンショットに写す「商品写真」の生成スクリプト（これが唯一の正）。

    python3 gen_store_photos.py            # svg/ と out/ にプレビューを生成
    python3 gen_store_photos.py --install  # app-rn/src/dev/storeShotPhotos.ts へ書き出す

── なぜ描くのか ──────────────────────────────────────
Google Play の掲載画像に実物の商品写真を写すと、写した物の権利（撮影者・
被写体のデザイン・箱に載ったロゴ）がそのまま掲載画像に乗る。撮影用データは
商標の付かない商品名で作ってあるので（src/dev/storeShotData.ts）、写真だけ
実物というのは筋が通らない。そこで**フリマでよく売られる物を絵で描く**。

── 絵の言語 ──────────────────────────────────────────
うりつみのイラスト（src/components/BirdMascot.tsx / AchievementTierMotif.tsx）
と揃える:

  * 輪郭線を引かない。色面だけで形を作る
  * フラットな単色。グラデーションも影のぼかしも使わない
  * 単純な図形（円・楕円・多角形・二次ベジェ）だけで組む
  * 地に落ちる影は、地色より少し濃い**平らな楕円**ひとつで表す

── SVG と JPEG の関係 ────────────────────────────────
**形の定義はこのファイルにしか無い。** ここから

  * `svg/<name>.svg` … 人が見て直せる形（絵そのもの。コミットする）
  * `out/<name>.jpg` … 目視確認用のプレビュー
  * `storeShotPhotos.ts` … アプリが実際に写す JPEG（base64）

の 3 つを同じ図形リストから出す。SVG を手で直して JPEG と食い違う、という
ずれ方が起きないようにするため（gen_uritsumi_assets.py と同じ考え方）。

アプリが JPEG を持つのは、商品写真が `expo-image` で URI から表示される
ものだから（src/media/photoFiles.ts）── react-native-svg の描画とは経路が
違うので、SVG のままでは記録に添付できない。保存形式も本物の写真と同じ
JPEG に揃える（logic/photo.ts の PHOTO_EXTENSION）。

── 出力サイズ ────────────────────────────────────────
長辺 900px。アプリが保存する写真の上限は 1000px（PHOTO_MAX_EDGE）で、
表示に使う最大は記録詳細の幅 338pt。3 倍密度でも 1014px なので、
フラットな絵ならこの寸法で拡大の粗さは出ない。
"""
import argparse
import base64
import io
import math
import os
import re

from PIL import Image, ImageDraw

# ── キャンバス ────────────────────────────────────────
OUT = 900
SS = 4                       # スーパーサンプリング倍率（輪郭のギザギザ消し）
CANVAS = OUT * SS
S = CANVAS / 100.0           # 100 基準座標 → ピクセル

HERE = os.path.dirname(os.path.abspath(__file__))
SVG_DIR = os.path.join(HERE, 'svg')
OUT_DIR = os.path.join(HERE, 'out')
DEV_DIR = os.path.abspath(os.path.join(HERE, '..', '..', 'src', 'dev'))

# JPEG の品質。フラットな色面なので 82 でもバンディングが出ず、1 枚 20KB 前後に収まる
JPEG_QUALITY = 82


# ── 図形（SVG の要素とほぼ 1 対 1）────────────────────
# どれも 100×100 基準の座標で持ち、`to_svg` が SVG 要素を、`draw` が PIL の
# 描画を返す。**塗りだけで線を持たない**のは絵の言語（輪郭線を引かない）に合わせたもの。

class Circle:
    def __init__(self, cx, cy, r, fill):
        self.cx, self.cy, self.r, self.fill = cx, cy, r, fill

    def to_svg(self):
        return (f'<circle cx="{num(self.cx)}" cy="{num(self.cy)}" r="{num(self.r)}" '
                f'fill="{self.fill}"/>')

    def draw(self, d):
        d.ellipse(
            [(self.cx - self.r) * S, (self.cy - self.r) * S,
             (self.cx + self.r) * S, (self.cy + self.r) * S],
            fill=self.fill,
        )


class Ellipse:
    def __init__(self, cx, cy, rx, ry, fill):
        self.cx, self.cy, self.rx, self.ry, self.fill = cx, cy, rx, ry, fill

    def to_svg(self):
        return (f'<ellipse cx="{num(self.cx)}" cy="{num(self.cy)}" rx="{num(self.rx)}" '
                f'ry="{num(self.ry)}" fill="{self.fill}"/>')

    def draw(self, d):
        d.ellipse(
            [(self.cx - self.rx) * S, (self.cy - self.ry) * S,
             (self.cx + self.rx) * S, (self.cy + self.ry) * S],
            fill=self.fill,
        )


class Rect:
    def __init__(self, x, y, w, h, fill, r=0):
        self.x, self.y, self.w, self.h, self.fill, self.r = x, y, w, h, fill, r

    def to_svg(self):
        radius = f' rx="{num(self.r)}"' if self.r else ''
        return (f'<rect x="{num(self.x)}" y="{num(self.y)}" width="{num(self.w)}" '
                f'height="{num(self.h)}"{radius} fill="{self.fill}"/>')

    def draw(self, d):
        box = [self.x * S, self.y * S, (self.x + self.w) * S, (self.y + self.h) * S]
        if self.r:
            d.rounded_rectangle(box, radius=self.r * S, fill=self.fill)
        else:
            d.rectangle(box, fill=self.fill)


class Path:
    """`d` 属性の図形。**対応するのは絶対座標の M / L / Q / Z だけ。**

    三次ベジェ（C）を入れていないのは、二次で描ける形しか使っていないため
    ── 対応を増やすほど SVG と PIL の描き分けがずれる余地が増える。
    """

    def __init__(self, d, fill):
        self.d, self.fill = d, fill

    def to_svg(self):
        # d は組み立ての時点で桁を詰めてある（各図形の f 文字列）ので、そのまま書く
        return f'<path d="{self.d}" fill="{self.fill}"/>'

    def draw(self, d):
        points = [(x * S, y * S) for x, y in flatten_path(self.d)]
        d.polygon(points, fill=self.fill)


def num(value):
    """SVG に書く数値。**小数 2 桁で丸める** ── 計算で出た 22.365000000000002 を
    そのまま書くと、人が読んで直せる形（svg/*.svg の目的）でなくなる。
    丸めの影響は 900px 換算で 0.2px 未満なので、JPEG 側との差は出ない。
    """
    return f'{round(value, 2):g}'


# 1 コマンド = 文字 + それに続く数値の並び
_COMMAND = re.compile(r'([MLQZmlqz])([^MLQZmlqz]*)')


def _numbers(text):
    return [float(value) for value in re.findall(r'-?\d*\.?\d+(?:e-?\d+)?', text)]


def flatten_path(d, segments=48):
    """パスを折れ線（頂点の並び）にする。曲線は `segments` 等分して直線でつなぐ。

    900px × スーパーサンプリング 4 倍で描くので、48 分割あれば曲率の高い所でも
    1 セグメントが数ピクセルに収まり、縮小後に角は見えない。
    """
    points = []
    current = (0.0, 0.0)
    start = (0.0, 0.0)
    for command, argument in _COMMAND.findall(d):
        values = _numbers(argument)
        if command in 'Mm':
            current = start = (values[0], values[1])
            points.append(current)
            # 1 つの M に続く座標対は L と同じ扱い（SVG の規定）
            for i in range(2, len(values), 2):
                current = (values[i], values[i + 1])
                points.append(current)
        elif command in 'Ll':
            for i in range(0, len(values), 2):
                current = (values[i], values[i + 1])
                points.append(current)
        elif command in 'Qq':
            for i in range(0, len(values), 4):
                cx, cy, x, y = values[i:i + 4]
                x0, y0 = current
                for step in range(1, segments + 1):
                    t = step / segments
                    u = 1 - t
                    points.append((
                        u * u * x0 + 2 * u * t * cx + t * t * x,
                        u * u * y0 + 2 * u * t * cy + t * t * y,
                    ))
                current = (x, y)
        elif command in 'Zz':
            current = start
    return points


# ── 配色 ──────────────────────────────────────────────
# 撮影用のデータに使う色。**彩度を落とした中間色で揃える** ── 原色を並べると
# 画面写真の中で商品写真だけが浮いて、アプリの UI から目線を奪う。


def shade(hex_color, amount):
    """色を暗い側へ寄せる。影・リブ編み・帯など「同じ色の一段濃い側」に使う"""
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return '#%02X%02X%02X' % tuple(int(v * (1 - amount)) for v in (r, g, b))


def backdrop(color, cy, rx, ry=4.5):
    """背景（一面のベタ塗り）と、その上に置く平らな影。どの絵にも共通の 2 枚。

    **影は品物の底に食い込ませる**（`cy` は品物の下端より少し上）── 離すと
    品物が浮いて見え、平置きの写真に読めなくなる。ぼかしは使わない（絵の言語）。
    """
    return [
        Rect(0, 0, 100, 100, color),
        Ellipse(50, cy, rx, ry, shade(color, 0.055)),
    ]


def lerp(a, b, t):
    return a + (b - a) * t


# ── 絵 ────────────────────────────────────────────────

def dress():
    """ワンピース。平置き・A ライン・スクエアな肩"""
    bg = '#EDF1F4'
    cloth = '#7096BC'
    belt = shade(cloth, 0.18)

    # 身頃の脇線。肩 (y=29) → 腰 (y=47) → 裾 (y=76) の 2 本の直線でできている
    def side(y):
        if y <= 47:
            return lerp(35, 32, (y - 29) / 18), lerp(65, 68, (y - 29) / 18)
        return lerp(32, 28, (y - 47) / 29), lerp(68, 72, (y - 47) / 29)

    top, bottom = 50.0, 56.0
    bl, br = side(top)
    hl, hr = side(bottom)

    return backdrop(bg, 75.5, 26, 4.4) + [
        # 袖（身頃より先に描く。肩に食い込む側は身頃が覆う）
        Path('M35 29 L25 36 L29 45 L38 41 Z', cloth),
        Path('M65 29 L75 36 L71 45 L62 41 Z', cloth),
        # 身頃。肩は水平に切り、裾を二次ベジェでふくらませて A ラインにする
        Path('M35 29 L32 47 L28 76 Q50 82 72 76 L68 47 L65 29 Z', cloth),
        # 襟ぐり（背景色で抜く＝地が見えている、平置きの見え方）。
        # **肩線より下に収める** ── はみ出すと肩の上に輪が浮く
        Ellipse(50, 32.6, 7.6, 3.2, bg),
        # ベルト。脇線の傾きに合わせた台形にして、脇からはみ出させない
        Path(f'M{num(bl)} {num(top)} L{num(br)} {num(top)} L{num(hr)} {num(bottom)} L{num(hl)} {num(bottom)} Z', belt),
    ]


def mugs():
    """マグカップ 2 個セット。手前と奥で色を変える"""
    bg = '#F5F0E7'
    front = '#EBDFC9'
    back = '#8FB3A4'

    def mug(top_y, bottom_y, left, right, taper, body, handle_x):
        """1 個ぶん。`handle_x` の符号で取っ手の向き（左右）が決まる"""
        rim = shade(body, 0.07)
        band = shade(body, 0.15)
        bl, br = left + taper, right - taper
        mid = (top_y + bottom_y) / 2 + 1
        # 取っ手は胴の外側だけに出す。半径は胴の高さの 1/4 強
        radius = (bottom_y - top_y) * 0.235
        cx = (br + radius * 0.75) if handle_x > 0 else (bl - radius * 0.75)
        # 帯は胴の傾きに沿わせる（水平な矩形だと脇から出る）
        y1, y2 = lerp(top_y, bottom_y, 0.40), lerp(top_y, bottom_y, 0.62)

        def edge(x_top, x_bottom, y):
            return lerp(x_top, x_bottom, (y - top_y) / (bottom_y - top_y))

        return [
            # 取っ手（胴より先に描き、重なりを胴で隠す）
            Circle(cx, mid, radius, body),
            Circle(cx, mid, radius * 0.46, bg),
            # 胴。底の 2 隅だけ丸める
            Path(f'M{num(left)} {num(top_y)} L{num(bl)} {num(bottom_y - 3.5)} '
                 f'Q{num(bl + 0.4)} {num(bottom_y)} {num(bl + 3.5)} {num(bottom_y)} '
                 f'L{num(br - 3.5)} {num(bottom_y)} Q{num(br - 0.4)} {num(bottom_y)} '
                 f'{num(br)} {num(bottom_y - 3.5)} L{num(right)} {num(top_y)} Z', body),
            Path(f'M{num(edge(left, bl, y1))} {num(y1)} L{num(edge(right, br, y1))} {num(y1)} '
                 f'L{num(edge(right, br, y2))} {num(y2)} L{num(edge(left, bl, y2))} {num(y2)} Z',
                 band),
            # 飲み口（少し上から見た形）
            Ellipse((left + right) / 2, top_y, (right - left) / 2, 3.2, rim),
        ]

    # 奥は左・取っ手も左、手前は右・取っ手も右。取っ手が相手の胴に重ならない置き方
    return (backdrop(bg, 73, 27, 4.4)
            + mug(36, 64, 26, 52, 1.3, back, -1)
            + mug(44, 74, 44, 72, 1.4, front, +1))


def books():
    """文庫本 5 冊。横から見た積み重ね"""
    bg = '#F1EDE7'
    pages = '#FAF5EA'
    # (左端, 幅, 色, 背の向き)。背の向きを揃えないのは、まとめ売りの山らしくするため
    stack = [
        (19, 60, '#5B7EA6', 'left'),
        (23, 54, '#C4695A', 'right'),
        (18, 58, '#DFAF54', 'left'),
        (25, 51, '#6E9E86', 'left'),
        (21, 55, '#AC87B2', 'right'),
    ]
    height, gap = 8.4, 0.9
    shapes = backdrop(bg, 77, 27, 4.2)
    y = 76.0 - height
    for x, w, color, spine in stack:
        shapes.append(Rect(x, y, w, height, color, r=1.4))
        # 小口（紙の束）。**背の側だけを深く残す** ── 四方を均等に空けると
        # 本ではなく額縁に見える
        left = x + (4.6 if spine == 'left' else 1.0)
        right = x + w - (1.0 if spine == 'left' else 4.6)
        shapes.append(Rect(left, y + 1.5, right - left, height - 3.0, pages, r=0.7))
        y -= height + gap
    return shapes


def sweater():
    """ニットセーター。平置き・ラグラン袖・クルーネック"""
    bg = '#F2F1EA'
    knit = '#D9A551'
    rib = shade(knit, 0.17)

    def cuff(outer, inner, shoulder, width=4.6):
        """袖口のリブ。**袖先の辺（outer→inner）を肩の方へ `width` だけ平行移動した帯**。

        袖の向きを肩から計算するので、左右で式を書き分けない ── 書き分けると
        片方だけ符号を直し忘れて袖から外れる（実際にそうなった）。
        """
        dx, dy = shoulder[0] - outer[0], shoulder[1] - outer[1]
        length = math.hypot(dx, dy)
        ox, oy = dx / length * width, dy / length * width
        return Path(f'M{num(outer[0])} {num(outer[1])} L{num(inner[0])} {num(inner[1])} '
                    f'L{num(inner[0] + ox)} {num(inner[1] + oy)} '
                    f'L{num(outer[0] + ox)} {num(outer[1] + oy)} Z', rib)

    # 裾リブの上端。脇線 (29,45)→(28,71) / (71,45)→(72,71) 上の点
    hem = 66.0
    hl = lerp(29, 28, (hem - 45) / 26)
    hr = lerp(71, 72, (hem - 45) / 26)

    return backdrop(bg, 73.5, 28, 4.6) + [
        # 本体（袖・身頃をひと続きの輪郭で描く）。肩は水平に切る
        Path('M34 30 L14 42 L21 53 L29 45 L28 71 Q50 76 72 71 L71 45 L79 53 '
             'L86 42 L66 30 Z', knit),
        cuff((14, 42), (21, 53), (34, 30)),
        cuff((86, 42), (79, 53), (66, 30)),
        # 裾のリブ
        Path(f'M{num(hl)} {num(hem)} L{num(hr)} {num(hem)} L72 71 Q50 76 28 71 Z', rib),
        # 襟ぐり。**リブの輪ごと肩線より下に収める**（浮いた輪に見せない）
        Ellipse(50, 35.0, 8.6, 3.9, rib),
        Ellipse(50, 35.3, 5.9, 2.2, bg),
    ]


# 生成する絵。名前は storeShotPhotos.ts のキーになる
DRAWINGS = {
    'dress': dress,
    'mugs': mugs,
    'books': books,
    'sweater': sweater,
}


def render_svg(shapes):
    body = '\n  '.join(shape.to_svg() for shape in shapes)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
            'width="900" height="900">\n  ' + body + '\n</svg>\n')


def render_jpeg(shapes):
    image = Image.new('RGB', (CANVAS, CANVAS), '#FFFFFF')
    draw = ImageDraw.Draw(image)
    for shape in shapes:
        shape.draw(draw)
    image = image.resize((OUT, OUT), Image.LANCZOS)
    buffer = io.BytesIO()
    # progressive を切るのは、端末側のデコーダを選ばない普通の JPEG に揃えるため
    image.save(buffer, 'JPEG', quality=JPEG_QUALITY, optimize=True, progressive=False)
    return buffer.getvalue()


TS_HEADER = '''// 撮影用テストデータに添える商品写真（__DEV__ 専用）。**自動生成。手で直さない。**
//
//   python3 app-rn/design/photos/gen_store_photos.py --install
//
// 元の図形は design/photos/gen_store_photos.py にあり、同じ定義から
// design/photos/svg/*.svg（人が見る形）とこのファイル（アプリが写す JPEG）が出る。
// 実物の写真を使わない理由と絵の描き方は、そちらの冒頭コメントを参照。
//
// **base64 で埋め込む。** アプリの写真置き場はドキュメントディレクトリ配下の
// 実ファイルで（SPEC-V5 §1.3）、記録に載るのはそのファイル名 ── つまり投入の
// 瞬間に「中身のあるファイル」を書き込む必要がある。バンドル資産（require した
// 画像）は開発中は Metro の http URI、本番では OS の資材になり、どちらも
// `File.copySync` で複製できるパスにならない。バイト列を持って
// photoStore.write へ渡すのが、既存の口だけで完結する唯一の経路。

/** 商品写真 1 枚ぶんの JPEG（base64）。キーは storeShotData.ts の photo が指す名前 */
export const STORE_SHOT_PHOTOS: Record<string, string> = {
'''

TS_FOOTER = '''};

/** 撮影用データが使える写真の名前 */
export type StoreShotPhotoName = keyof typeof STORE_SHOT_PHOTOS;
'''


def write_ts(images):
    lines = [TS_HEADER]
    for name, data in images.items():
        lines.append(f"  {name}:\n    '{base64.b64encode(data).decode('ascii')}',\n")
    lines.append(TS_FOOTER)
    path = os.path.join(DEV_DIR, 'storeShotPhotos.ts')
    with open(path, 'w') as file:
        file.write(''.join(lines))
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--install', action='store_true',
                        help='src/dev/storeShotPhotos.ts を書き出す')
    args = parser.parse_args()

    os.makedirs(SVG_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    images = {}
    for name, build in DRAWINGS.items():
        shapes = build()
        with open(os.path.join(SVG_DIR, f'{name}.svg'), 'w') as file:
            file.write(render_svg(shapes))
        data = render_jpeg(shapes)
        with open(os.path.join(OUT_DIR, f'{name}.jpg'), 'wb') as file:
            file.write(data)
        images[name] = data
        print(f'{name:9s} svg + jpg {len(data) / 1024:6.1f} KB '
              f'(base64 {len(base64.b64encode(data)) / 1024:6.1f} KB)')

    if args.install:
        print('->', write_ts(images))


if __name__ == '__main__':
    main()
