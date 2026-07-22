#!/usr/bin/env python3
"""Composite the real Telegram captures onto the phones in the generated scenes.

The scenes in `base-*.png` were generated with a deliberately blank white phone
screen (see mockups.json for the prompts). This script finds that white
rectangle, builds a phone-shaped screen out of the *actual* screenshots in
`graphics/screenshots/telegram/`, and warps it into place.

Doing it this way rather than asking the image model to draw the interface is
the whole point: what you see on the phone is the software as it really is,
down to the wording. A generated interface would be plausible-looking fiction,
and this is a page about a system people are being asked to trust.

Usage:
  python3 compose.py            build every scene in mockups.json
  python3 compose.py --debug    also write *-debug.png marking the detected screen

Needs pillow + numpy (scratch venv, not system-wide).
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GRAPHICS = os.path.dirname(os.path.dirname(HERE))
SHOTS = os.path.join(GRAPHICS, "screenshots", "telegram")

# Telegram's own chrome colours, sampled from the captures.
HEADER_BG = (255, 255, 255)
INPUT_BG = (255, 255, 255)
TINTA = (34, 32, 28)
PIEDRA = (107, 119, 112)


def load_shot(name):
    return Image.open(os.path.join(SHOTS, f"{name}.png")).convert("RGB")


def build_screen(parts, width=760, ratio=2.05):
    """Stack real captures into one phone-shaped screen.

    Each part is scaled to the full width, which keeps every capture at its own
    aspect ratio — nothing is stretched to fit, so the interface stays honest.
    """
    height = int(width * ratio)

    # Empty space above the conversation is chat wallpaper, not white paper.
    # Sample it from the capture's own left edge so the fill always matches
    # whatever theme the screenshots were taken in.
    first = load_shot(parts[0])
    edge = np.asarray(first.crop((0, 0, 12, first.height)))
    wallpaper = tuple(int(c) for c in np.median(edge.reshape(-1, 3), axis=0))

    screen = Image.new("RGB", (width, height), wallpaper)

    header = build_header(width)
    screen.paste(header, (0, 0))

    rendered = []
    for name in parts:
        shot = load_shot(name)
        h = round(shot.height * width / shot.width)
        rendered.append(shot.resize((width, h), Image.LANCZOS))

    # The last part (the keyboard, or the input bar) pins to the bottom; the
    # conversation fills the space between it and the header, cropped from the
    # top if it doesn't fit — which is exactly what a real chat does.
    bottom = rendered[-1]
    screen.paste(bottom, (0, height - bottom.height))

    top = header.height
    space = height - bottom.height - top
    for part in rendered[:-1]:
        if part.height > space:
            part = part.crop((0, part.height - space, part.width, part.height))
        screen.paste(part, (0, top + space - part.height))
        space -= part.height

    return screen


def build_header(width):
    """A plain Telegram-style title bar carrying the bot's real avatar."""
    from PIL import ImageDraw, ImageFont

    h = round(width * 0.13)
    bar = Image.new("RGB", (width, h), HEADER_BG)
    draw = ImageDraw.Draw(bar)

    avatar_px = round(h * 0.62)
    avatar = Image.open(
        os.path.join(GRAPHICS, "telegram", "png", "bot-icon-512.png")
    ).convert("RGBA").resize((avatar_px, avatar_px), Image.LANCZOS)
    bar.paste(avatar, (round(h * 0.28), (h - avatar_px) // 2), avatar)

    x = round(h * 0.28) + avatar_px + round(h * 0.22)
    try:
        name_font = ImageFont.truetype(
            "/home/jon/.local/share/fonts/escudo/PublicSans-SemiBold.ttf", round(h * 0.30))
        sub_font = ImageFont.truetype(
            "/home/jon/.local/share/fonts/escudo/PublicSans-Regular.ttf", round(h * 0.22))
    except OSError:
        name_font = sub_font = ImageFont.load_default()

    draw.text((x, h * 0.24), "Botón Escudo", font=name_font, fill=TINTA)
    draw.text((x, h * 0.56), "bot", font=sub_font, fill=PIEDRA)
    draw.line([(0, h - 1), (width, h - 1)], fill=(226, 231, 223), width=2)
    return bar


def find_screen_quad(photo):
    """Locate the blank white phone screen and return its four corners."""
    arr = np.asarray(photo.convert("RGB")).astype(np.int16)
    bright = arr.min(axis=2) > 205
    flat = (arr.max(axis=2) - arr.min(axis=2)) < 42
    mask = bright & flat

    labels, count = label_blobs(mask)
    if count == 0:
        raise SystemExit("no blank screen found — was the scene generated with one?")

    # Largest-blob-wins is not enough: an overcast sky is bigger than a phone
    # and just as bright. A screen is additionally a *portrait* rectangle that
    # mostly fills its bounding box, which the sky never is. The fill threshold
    # stays loose because rounded corners and an overlapping thumb both eat into
    # it — a real screen measures around 0.7, not 1.0.
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    best, best_area = None, 0
    for blob in np.argsort(sizes)[::-1]:
        area = sizes[blob]
        if area < 2000:
            break
        ys, xs = np.nonzero(labels == blob)
        w = xs.max() - xs.min() + 1
        h = ys.max() - ys.min() + 1
        fill = area / (w * h)
        if fill > 0.60 and 1.3 < h / w < 2.8 and area > best_area:
            best, best_area = blob, area
    if best is None:
        raise SystemExit("found bright regions, but none shaped like a phone screen")
    ys, xs = np.nonzero(labels == best)

    # Corners by extremes of x±y: robust for a rectangle at any modest rotation.
    s, d = xs + ys, xs - ys
    return [
        (int(xs[s.argmin()]), int(ys[s.argmin()])),   # top-left
        (int(xs[d.argmax()]), int(ys[d.argmax()])),   # top-right
        (int(xs[s.argmax()]), int(ys[s.argmax()])),   # bottom-right
        (int(xs[d.argmin()]), int(ys[d.argmin()])),   # bottom-left
    ]


def label_blobs(mask):
    """Tiny two-pass connected-component labeller (no scipy dependency)."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    parent = [0]

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    nxt = 1
    for y in range(h):
        row, prev = mask[y], mask[y - 1] if y else None
        for x in np.nonzero(row)[0]:
            up = labels[y - 1, x] if y and prev[x] else 0
            left = labels[y, x - 1] if x and row[x - 1] else 0
            if up and left:
                labels[y, x] = min(up, left)
                union(up, left)
            elif up or left:
                labels[y, x] = up or left
            else:
                labels[y, x] = nxt
                parent.append(nxt)
                nxt += 1

    for y in range(h):
        for x in np.nonzero(labels[y])[0]:
            labels[y, x] = find(labels[y, x])
    return labels, nxt - 1


def perspective_coeffs(dst, src):
    """Coefficients for PIL's PERSPECTIVE transform (dst quad <- src quad)."""
    matrix = []
    for (x, y), (u, v) in zip(dst, src):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    A = np.array(matrix, dtype=float)
    B = np.array(sum(([u, v] for u, v in src), []), dtype=float)
    return np.linalg.solve(A, B)


def compose(scene, debug=False):
    photo = Image.open(os.path.join(HERE, scene["base"])).convert("RGB")
    quad = find_screen_quad(photo)

    ratio_hint = quad_ratio(quad)
    screen = build_screen(scene["parts"], ratio=ratio_hint)

    coeffs = perspective_coeffs(quad, [
        (0, 0), (screen.width, 0), (screen.width, screen.height), (0, screen.height)])
    warped = screen.transform(photo.size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)

    mask = Image.new("L", screen.size, 255).transform(
        photo.size, Image.PERSPECTIVE, coeffs, Image.BICUBIC)

    # Sit the screen in the scene's light rather than on top of it: a screen
    # photographed in warm evening sun is neither pure white nor fully opaque.
    warped = Image.blend(warped, tint(warped, scene.get("tint", (255, 246, 232))), 0.16)
    out = Image.composite(warped, photo, mask.point(lambda v: int(v * 0.95)))

    dst = os.path.join(HERE, scene["out"])
    out.save(dst)
    print(f"{scene['out']}  screen at {quad}")

    if debug:
        from PIL import ImageDraw
        dbg = photo.copy()
        ImageDraw.Draw(dbg).polygon(quad, outline=(226, 68, 53))
        dbg.save(dst.replace(".png", "-debug.png"))


def tint(image, colour):
    return Image.new("RGB", image.size, colour)


def quad_ratio(quad):
    (tlx, tly), (trx, try_), (brx, bry), (blx, bly) = quad
    width = (np.hypot(trx - tlx, try_ - tly) + np.hypot(brx - blx, bry - bly)) / 2
    height = (np.hypot(blx - tlx, bly - tly) + np.hypot(brx - trx, bry - try_)) / 2
    return height / width


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    with open(os.path.join(HERE, "mockups.json")) as f:
        scenes = json.load(f)
    for scene in scenes:
        compose(scene, args.debug)


if __name__ == "__main__":
    main()
