#!/usr/bin/env python3
"""Generate the circular Telegram avatars for the two Escudo elements.

Telegram crops avatars to a circle and shows them at ~50-70px in a chat list,
so these are NOT the crest: the quartered shield with four icons turns to mush
below about 128px. They are siblings of it — same shield silhouette, same
palette — simplified until they still read at thumbnail size.

  group-icon  "Red Escudo <Pueblo>"  — the shield inside a ring of linked
              nodes: the network of neighbours around what it protects.
  bot-icon    "Boton Escudo"         — the shield on a pressable amber disc
              with a signal radiating out: the virtual panic button.

These are generated rather than hand-drawn, so this script is the source: edit
it, don't nudge the SVG paths. Rasterising is the library-wide job of
`../export-png.py` — upload `png/<icon>-512.png` to Telegram.

Usage:  python3 generate.py        writes group-icon.svg and bot-icon.svg
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# Brand palette — mirrors website/assets/_custom.scss.
VERDE = "#153f32"
AMBAR = "#e0a12e"
PAPEL = "#f7f8f6"
# Rojo alarma. Reserved for the alarm itself; see the note in _custom.scss.
ROJO = "#d24435"

SIZE = 512
C = SIZE / 2

# The crest's shield outline, in its own 196x238 coordinate space.
SHIELD_D = ("M32 16 L168 16 Q180 16 180 28 L180 122 "
            "Q180 178 100 218 Q20 178 20 122 L20 28 Q20 16 32 16 Z")
SHIELD_W, SHIELD_H = 160, 202
SHIELD_CX, SHIELD_CY = 100, 117


def _shield_path(cx, cy, height, attrs):
    s = height / SHIELD_H
    tx, ty = cx - SHIELD_CX * s, cy - SHIELD_CY * s
    return (f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f})">'
            f'<path d="{SHIELD_D}" {attrs}/></g>')


def shield(cx, cy, height, fill, inner=None, inner_width=9):
    """The crest silhouette, with the crest's signature inset second border.

    The double border is the one detail that makes these read as family rather
    than as a generic shield, and a concentric inner line survives shrinking
    where the crest's quartering and four icons do not.
    """
    out = [_shield_path(cx, cy, height, f'fill="{fill}"')]
    if inner:
        # A second, smaller outline concentric with the first. Nudged up a
        # little because the shield's mass sits above its bounding-box centre.
        s = height / SHIELD_H
        out.append(_shield_path(
            cx, cy - height * 0.012, height * 0.80,
            f'fill="none" stroke="{inner}" stroke-width="{inner_width / (s * 0.80):.2f}"'
            ' stroke-linejoin="round"'))
    return "".join(out)


def svg(body, label):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" '
            f'width="{SIZE}" height="{SIZE}" role="img" aria-label="{label}">\n'
            f'{body}\n</svg>\n')


def disc(fill):
    return f'  <circle cx="{C}" cy="{C}" r="{C}" fill="{fill}"/>'


def group_icon():
    """Shield ringed by linked nodes — the network around what it protects."""
    nodes, ring = 6, 190
    # Start at -90 deg so a node sits dead centre top.
    pts = [(C + ring * math.cos(math.radians(-90 + i * 360 / nodes)),
            C + ring * math.sin(math.radians(-90 + i * 360 / nodes)))
           for i in range(nodes)]

    links = "".join(
        f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>'
        for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))

    dots = "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="27" fill="{AMBAR}"/>'
                   for x, y in pts)

    return svg("\n".join([
        disc(VERDE),
        # Links sit behind the shield so the ring reads as one connected
        # network, and are thick enough to survive a 64px chat-list thumbnail —
        # a hairline ring disappears there and leaves six loose dots.
        f'  <g stroke="{AMBAR}" stroke-width="13" opacity="0.7">{links}</g>',
        f'  <g>{dots}</g>',
        # Solid ámbar, no border: the shield reads as one of the network — the
        # same material as the nodes around it — rather than a separate object
        # sitting inside a ring.
        f'  {shield(C, C + 4, 238, AMBAR)}',
    ]), "Red Escudo")


def bot_icon():
    """Shield on a pressable disc, signal radiating — the virtual panic button."""
    def arc(r, width, opacity):
        # Two opposing arcs, open at the sides: a signal going out, not a ring.
        d = []
        for start in (-125, 55):
            a0, a1 = math.radians(start), math.radians(start + 70)
            x0, y0 = C + r * math.cos(a0), C + r * math.sin(a0)
            x1, y1 = C + r * math.cos(a1), C + r * math.sin(a1)
            d.append(f"M{x0:.1f} {y0:.1f} A{r} {r} 0 0 1 {x1:.1f} {y1:.1f}")
        return (f'  <g fill="none" stroke="{AMBAR}" stroke-width="{width}" '
                f'stroke-linecap="round" opacity="{opacity}">'
                f'<path d="{" ".join(d)}"/></g>')

    # SOS sits where the crest's quartering would be. It is the one word that
    # needs no translating and no explaining, which is the whole job of this
    # icon: the thing you press when you need help.
    # Set above the geometric centre: the shield tapers to a point, so its
    # optical centre sits higher than its bounding box suggests.
    sos = (f'  <text x="{C}" y="{C + 13}" text-anchor="middle" fill="{AMBAR}" '
           f'font-family="Bricolage Grotesque" font-weight="800" font-size="55" '
           f'letter-spacing="1">SOS</text>')

    return svg("\n".join([
        disc(VERDE),
        arc(233, 17, 0.45),
        arc(197, 20, 0.85),
        # The button face. No rim and no second shield border: at thumbnail size
        # every extra line competes with the word, and the word is the message.
        f'  <circle cx="{C}" cy="{C}" r="152" fill="{ROJO}"/>',
        f'  {shield(C, C + 3, 176, VERDE)}',
        sos,
    ]), "Boton Escudo")


ICONS = {"group-icon": group_icon, "bot-icon": bot_icon}

if __name__ == "__main__":
    for name, build in ICONS.items():
        with open(os.path.join(HERE, f"{name}.svg"), "w") as f:
            f.write(build())
        print(f"{name}.svg")
    print("\nNow run ../export-png.py telegram to rasterise.")
