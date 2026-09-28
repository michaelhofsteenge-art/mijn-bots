"""Genereer app-iconen (180/192/512 + maskable 512) met Pillow."""
from PIL import Image, ImageDraw, ImageFilter
COLORS = ["#E0457B", "#7C5CE0", "#2F80ED", "#F2994A", "#27AE60"]

def hex2rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))

def icon(size, pad_frac=0.0):
    S = size * 4  # supersample
    img = Image.new("RGB", (S, S))
    top, bot = hex2rgb("#1B2140"), hex2rgb("#0B0E1F")
    d = ImageDraw.Draw(img)
    for y in range(S):
        t = y / S
        d.line([(0, y), (S, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    inner = S * (1 - 2 * pad_frac)
    off = S * pad_frac
    m = inner * 0.17
    x0, x1 = off + m, off + inner - m
    n = len(COLORS); gap = inner * 0.035
    h = (inner - 2 * m - gap * (n - 1)) / n
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0)); sd = ImageDraw.Draw(shadow)
    for i in range(n):
        y0 = off + m + i * (h + gap)
        sd.rounded_rectangle([x0, y0 + S*0.01, x1, y0 + h + S*0.01], radius=h*0.35, fill=(0, 0, 0, 120))
    img.paste(shadow.filter(ImageFilter.GaussianBlur(S*0.01)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(S*0.01)))
    d = ImageDraw.Draw(img)
    for i, c in enumerate(COLORS):
        y0 = off + m + i * (h + gap)
        d.rounded_rectangle([x0, y0, x1, y0 + h], radius=h * 0.35, fill=hex2rgb(c))
        r = h * 0.22; cx = x0 + h * 0.5; cy = y0 + h / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255))
        lx = x0 + h * 0.95
        d.rounded_rectangle([lx, cy - h*0.1, lx + (x1 - lx) * (0.75 - 0.08*i), cy + h*0.1], radius=h*0.1, fill=(255, 255, 255, 230))
    return img.resize((size, size), Image.LANCZOS)

icon(180).save("icons/apple-touch-icon.png")
icon(192).save("icons/icon-192.png")
icon(512).save("icons/icon-512.png")
icon(512, pad_frac=0.1).save("icons/icon-maskable-512.png")
icon(32).save("icons/favicon-32.png")
print("ok")
