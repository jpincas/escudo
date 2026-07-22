#!/usr/bin/env python3
"""Rasterise every Escudo SVG to PNG. One script for the whole library.

Each family has its own size ladder, because the jobs differ: signage is print
and mockup artwork, the crest is used from favicon to hero, and the Telegram
avatars only ever need to be uploaded once at 512.

    logo       logo/*.svg                      -> logo/png/
    signage    signs-stickers/<lang>/<type>/*.svg -> .../png/
    telegram   telegram/*.svg                  -> telegram/png/

Output is always `<the svg's folder>/png/<name>-<width>.png`.

Usage:  python3 export-png.py                  every family
        python3 export-png.py telegram logo    only these
        python3 export-png.py --widths 512     override the ladder

Telegram SVGs are generated, not hand-drawn: run `telegram/generate.py` first
if you have changed that design.

Needs cairosvg, in a scratch venv rather than system-wide:
    python3 -m venv .venv && .venv/bin/pip install cairosvg
    .venv/bin/python export-png.py
"""
import argparse
import glob
import os
import sys

import cairosvg

HERE = os.path.dirname(os.path.abspath(__file__))

FAMILIES = {
    "logo": {
        "pattern": os.path.join("logo", "*.svg"),
        "widths": [32, 64, 128, 256, 512, 1024],
    },
    "signage": {
        "pattern": os.path.join("signs-stickers", "*", "*", "*.svg"),
        "widths": [800, 1600, 3200],
    },
    "telegram": {
        # 512 is what Telegram wants for a group photo or a bot picture; the
        # rest are for documentation and the site.
        "pattern": os.path.join("telegram", "*.svg"),
        "widths": [64, 128, 512, 1024],
    },
    "diagrams": {
        # Explanatory diagrams, one set per language. The site shows the PNG,
        # because an <img>-loaded SVG can't reach the page's webfonts.
        "pattern": os.path.join("diagrams", "*", "*.svg"),
        "widths": [1200, 2400],
    },
}


def export(family, widths=None):
    spec = FAMILIES[family]
    widths = widths or spec["widths"]
    svgs = sorted(glob.glob(os.path.join(HERE, spec["pattern"])))
    if not svgs:
        print(f"{family}: no SVGs found — nothing to do")
        return 0

    written = 0
    for svg in svgs:
        folder = os.path.dirname(svg)
        name = os.path.splitext(os.path.basename(svg))[0]
        out = os.path.join(folder, "png")
        os.makedirs(out, exist_ok=True)
        for w in widths:
            dst = os.path.join(out, f"{name}-{w}.png")
            cairosvg.svg2png(url=svg, write_to=dst, output_width=w)
            print(f"  {os.path.relpath(dst, HERE)}")
            written += 1
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("families", nargs="*", choices=list(FAMILIES) + [[]],
                    help="families to export (default: all)")
    ap.add_argument("--widths", type=lambda s: [int(w) for w in s.split(",")],
                    help="comma-separated widths, overriding the family's ladder")
    args = ap.parse_args()

    families = args.families or list(FAMILIES)
    total = 0
    for family in families:
        print(f"{family}:")
        total += export(family, args.widths)

    print(f"\n{total} PNGs written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
