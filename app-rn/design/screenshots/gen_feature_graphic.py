"""Google Play フィーチャーグラフィック生成スクリプト。

左にアプリ名とキャッチコピー、右に計算タブ・記録一覧を傾けて重ねた
1024x500 の PNG を1枚出力する。

    python3 gen_feature_graphic.py

入力: ../photos/src/*.png (Pixel 5 の生スクショ)
出力: ./out/feature_graphic.png
"""
import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'photos', 'src')
OUT = os.path.join(HERE, 'out')

W, H = 1024, 500

# app-rn/design/photos/gen_store_screenshots.py / icons/gen_uritsumi_assets.py の
# night テーマと揃える
GRAD_TOP = '#5A6592'
GRAD_BOTTOM = '#343D63'
GRAD_ANGLE = 55

TITLE_FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc'
SUB_FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc'

TITLE_SIZE = 68
SUB_SIZE = 32
TITLE_COLOR = (255, 255, 255, 255)
SUB_COLOR = (255, 255, 255, 180)

TEXT_LEFT = 70
TEXT_BLOCK_CENTER_Y = 250

BEZEL = 12
CORNER_R = 34

CALC_FILE = 'Screenshot_1787407461.png'
RECORDS_FILE = 'Screenshot_1787407168.png'


def make_background(w, h):
    top = tuple(int(GRAD_TOP[i:i + 2], 16) for i in (1, 3, 5))
    bot = tuple(int(GRAD_BOTTOM[i:i + 2], 16) for i in (1, 3, 5))
    rad = math.radians(GRAD_ANGLE)
    dx, dy = math.cos(rad), math.sin(rad)
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    projs = [cx * dx + cy * dy for cx, cy in corners]
    lo, hi = min(projs), max(projs)
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = ((x * dx + y * dy) - lo) / (hi - lo)
            r = int(top[0] + (bot[0] - top[0]) * t)
            g = int(top[1] + (bot[1] - top[1]) * t)
            b = int(top[2] + (bot[2] - top[2]) * t)
            px[x, y] = (r, g, b)
    return img


def rounded_mask(size, radius):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return m


def framed_phone(src_path, frame_w):
    shot = Image.open(src_path).convert('RGBA')
    screen_w = frame_w - BEZEL * 2
    scale = screen_w / shot.width
    screen_h = int(shot.height * scale)
    shot = shot.resize((screen_w, screen_h), Image.LANCZOS)

    mask = rounded_mask((screen_w, screen_h), CORNER_R - BEZEL)
    screen_layer = Image.new('RGBA', (screen_w, screen_h), (0, 0, 0, 0))
    screen_layer.paste(shot, (0, 0), mask)

    frame_h = screen_h + BEZEL * 2
    frame = Image.new('RGBA', (frame_w, frame_h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    fd.rounded_rectangle([0, 0, frame_w - 1, frame_h - 1], radius=CORNER_R, fill=(18, 18, 22, 255))
    frame.alpha_composite(screen_layer, (BEZEL, BEZEL))

    # パンチホールカメラ
    cam_r = 5
    fd.ellipse(
        [frame_w // 2 - cam_r, BEZEL + 16 - cam_r, frame_w // 2 + cam_r, BEZEL + 16 + cam_r],
        fill=(10, 10, 12, 255),
    )
    return frame


def paste_clipped(base, layer, xy):
    """base(RGBA) に layer を貼る。base の範囲外にはみ出す分は自然にクリップされる。"""
    base.alpha_composite(layer, xy) if _fits(base, layer, xy) else _paste_partial(base, layer, xy)


def _fits(base, layer, xy):
    x, y = xy
    return x >= 0 and y >= 0 and x + layer.width <= base.width and y + layer.height <= base.height


def _paste_partial(base, layer, xy):
    x, y = xy
    bx0, by0 = max(x, 0), max(y, 0)
    bx1, by1 = min(x + layer.width, base.width), min(y + layer.height, base.height)
    if bx0 >= bx1 or by0 >= by1:
        return
    lx0, ly0 = bx0 - x, by0 - y
    lx1, ly1 = lx0 + (bx1 - bx0), ly0 + (by1 - by0)
    crop = layer.crop((lx0, ly0, lx1, ly1))
    base.alpha_composite(crop, (bx0, by0))


def rotated(img, angle):
    return img.rotate(angle, resample=Image.BICUBIC, expand=True)


def drop_shadow(layer, blur=18, alpha=110, offset=(0, 10)):
    alpha_ch = layer.split()[3]
    solid = Image.new('RGBA', layer.size, (0, 0, 0, 0))
    solid.paste((0, 0, 0, alpha), (0, 0), alpha_ch)
    canvas = Image.new('RGBA', (layer.width + blur * 4, layer.height + blur * 4), (0, 0, 0, 0))
    canvas.paste(solid, (blur * 2 + offset[0], blur * 2 + offset[1]))
    return canvas.filter(ImageFilter.GaussianBlur(blur)), (blur * 2, blur * 2)


def compose():
    bg = make_background(W, H).convert('RGBA')

    # ── 右: 記録一覧(奥) + 計算タブ(手前)を傾けて重ねる ──
    # 記録一覧は計算タブより左に大きくずらし、中身が数行見える余白を残す
    records = framed_phone(os.path.join(SRC, RECORDS_FILE), frame_w=252)
    records = rotated(records, 11)
    rec_shadow, rec_shadow_origin = drop_shadow(records, alpha=90)
    paste_clipped(bg, rec_shadow, (530 - rec_shadow_origin[0], -30 - rec_shadow_origin[1]))
    paste_clipped(bg, records, (530, -30))

    calc = framed_phone(os.path.join(SRC, CALC_FILE), frame_w=298)
    calc = rotated(calc, -7)
    shadow_img, shadow_origin = drop_shadow(calc)
    paste_clipped(bg, shadow_img, (610 - shadow_origin[0], -10 - shadow_origin[1]))
    paste_clipped(bg, calc, (610, -10))

    # ── 左: テキスト ──
    draw = ImageDraw.Draw(bg)
    title_font = ImageFont.truetype(TITLE_FONT, TITLE_SIZE)
    sub_font = ImageFont.truetype(SUB_FONT, SUB_SIZE)

    title = 'うりつみ'
    sub = '計算して、そのまま記録'

    title_bbox = draw.textbbox((0, 0), title, font=title_font)
    sub_bbox = draw.textbbox((0, 0), sub, font=sub_font)
    title_h = title_bbox[3] - title_bbox[1]
    sub_h = sub_bbox[3] - sub_bbox[1]
    gap = 22
    block_h = title_h + gap + sub_h
    top = TEXT_BLOCK_CENTER_Y - block_h // 2

    draw.text((TEXT_LEFT, top - title_bbox[1]), title, font=title_font, fill=TITLE_COLOR)
    draw.text((TEXT_LEFT, top + title_h + gap - sub_bbox[1]), sub, font=sub_font, fill=SUB_COLOR)

    return bg.convert('RGB')


def main():
    os.makedirs(OUT, exist_ok=True)
    img = compose()
    out_path = os.path.join(OUT, 'feature_graphic.png')
    img.save(out_path, 'PNG')
    print('wrote', out_path, img.size)
    print('file size:', os.path.getsize(out_path), 'bytes')


if __name__ == '__main__':
    main()
