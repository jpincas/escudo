#!/usr/bin/env python3
"""Render the Escudo signage mockups — every scene, every language.

For each entry in `mockups.json`, sends the real village photo plus the current
signage artwork for a language to OpenAI's image *edits* endpoint, and writes
`photos-mockups/<lang>/<name>.png`.

The artwork always comes from the live exports in `signs-stickers/<lang>/`, so
re-running after a copy change or a re-export regenerates faithful mockups. The
photos in `photos-originals/` are the untouched source scenes — never overwrite
them.

Usage:
  export OPENAI_API_KEY=...                 # never hardcode it
  python3 render.py                         # all scenes, es + en, skips existing
  python3 render.py --force                 # regenerate everything
  python3 render.py --langs en              # one language
  python3 render.py --only puerta-sticker   # one scene
  python3 render.py --dry-run               # show what would be sent, call nothing

Stdlib only — no pip install.
"""
import argparse
import base64
import json
import mimetypes
import os
import struct
import sys
import urllib.error
import urllib.request
import uuid

API_URL = "https://api.openai.com/v1/images/edits"
MODEL = "gpt-image-2-2026-04-21"
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # graphics/
OUT_DIR = os.path.join(BASE, "photos-mockups")

# artwork kind -> exported PNG, relative to graphics/, with {lang} to fill in
ARTWORK = {
    "sticker": "signs-stickers/{lang}/sticker/png/escudo-sticker-1600.png",
    "plaque":  "signs-stickers/{lang}/plaque/png/escudo-plaque-1600.png",
    "sign":    "signs-stickers/{lang}/sign/png/escudo-roadsign-1600.png",
}

# Appended to every scene prompt. The artwork is finished art, not a suggestion:
# the model's job is to place it, not to redraw or translate it.
RULES = (
    " The second image is the finished artwork. Reproduce it exactly as supplied — same "
    "wording, spelling, language, typefaces, colours, crest and layout. Keep its outer amber "
    "border and rounded corners, and keep the crest exactly as drawn — a pale shield with dark "
    "green symbols inside it. Do not invert, recolour, simplify or redraw the crest. Do not "
    "translate, rewrite, re-typeset, crop or restyle any part of it, and add no text of your own. "
    "Match its perspective, scale, lighting and shadow to the scene so it looks physically "
    "present, but keep it flat, sharp and fully legible. Leave the rest of the photograph "
    "untouched: same framing, same colours, same weather, no added or removed objects, no people."
)


def photo_size(path):
    """Pick the API size closest to the photo's aspect ratio (PNG/JPEG header read)."""
    with open(path, "rb") as f:
        head = f.read(32)
        if head[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", head[16:24])
        else:  # JPEG: walk the segments to the SOF marker
            f.seek(2)
            w = h = 0
            while True:
                b = f.read(1)
                if not b:
                    break
                if b != b"\xff":
                    continue
                marker = f.read(1)
                while marker == b"\xff":
                    marker = f.read(1)
                if marker[0] in range(0xC0, 0xCF) and marker[0] not in (0xC4, 0xC8, 0xCC):
                    f.read(3)
                    h, w = struct.unpack(">HH", f.read(4))
                    break
                seglen = struct.unpack(">H", f.read(2))[0]
                f.seek(seglen - 2, 1)
    if not w or not h:
        return "auto"
    ratio = w / h
    return "1536x1024" if ratio > 1.1 else "1024x1536" if ratio < 0.9 else "1024x1024"


def multipart(fields, files):
    """Encode multipart/form-data. files: list of (fieldname, path)."""
    boundary = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n"
                 f"{v}\r\n").encode()
    for field, path in files:
        name = os.path.basename(path)
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; "
                 f"filename=\"{name}\"\r\nContent-Type: {ctype}\r\n\r\n").encode()
        with open(path, "rb") as f:
            body += f.read()
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


def render(scene, lang, args, api_key):
    photo = os.path.join(BASE, scene["photo"])
    art = os.path.join(BASE, ARTWORK[scene["artwork"]].format(lang=lang))
    out = os.path.join(OUT_DIR, lang, scene["name"] + ".png")
    for p in (photo, art):
        if not os.path.exists(p):
            sys.exit(f"error: missing input {p}")
    if os.path.exists(out) and not args.force:
        print(f"  skip {lang}/{scene['name']} (exists — use --force)")
        return
    size = args.size or photo_size(photo)
    prompt = scene["prompt"] + RULES

    if args.dry_run:
        print(f"  would render {lang}/{scene['name']}: {size} {args.quality} "
              f"<- {os.path.relpath(photo, BASE)} + {os.path.relpath(art, BASE)}")
        return

    fields = {"model": args.model, "prompt": prompt, "n": "1", "size": size,
              "quality": args.quality, "output_format": "png"}
    if args.model.startswith("gpt-image-1"):
        # gpt-image-2 rejects the parameter (fidelity is built in).
        fields["input_fidelity"] = "high"
    body, ctype = multipart(
        fields,
        # Photo first (it is the base scene), artwork second.
        [("image[]", photo), ("image[]", art)],
    )
    req = urllib.request.Request(
        API_URL, data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": ctype},
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"error: {e.code} {e.reason}\n{e.read().decode(errors='replace')[:800]}")

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(base64.b64decode(data["data"][0]["b64_json"]))
    usage = data.get("usage", {})
    print(f"  {lang}/{scene['name']}.png  {size} {args.quality}  "
          f"tokens in/out {usage.get('input_tokens','?')}/{usage.get('output_tokens','?')}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--langs", default="es,en", help="comma-separated (default es,en)")
    ap.add_argument("--only", help="comma-separated mockup names (default all)")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--quality", default="high", choices=["low", "medium", "high", "auto"])
    ap.add_argument("--size", help="override; default follows each photo's aspect")
    ap.add_argument("--force", action="store_true", help="overwrite existing mockups")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key and not args.dry_run:
        sys.exit("error: OPENAI_API_KEY is not set. `export OPENAI_API_KEY=...` first.")

    manifest = json.load(open(os.path.join(OUT_DIR, "mockups.json")))["mockups"]
    if args.only:
        wanted = set(args.only.split(","))
        manifest = [m for m in manifest if m["name"] in wanted]
        missing = wanted - {m["name"] for m in manifest}
        if missing:
            sys.exit(f"error: no such mockup(s): {', '.join(sorted(missing))}")

    for lang in args.langs.split(","):
        print(f"{lang}:")
        for scene in manifest:
            render(scene, lang, args, api_key)


if __name__ == "__main__":
    main()
