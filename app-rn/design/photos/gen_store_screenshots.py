"""ストア掲載用スクリーンショット生成スクリプト。

実機/シミュレータのスクリーンショットに、見出し・補足・端末フレームを重ねて
ストア掲載用画像を6枚出力する。Android・iOS 共通の処理で、プラットフォームだけ
コマンドライン引数で切り替える。

    python3 gen_store_screenshots.py android
    python3 gen_store_screenshots.py ios
    python3 gen_store_screenshots.py            # 両方まとめて実行

入力:
  - android: photos/src/*.png            (Pixel 5, 1080x2340. gitignore 対象)
  - ios:     photos/src/ios/*.png        (iPhone 17 Pro Max, 1320x2868. gitignore 対象)
出力:
  - android: photos/out/store/*.png
  - ios:     design/store/ios/*.png
"""
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN_ROOT = os.path.dirname(HERE)

# app-rn/design/icons/gen_uritsumi_assets.py の night テーマと揃える
GRAD_TOP = '#5A6592'
GRAD_BOTTOM = '#343D63'
GRAD_ANGLE = 55

HEADLINE_FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W7.ttc'
SUB_FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc'
HEADLINE_COLOR = (255, 255, 255, 255)
SUB_COLOR = (255, 255, 255, 178)

# 以下の定数は基準サイズ(BASE_W x BASE_H = Android 1080x2340)に対する値。
# 他プラットフォームでは W/BASE_W の倍率でスケールして同じ見た目の比率にする。
BASE_W, BASE_H = 1080, 2340
HEADLINE_SIZE = 58
SUB_SIZE = 32
TOP_MARGIN = 150
HEADLINE_SUB_GAP = 20
SUB_FRAME_GAP = 90
LINE_GAP = 10
TEXT_MARGIN_X = 90
FRAME_SCALE = 0.76          # 元スクショに対する縮小率(サイズ非依存)
BEZEL = 22                  # 端末フレームの縁の太さ
CORNER_R = 64                # スクリーンの角丸(スケール後)
CAMERA_R = 7                 # パンチホールカメラの半径

TEXT_CAPTIONS = [
    {
        'headline': '手元に、いくら残る？',
        'sub': '手数料・送料・梱包材を引いた純利益が出ます',
        'out': '01_calc.png',
    },
    {
        'headline': '売れた記録を、ためていく',
        'sub': '月ごとの収支がひと目で分かります',
        'out': '02_records.png',
    },
    {
        'headline': 'いくらで売ればいい？',
        'sub': 'ほしい利益から、必要な販売価格を逆算します',
        'out': '03_reverse.png',
    },
    {
        'headline': 'どこまで下げられる？',
        'sub': '動かすと利益がその場で変わります',
        'out': '04_simulator.png',
    },
    {
        'headline': '売るほど、積み上がっていく',
        'sub': '月ごとの純利益と、その累計が分かります',
        'out': '05_data.png',
    },
    {
        'headline': '何にいくらかかったか',
        'sub': '内訳を帯グラフで確認できます',
        'out': '06_detail.png',
    },
]

PLATFORMS = {
    'android': {
        'size': (1080, 2340),
        'src': os.path.join(HERE, 'src'),
        'out': os.path.join(HERE, 'out', 'store'),
        'files': [
            'Screenshot_1787407461.png',
            'Screenshot_1787407168.png',
            'Screenshot_1787407623.png',
            'Screenshot_1787407220.png',
            'Screenshot_1787407184.png',
            'Screenshot_1787407613.png',
        ],
    },
    'ios': {
        'size': (1320, 2868),
        'src': os.path.join(HERE, 'src', 'ios'),
        'out': os.path.join(DESIGN_ROOT, 'store', 'ios'),
        'files': [
            'Simulator Screenshot - iPhone 17 Pro Max - 2026-08-23 at 18.35.02.png',  # 計算タブ
            'Simulator Screenshot - iPhone 17 Pro Max - 2026-08-23 at 18.33.49.png',  # 記録一覧
            'Simulator Screenshot - iPhone 17 Pro Max - 2026-08-23 at 18.35.29.png',  # 逆算
            'Simulator Screenshot - iPhone 17 Pro Max - 2026-08-23 at 18.34.35.png',  # 値下げシミュレータ
            'Simulator Screenshot - iPhone 17 Pro Max - 2026-08-23 at 18.33.57.png',  # データタブ
            'Simulator Screenshot - iPhone 17 Pro Max - 2026-08-23 at 18.35.12.png',  # 記録詳細
        ],
    },
}


def build_shots(platform):
    files = platform['files']
    return [
        {**caption, 'file': files[i]}
        for i, caption in enumerate(TEXT_CAPTIONS)
    ]


