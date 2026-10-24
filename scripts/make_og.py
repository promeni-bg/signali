"""Draw the social preview (public/og.png, 1200x630) and the touch icon (public/apple-touch-icon.png).

Run on Windows (Segoe UI has the Cyrillic): python scripts/make_og.py
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

S = 2  # draw at 2x, then downsample: smooth shapes
W, H = 1200, 630
FONTS = Path("C:/Windows/Fonts")
INK, INK2, INK3 = "#0f1729", "#475467", "#98a2b3"
BLUE, RED, LINE, CHIP = "#1d6fd8", "#d92d20", "#e3e6eb", "#eef0f3"
out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent.parent / "public")


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size * S)


def og():
    im = Image.new("RGB", (W * S, H * S), "white")
    d = ImageDraw.Draw(im)
    s = lambda *v: [x * S for x in v]

    d.rectangle(s(0, 0, W, 10), fill=BLUE)

    # "на живо" line
    x, y = 80, 92
    d.ellipse(s(x, y + 7, x + 18, y + 25), fill=RED)
    d.text(s(x + 32, y), "НА ЖИВО  ·  ИЗБОРИ 25 ОКТОМВРИ 2026", font=font("seguisb.ttf", 24), fill=INK2)

    # title and explanation
    d.text(s(78, 150), "Сигнали от", font=font("segoeuib.ttf", 80), fill=INK)
    d.text(s(78, 246), "видеонаблюдение", font=font("segoeuib.ttf", 80), fill=INK)
    sub = font("segoeui.ttf", 30)
    d.text(s(80, 372), "Доброволци гледат преброяването на evideo.bg", font=sub, fill=INK2)
    d.text(s(80, 412), "и сигнализират за нередности в секциите", font=sub, fill=INK2)

    # a card with ranked bars, like the dashboard's
    cx, cy, cw, ch = 860, 150, 260, 300
    d.rounded_rectangle(s(cx, cy, cx + cw, cy + ch), radius=16 * S, fill="white", outline=LINE, width=2 * S)
    for i, frac in enumerate([1.0, 0.78, 0.6, 0.44, 0.3, 0.18]):
        ry = cy + 34 + i * 44
        d.rounded_rectangle(s(cx + 24, ry, cx + 92, ry + 10), radius=5 * S, fill=CHIP)
        bx, bw = cx + 106, (cw - 106 - 26) * frac
        d.rounded_rectangle(s(bx, ry - 4, bx + bw, ry + 14), radius=5 * S, fill=BLUE if i < 3 else "#7fb0f5")

    # footer
    d.line(s(80, 520, W - 80, 520), fill=LINE, width=2 * S)
    d.text(s(80, 545), "signali.promeni.bg", font=font("segoeuib.ttf", 30), fill=BLUE)
    note = "Обновява се всяка минута"
    f = font("segoeui.ttf", 24)
    d.text((W * S - 80 * S - d.textlength(note, font=f), 551 * S), note, font=f, fill=INK3)

    im.resize((W, H), Image.LANCZOS).save(out / "og.png", optimize=True)


def icon():
    n = 180
    im = Image.new("RGB", (n * S, n * S), "white")
    d = ImageDraw.Draw(im)
    for i, frac in enumerate([1.0, 0.7, 0.45]):
        y = (52 + i * 34) * S
        d.rounded_rectangle((40 * S, y, (40 + 100 * frac) * S, y + 20 * S), radius=8 * S, fill=BLUE)
    d.ellipse((128 * S, 22 * S, 158 * S, 52 * S), fill=RED)
    im.resize((n, n), Image.LANCZOS).save(out / "apple-touch-icon.png", optimize=True)


og()
icon()
print("wrote", out / "og.png", out / "apple-touch-icon.png")
