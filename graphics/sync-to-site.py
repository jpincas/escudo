#!/usr/bin/env python3
"""Copy the canonical artwork in `graphics/` into the Hugo site's `static/`.

One direction only: graphics -> website. Nothing in `website/static/img/` is a
master; this script overwrites it wholesale, so edit the originals here and
re-run. Layout it produces:

    static/img/logo/<colour>-<pos|neg>.svg          crest, all six variants
    static/img/logo/<colour>-<pos|neg>-1024.png     rasterised
    static/img/telegram/<icon>.svg                  group + bot avatars
    static/img/telegram/<icon>-512.png              the size Telegram takes
    static/img/screenshots/<area>/<name>.png        app captures, as shot
    static/img/mockups/telegram/<name>.jpg          the bot in use, web-weight
    static/img/examples/<name>.jpg                  other schemes (CC), web-weight
    static/img/scenes/<name>.jpg                    generated scenes, web-weight
    static/img/diagrams/<lang>/<name>.svg           explanatory diagrams (vector)
    static/img/diagrams/<lang>/<name>-1200.png      the same, as used on the page
    static/img/signage/<lang>/escudo-<piece>.svg    vector original (print)
    static/img/signage/<lang>/escudo-<piece>-1600.png   artwork, on-page
    static/img/signage/<lang>/escudo-<piece>-3200.png   artwork, download
    static/img/signage/<lang>/mockups/<scene>.jpg   photo mockups, web-weight

Mockups are 2-3 MB PNGs in `photos-mockups/`; they are downsized and re-encoded
as JPEG here so pages stay light. Needs ImageMagick (`convert`) for that step.

Usage:  python3 sync-to-site.py [--dry-run]
"""
import argparse
import glob
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(os.path.dirname(HERE), "website", "static", "img")
LANGS = ["es", "en"]
PIECES = {"sticker": "sticker", "plaque": "plaque", "sign": "roadsign"}
LEGACY = ["senales"]          # pre-multilingual layout, removed on sync
MOCKUP_WIDTH = 1600
MOCKUP_QUALITY = "82"

n_copied = 0


def copy(src, dst, args):
    global n_copied
    if args.dry_run:
        print(f"  would copy {os.path.relpath(dst, SITE)}")
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    n_copied += 1


def convert(src, dst, args):
    """Downsize + JPEG-encode a mockup PNG for the web."""
    global n_copied
    if args.dry_run:
        print(f"  would convert {os.path.relpath(dst, SITE)}")
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run(
        ["convert", src, "-resize", f"{MOCKUP_WIDTH}x{MOCKUP_WIDTH}>",
         "-quality", MOCKUP_QUALITY, "-strip", dst],
        check=True,
    )
    n_copied += 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not shutil.which("convert") and not args.dry_run:
        sys.exit("error: ImageMagick `convert` not found — needed to web-encode mockups.")

    for stale in LEGACY:
        path = os.path.join(SITE, stale)
        if os.path.isdir(path):
            print(f"removing legacy {os.path.relpath(path, SITE)}/")
            if not args.dry_run:
                shutil.rmtree(path)

    print("logo:")
    for svg in sorted(glob.glob(os.path.join(HERE, "logo", "*.svg"))):
        copy(svg, os.path.join(SITE, "logo", os.path.basename(svg)), args)
    for png in sorted(glob.glob(os.path.join(HERE, "logo", "png", "*-1024.png"))):
        copy(png, os.path.join(SITE, "logo", os.path.basename(png)), args)

    print("telegram:")
    for svg in sorted(glob.glob(os.path.join(HERE, "telegram", "*.svg"))):
        copy(svg, os.path.join(SITE, "telegram", os.path.basename(svg)), args)
    for png in sorted(glob.glob(os.path.join(HERE, "telegram", "png", "*-512.png"))):
        copy(png, os.path.join(SITE, "telegram", os.path.basename(png)), args)

    # Screenshots are copied as shot: they are already screen-sized, and
    # resampling a UI capture blurs exactly the small text that makes it useful.
    print("screenshots:")
    for shot in sorted(glob.glob(os.path.join(HERE, "screenshots", "*", "*.png"))):
        rel = os.path.relpath(shot, os.path.join(HERE, "screenshots"))
        copy(shot, os.path.join(SITE, "screenshots", rel), args)

    # Telegram mockups are language-neutral photographs — the interface on the
    # phone comes from the Spanish captures, but nothing else in the scene is
    # written, so one set serves both languages.
    print("mockups/telegram:")
    for m in sorted(glob.glob(os.path.join(HERE, "photos-mockups", "telegram", "*.png"))):
        name = os.path.basename(m)
        if name.startswith("base-") or name.endswith("-debug.png"):
            continue          # generated inputs and diagnostics, not deliverables
        convert(m, os.path.join(SITE, "mockups", "telegram",
                                os.path.splitext(name)[0] + ".jpg"), args)

    # Freely-licensed photographs of other schemes (Wikimedia Commons). Every
    # one needs visible attribution on the page it appears on — see
    # photos-external/CREDITS.md for author and licence.
    print("examples:")
    for p in sorted(glob.glob(os.path.join(HERE, "photos-external", "*.jpg"))):
        convert(p, os.path.join(SITE, "examples", os.path.basename(p)), args)

    # Illustrative scenes, generated with gpt-image-1. Nobody in them is a real
    # person and nowhere in them is a real place — every page that uses one says
    # so, in the caption. See photos-generated/README.md.
    print("scenes:")
    for p in sorted(glob.glob(os.path.join(HERE, "photos-generated", "*.jpg"))):
        convert(p, os.path.join(SITE, "scenes", os.path.basename(p)), args)

    for lang in LANGS:
        print(f"diagrams/{lang}:")
        for svg in sorted(glob.glob(os.path.join(HERE, "diagrams", lang, "*.svg"))):
            copy(svg, os.path.join(SITE, "diagrams", lang, os.path.basename(svg)), args)
        for png in sorted(glob.glob(os.path.join(HERE, "diagrams", lang, "png",
                                                 "*-1200.png"))):
            copy(png, os.path.join(SITE, "diagrams", lang, os.path.basename(png)), args)

    for lang in LANGS:
        print(f"signage/{lang}:")
        for piece, stem in PIECES.items():
            src_dir = os.path.join(HERE, "signs-stickers", lang, piece)
            svg = os.path.join(src_dir, f"escudo-{stem}.svg")
            if not os.path.exists(svg):
                sys.exit(f"error: missing {svg} — run signs-stickers/export-png.py first?")
            copy(svg, os.path.join(SITE, "signage", lang, os.path.basename(svg)), args)
            for w in (1600, 3200):
                png = os.path.join(src_dir, "png", f"escudo-{stem}-{w}.png")
                if not os.path.exists(png):
                    sys.exit(f"error: missing {png} — run signs-stickers/export-png.py")
                copy(png, os.path.join(SITE, "signage", lang, os.path.basename(png)), args)

        mockups = sorted(glob.glob(os.path.join(HERE, "photos-mockups", lang, "*.png")))
        if not mockups:
            print(f"  ! no mockups for {lang} — run photos-mockups/render.py")
        for m in mockups:
            base = os.path.basename(m)
            if base.endswith("-ai.png") or base.endswith("-debug.png"):
                continue      # compose-signage.py inputs and diagnostics
            name = os.path.splitext(base)[0] + ".jpg"
            convert(m, os.path.join(SITE, "signage", lang, "mockups", name), args)

    print(f"\n{n_copied} files written to {os.path.relpath(SITE, os.path.dirname(HERE))}")


if __name__ == "__main__":
    main()