def make_background(w, h):
    grad = Image.new('RGB', (w, h), GRAD_TOP)
    top = tuple(int(GRAD_TOP[i:i + 2], 16) for i in (1, 3, 5))
    bot = tuple(int(GRAD_BOTTOM[i:i + 2], 16) for i in (1, 3, 5))
    rad = math.radians(GRAD_ANGLE)
    dx, dy = math.cos(rad), math.sin(rad)
    # 対角線方向への射影の最大値で正規化する
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    projs = [cx * dx + cy * dy for cx, cy in corners]
    lo, hi = min(projs), max(projs)
    px = grad.load()
    for y in range(h):
        for x in range(0, w, 2):
            t = ((x * dx + y * dy) - lo) / (hi - lo)
            t = max(0.0, min(1.0, t))
            r = int(top[0] + (bot[0] - top[0]) * t)
            g = int(top[1] + (bot[1] - top[1]) * t)
            b = int(top[2] + (bot[2] - top[2]) * t)
            px[x, y] = (r, g, b)
            if x + 1 < w:
                px[x + 1, y] = (r, g, b)
    return grad


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def wrap_by_width(draw, text, font, max_width):
    if draw.textlength(text, font=font) <= max_width:
        return [text]
    # 句読点・記号の前後で自然に折り返す(かな文字送りの簡易版)
    lines, cur = [], ''
    for ch in text:
        trial = cur + ch
        if draw.textlength(trial, font=font) > max_width and cur:
            lines.append(cur)
            cur = ch
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def compose(shot, size, src_dir, scale):
    w, h = size
    headline_size = round(HEADLINE_SIZE * scale)
    sub_size = round(SUB_SIZE * scale)
    top_margin = round(TOP_MARGIN * scale)
    headline_sub_gap = round(HEADLINE_SUB_GAP * scale)
    sub_frame_gap = round(SUB_FRAME_GAP * scale)
    line_gap = round(LINE_GAP * scale)
    text_margin_x = round(TEXT_MARGIN_X * scale)
    bezel = round(BEZEL * scale)
    corner_r = round(CORNER_R * scale)
    frame_corner_r = corner_r + bezel
    camera_r = round(CAMERA_R * scale)

    bg = make_background(w, h).convert('RGBA')
    draw = ImageDraw.Draw(bg)

    headline_font = ImageFont.truetype(HEADLINE_FONT, headline_size)
    sub_font = ImageFont.truetype(SUB_FONT, sub_size)

    max_text_w = w - text_margin_x * 2
    headline_lines = wrap_by_width(draw, shot['headline'], headline_font, max_text_w)
    sub_lines = wrap_by_width(draw, shot['sub'], sub_font, max_text_w)

    y = top_margin
    for line in headline_lines:
        lw = draw.textlength(line, font=headline_font)
        draw.text(((w - lw) / 2, y), line, font=headline_font, fill=HEADLINE_COLOR)
        y += headline_size + line_gap
    y += headline_sub_gap - line_gap
    for line in sub_lines:
        lw = draw.textlength(line, font=sub_font)
        draw.text(((w - lw) / 2, y), line, font=sub_font, fill=SUB_COLOR)
        y += sub_size + line_gap
    frame_top = y + sub_frame_gap

    # スクリーンショットを縮小して角丸マスクをかける
    shot_img = Image.open(os.path.join(src_dir, shot['file'])).convert('RGBA')
    sw, sh = int(shot_img.width * FRAME_SCALE), int(shot_img.height * FRAME_SCALE)
    shot_img = shot_img.resize((sw, sh), Image.LANCZOS)
    screen_mask = rounded_mask((sw, sh), corner_r)
    screen_layer = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    screen_layer.paste(shot_img, (0, 0), screen_mask)

    frame_w, frame_h = sw + bezel * 2, sh + bezel * 2
    frame_x = (w - frame_w) // 2
    frame_y = frame_top

    # 端末フレーム(縁)+ドロップシャドウ
    shadow_offset = round(24 * scale)
    shadow_blur = round(30 * scale)
    shadow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [frame_x, frame_y + shadow_offset, frame_x + frame_w, frame_y + frame_h + shadow_offset],
        radius=frame_corner_r, fill=(0, 0, 0, 90),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(shadow_blur))
    bg.alpha_composite(shadow)

    bezel_layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bezel_layer)
    bd.rounded_rectangle(
        [frame_x, frame_y, frame_x + frame_w, frame_y + frame_h],
        radius=frame_corner_r, fill=(18, 18, 22, 255),
    )
    bg.alpha_composite(bezel_layer)
    bg.alpha_composite(screen_layer, (frame_x + bezel, frame_y + bezel))

    # パンチホールカメラ(画面上部中央)
    cam_x = frame_x + frame_w // 2
    cam_y = frame_y + bezel + round(26 * scale)
    draw = ImageDraw.Draw(bg)
    draw.ellipse(
        [cam_x - camera_r, cam_y - camera_r, cam_x + camera_r, cam_y + camera_r],
        fill=(10, 10, 12, 255),
    )

    return bg.convert('RGB')


def run(platform_name):
    platform = PLATFORMS[platform_name]
    size = platform['size']
    scale = size[0] / BASE_W
    shots = build_shots(platform)
    os.makedirs(platform['out'], exist_ok=True)
    for shot in shots:
        img = compose(shot, size, platform['src'], scale)
        out_path = os.path.join(platform['out'], shot['out'])
        img.save(out_path, 'PNG')
        print('wrote', out_path, img.size)


def main():
    targets = sys.argv[1:] or list(PLATFORMS.keys())
    for name in targets:
        if name not in PLATFORMS:
            raise SystemExit(f'unknown platform: {name} (choices: {list(PLATFORMS)})')
        run(name)


if __name__ == '__main__':
    main()
