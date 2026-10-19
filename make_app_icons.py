"""Iconen voor de twee apps: Acties (oranje, vinkje) en Onderzoek (blauw, vergrootglas)."""
from PIL import Image, ImageDraw
def hex2rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
def icon(size, top, bot, glyph, pad=0.0):
    S = size * 4
    img = Image.new("RGB", (S, S)); d = ImageDraw.Draw(img)
    a, b = hex2rgb(top), hex2rgb(bot)
    for y in range(S):
        t = y / S; d.line([(0, y), (S, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    k = 1 - 2 * pad; o = S * pad; P = lambda x, y: (o + x * S * k, o + y * S * k)
    w = int(S * k * 0.11)
    if glyph == "check":
        d.line([P(.24, .52), P(.42, .70), P(.77, .31)], fill="white", width=w, joint="curve")
        for x, y in [(.24, .52), (.77, .31)]:
            cx, cy = P(x, y); d.ellipse([cx - w/2, cy - w/2, cx + w/2, cy + w/2], fill="white")
    else:
        cx, cy = P(.43, .43); r = S * k * .22
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline="white", width=w)
        d.line([P(.59, .59), P(.78, .78)], fill="white", width=int(w * 1.25))
        ex, ey = P(.78, .78); q = w * .62; d.ellipse([ex - q, ey - q, ex + q, ey + q], fill="white")
    return img.resize((size, size), Image.LANCZOS)
for app, top, bot, g in [("acties", "#F59E0B", "#C2410C", "check"), ("onderzoek", "#38BDF8", "#1E40AF", "glass")]:
    icon(180, top, bot, g).save(f"{app}/icons/apple-touch-icon.png")
    icon(192, top, bot, g).save(f"{app}/icons/icon-192.png")
    icon(512, top, bot, g).save(f"{app}/icons/icon-512.png")
    icon(512, top, bot, g, pad=0.1).save(f"{app}/icons/icon-maskable-512.png")
    icon(32, top, bot, g).save(f"{app}/icons/favicon-32.png")
print("ok")
