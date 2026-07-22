#!/usr/bin/env python3
"""Generate the explanatory diagrams for the site, one set per language.

These are *generated*, like the Telegram avatars: edit this script, never the
SVGs. Every string lives in STRINGS below, so a new language is a new dict, not
a new drawing.

    the-button   one button, two forms (phone / physical) -> one alert
    alert-flow   the six steps, from press to close
    roles        the three jobs in a Red Escudo

    graphics/diagrams/<lang>/<name>.svg

Rasterise with `export-png.py diagrams`, then `sync-to-site.py`. The site uses
the PNG (an <img>-loaded SVG can't reach the page's webfonts, so its text would
fall back); the SVG ships too, for print and for editing.

Usage:  python3 generate.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

VERDE = "#153f32"
AMBAR = "#e0a12e"
PAPEL = "#f7f8f6"
TINTA = "#22201c"
ROJO = "#d24435"
BLANCO = "#ffffff"

DISPLAY = "Bricolage Grotesque"
BODY = "Public Sans"

STRINGS = {
    "es": {
        "button_title": "Un botón, dos formas",
        "button_virtual": "Botón virtual",
        "button_virtual_sub": "Telegram, en el móvil",
        "button_virtual_note": "Pregunta qué tipo:",
        "button_options": ["Fuego", "Médico", "Delito", "Emergencia"],
        "button_quiet_note": "Y una que no suena:",
        "button_quiet_opt": "Pedir ayuda",
        "button_physical": "Botón físico",
        "button_physical_sub": "En la pared o colgante",
        "button_physical_note": "Sin pantalla, sin opciones:",
        "button_physical_opt": "Una pulsación",
        "button_status_built": "Funcionando",
        "button_status_planned": "Listo, falta el número",
        "button_result": "La misma alerta, al mismo grupo, a los mismos vecinos",
        "flow_title": "Cómo fluye una alerta",
        "flow": [
            ("Se da el aviso", ["Quien lo ve pulsa el botón.", "Antes, 062 o 112 si hace falta."]),
            ("Llega a todos", ["A la vez, a toda la Red.", "Sin centralita, sin turnos."]),
            ("Se responde", ["«Voy» en el grupo.", "El paso que nadie debe saltarse."]),
            ("Se acude", ["Observar, avisar, ayudar.", "Nunca intervenir ni perseguir."]),
            ("Falsa alarma", ["Un botón la cancela.", "Nadie tiene que dar explicaciones."]),
            ("Se cierra", ["Una línea en el grupo.", "Qué fue y quién acudió."]),
        ],
        "p-introducing": ("Presentar el escudo", [
            ("Junta Vecinal", ["Y el Ayuntamiento. Que se", "enteren por vosotros."]),
            ("Reunión de vecinos", ["En el bar o en el salón.", "Media hora, sin diapositivas."]),
            ("Altas allí mismo", ["Con los móviles en la mano.", "El papel no da de alta a nadie."]),
            ("Simulacro ese mes", ["Mientras es nuevo, antes de", "que nadie silencie el móvil."]),
        ]),
        "p-telegram": ("Alta en Telegram", [
            ("Entrar al grupo", ["Red Escudo <Pueblo>.", "Le mete un vecino que ya está."]),
            ("Abrir el botón", ["Pulsar EMPEZAR una vez.", "Hasta entonces, sin botones."]),
            ("Que suene", ["Grupo y botón, sin silencio.", "Se comprueba antes de irse."]),
            ("Mirar, no pulsar", ["Cada pulsación avisa a todo", "el pueblo. Solo simulacros."]),
        ]),
        "p-buttons": ("Alta de teléfonos y aparatos", [
            ("Elegirlo juntos", ["Nunca desde una lista.", "Una casa, un martes cualquiera."]),
            ("Llamar al número", ["Llama el propio aparato.", "El coordinador le pone nombre."]),
            ("Dar la dirección", ["Un aparato de pared no tiene GPS.", "Es adonde acuden los vecinos."]),
            ("Seguir probándolo", ["El bot lleva la rota.", "Sin prueba no hay garantía."]),
        ]),
        "p-drill": ("Simulacro", [
            ("Avisar", ["Dos veces al año. Se dice", "antes: esto es una prueba."]),
            ("El coordinador: /test", ["Solo administradores.", "Suena en todas las casas."]),
            ("Contar", ["Móviles que sonaron.", "Minutos hasta la primera respuesta."]),
            ("Arreglar", ["Los móviles que no sonaron.", "Ese es todo el trabajo."]),
        ]),
        "p-response_title": "Al acudir",
        "p-response_do": "Sí",
        "p-response_dont": "Nunca",
        "p-response_dos": [
            "Llamar antes al 062 o al 112",
            "Decirlo en el grupo: «voy»",
            "Ayudar desde un sitio seguro",
            "Describir conductas y vehículos",
            "Cancelar si es falsa alarma",
        ],
        "p-response_donts": [
            "Intervenir, perseguir o retener",
            "Entrar donde hay peligro",
            "Fotografiar a nadie",
            "Mencionar etnia u origen",
            "Contarlo fuera del grupo",
        ],
        "roles_title": "Quién hace qué",
        "roles": [
            ("Coordinador/a", "1", ["Responsable del conjunto.", "La lista, los simulacros y", "la cara ante la Junta", "Vecinal y el Ayuntamiento."]),
            ("Apoyos", "1–2", ["Las manos de la coordinación.", "Sientan a cada vecino a", "configurar el móvil hasta", "que funcione de verdad."]),
            ("Responsable técnico", "1", ["Monta y mantiene el bot,", "el grupo, el servidor y,", "si llega, la red de radio.", "Guarda el token."]),
        ],
    },
    "en": {
        "button_title": "One button, two forms",
        "button_virtual": "The virtual button",
        "button_virtual_sub": "Telegram, on a phone",
        "button_virtual_note": "Asks what kind:",
        "button_options": ["Fire", "Medical", "Crime", "Emergency"],
        "button_quiet_note": "And one that doesn't:",
        "button_quiet_opt": "Ask for help",
        "button_physical": "A physical button",
        "button_physical_sub": "On the wall, or worn",
        "button_physical_note": "No screen, no options:",
        "button_physical_opt": "One press",
        "button_status_built": "Built and in use",
        "button_status_planned": "Ready, needs a number",
        "button_result": "The same alert, into the same group, reaching the same people",
        "flow_title": "How an alert flows",
        "flow": [
            ("Raise it", ["Whoever notices presses.", "062 or 112 first if needed."]),
            ("It arrives", ["Every member at once.", "No dispatcher, no queue."]),
            ("Answer", ["Say “going” in the group.", "The step people skip."]),
            ("Go", ["Observe, report, help.", "Never intervene or pursue."]),
            ("Stand down", ["One button cancels it.", "Nobody is questioned."]),
            ("Close it off", ["One line in the group.", "What it was, who went."]),
        ],
        "p-introducing": ("Introducing the scheme", [
            ("The Junta Vecinal", ["And the Ayuntamiento. They", "hear it from you, not rumour."]),
            ("A village meeting", ["In the bar or the salón.", "Half an hour, no slides."]),
            ("Sign people up there", ["Phones in hand, same day.", "Paper signs nobody up."]),
            ("A drill that month", ["While it's new, before anyone", "has silenced their phone."]),
        ]),
        "p-telegram": ("Telegram onboarding", [
            ("Join the group", ["Red Escudo <Village>.", "A neighbour adds them, not you."]),
            ("Open the button", ["Press START once. Until then", "there are no buttons."]),
            ("Make it audible", ["Group and button, off silent.", "Proved before they leave."]),
            ("Look, don't press", ["Every press alarms the whole", "village. Drills only."]),
        ]),
        "p-buttons": ("Phone and device onboarding", [
            ("Chosen with them", ["Never from a list.", "One house, one Tuesday."]),
            ("Ring the number", ["The device calls it itself.", "The coordinator names it."]),
            ("Give the address", ["A wall unit has no GPS.", "It is where neighbours run."]),
            ("Keep testing it", ["The bot keeps the rota.", "Untested means unproven."]),
        ]),
        "p-drill": ("The drill", [
            ("Announce it", ["Twice a year. Say beforehand", "that it is a test."]),
            ("The Coordinator: /test", ["Admins only. It rings in", "every house in the village."]),
            ("Count", ["Phones that made a noise.", "Minutes to the first reply."]),
            ("Fix", ["The phones that stayed silent.", "That is the entire job."]),
        ]),
        "p-response_title": "When you go",
        "p-response_do": "Do",
        "p-response_dont": "Never",
        "p-response_dos": [
            "Call 062 or 112 first",
            "Say “going” in the group",
            "Help from somewhere safe",
            "Describe behaviour and vehicles",
            "Press False alarm if it's nothing",
        ],
        "p-response_donts": [
            "Intervene, pursue or detain",
            "Go in where it isn't safe",
            "Photograph anyone",
            "Mention ethnicity or origin",
            "Repeat it outside the group",
        ],
        "roles_title": "Who does what",
        "roles": [
            ("Coordinator", "1", ["Holds the whole thing.", "The list, the drills, and", "the known face for the Junta", "Vecinal and the Ayuntamiento."]),
            ("Assistants", "1–2", ["The coordinator’s hands.", "Sit next to each neighbour", "and get the phone working", "properly, there and then."]),
            ("Technical lead", "1", ["Runs the bot, the group,", "the server and — if it comes", "— the radio network.", "Holds the token."]),
        ],
    },
}


# --- drawing helpers -------------------------------------------------------

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def card(x, y, w, h, fill=BLANCO, stroke=VERDE, sw=2.5, r=14):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


def text(x, y, s, size=18, fill=TINTA, family=BODY, weight=400,
         anchor="start", opacity=1):
    return (f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" '
            f'opacity="{opacity}">{esc(s)}</text>')


def lines(x, y, ls, size=17, leading=25, **kw):
    return "".join(text(x, y + i * leading, l, size=size, **kw)
                   for i, l in enumerate(ls))


def chip(x, y, w, label, fill=VERDE, fg=PAPEL, h=34, size=16):
    return (card(x, y, w, h, fill=fill, stroke="none", sw=0, r=h / 2)
            + text(x + w / 2, y + h / 2 + 5.5, label, size=size, fill=fg,
                   family=BODY, weight=600, anchor="middle"))


def arrow_down(x, y1, y2, colour=VERDE):
    return (f'<path d="M{x} {y1} L{x} {y2 - 12}" stroke="{colour}" '
            f'stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M{x - 8} {y2 - 14} L{x} {y2} L{x + 8} {y2 - 14}" '
            f'fill="{colour}"/>')


def arrow_right(x1, x2, y, colour=VERDE, opacity=0.45):
    return (f'<g opacity="{opacity}"><path d="M{x1} {y} L{x2 - 12} {y}" '
            f'stroke="{colour}" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M{x2 - 14} {y - 8} L{x2} {y} L{x2 - 14} {y + 8}" '
            f'fill="{colour}"/></g>')


def numeral(cx, cy, n, r=21):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{AMBAR}"/>'
            + text(cx, cy + 7.5, str(n), size=21, fill=VERDE, family=DISPLAY,
                   weight=700, anchor="middle"))


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" '
            f'viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="{PAPEL}"/>{body}</svg>')


# --- the diagrams ----------------------------------------------------------

def the_button(t):
    W, H = 1200, 760
    b = [text(W / 2, 62, t["button_title"], size=40, fill=VERDE,
              family=DISPLAY, weight=700, anchor="middle")]

    for i, side in enumerate(("virtual", "physical")):
        x = 60 + i * 600
        b.append(card(x, 110, 540, 460))
        b.append(text(x + 40, 168, t[f"button_{side}"], size=27, fill=VERDE,
                      family=DISPLAY, weight=700))
        b.append(text(x + 40, 198, t[f"button_{side}_sub"], size=17,
                      opacity=0.7))

    # left: a phone, and the four options it offers
    b.append(card(100, 230, 150, 230, fill=PAPEL, stroke=TINTA, sw=2.5, r=18))
    b.append(f'<circle cx="175" cy="300" r="38" fill="{ROJO}"/>')
    b.append(text(175, 309, "SOS", size=22, fill=BLANCO, family=DISPLAY,
                  weight=700, anchor="middle"))
    b.append(f'<rect x="120" y="358" width="110" height="10" rx="5" '
             f'fill="{TINTA}" opacity="0.15"/>')
    b.append(f'<rect x="120" y="380" width="80" height="10" rx="5" '
             f'fill="{TINTA}" opacity="0.15"/>')
    b.append(text(285, 248, t["button_virtual_note"], size=17, opacity=0.7))
    for i, opt in enumerate(t["button_options"]):
        b.append(chip(285, 270 + i * 40, 260, opt, h=30, size=15))
    # The quiet tier, held apart from the four that wake the village.
    b.append(text(285, 448, t["button_quiet_note"], size=15, opacity=0.7))
    b.append(chip(285, 462, 260, t["button_quiet_opt"], fill=AMBAR, fg=VERDE,
                  h=32, size=15))

    # right: a button on a plate, and the one thing it does
    b.append(card(700, 265, 170, 170, fill=PAPEL, stroke=TINTA, sw=2.5, r=16))
    b.append(f'<circle cx="785" cy="350" r="56" fill="{ROJO}"/>')
    b.append(f'<circle cx="785" cy="350" r="56" fill="none" stroke="{TINTA}" '
             f'stroke-width="3" opacity="0.25"/>')
    b.append(text(785, 361, "SOS", size=28, fill=BLANCO, family=DISPLAY,
                  weight=700, anchor="middle"))
    b.append(text(885, 248, t["button_physical_note"], size=17, opacity=0.7))
    b.append(chip(885, 270, 260, t["button_physical_opt"]))

    # status, on each side
    b.append(chip(100, 528, 240, t["button_status_built"], fill=AMBAR,
                  fg=VERDE, h=30, size=14))
    b.append(chip(700, 528, 240, t["button_status_planned"], fill="none",
                  fg=VERDE, h=30, size=14))
    b.append(f'<rect x="700" y="528" width="240" height="30" rx="15" '
             f'fill="none" stroke="{VERDE}" stroke-width="2" opacity="0.5"/>')

    b.append(arrow_down(330, 600, 655))
    b.append(arrow_down(870, 600, 655))
    b.append(card(60, 655, 1080, 66, fill=VERDE, stroke="none", sw=0))
    b.append(text(W / 2, 696, t["button_result"], size=24, fill=PAPEL,
                  family=DISPLAY, weight=600, anchor="middle"))
    return svg(W, H, "".join(b))


def steps(title, items, first_is_alarm=False, muted=False):
    """Numbered cards, two columns. Every protocol diagram is one of these.

    Two columns, not six across: in a reading column a wide strip scales down
    until the body text is unreadable.
    """
    cw, ch, gx, gy = 390, 190, 40, 26
    rows = (len(items) + 1) // 2
    W, H = 900, 110 + rows * (ch + gy) - gy + 30
    b = [text(W / 2, 62, title, size=42, fill=VERDE, family=DISPLAY,
              weight=700, anchor="middle")]
    for i, (head, body) in enumerate(items):
        x = 40 + (i % 2) * (cw + gx)
        y = 110 + (i // 2) * (ch + gy)
        accent = ROJO if (first_is_alarm and i == 0) else VERDE
        b.append(f'<g opacity="0.55">' if muted else "")
        b.append(card(x, y, cw, ch, stroke=accent))
        b.append(numeral(x + 38, y + 44, i + 1, r=23))
        b.append(text(x + 78, y + 53, head, size=27, fill=accent,
                      family=DISPLAY, weight=700))
        b.append(lines(x + 26, y + 112, body, size=19, leading=28,
                       opacity=0.78))
        b.append("</g>" if muted else "")
    return svg(W, H, "".join(b))


def do_dont(t):
    """Two columns of rules: what you do, and what you never do."""
    cw, gx = 390, 40
    rows = max(len(t["p-response_dos"]), len(t["p-response_donts"]))
    W, H = 900, 175 + rows * 52 + 30
    b = [text(W / 2, 62, t["p-response_title"], size=42, fill=VERDE,
              family=DISPLAY, weight=700, anchor="middle")]
    cols = ((t["p-response_do"], t["p-response_dos"], VERDE),
            (t["p-response_dont"], t["p-response_donts"], ROJO))
    for c, (head, items, colour) in enumerate(cols):
        x = 40 + c * (cw + gx)
        b.append(chip(x, 105, 120, head, fill=colour, fg=PAPEL, h=36, size=18))
        for i, item in enumerate(items):
            y = 175 + i * 52
            b.append(card(x, y, cw, 42, stroke=colour, sw=2, r=8))
            b.append(text(x + 18, y + 28, item, size=18))
    return svg(W, H, "".join(b))


def roles(t):
    W, H = 900, 110 + ((len(t['roles']) + 1) // 2) * 266 + 4
    b = [text(W / 2, 62, t["roles_title"], size=42, fill=VERDE,
              family=DISPLAY, weight=700, anchor="middle")]
    cw, ch, gx, gy = 390, 240, 40, 26
    rows = (len(t["roles"]) + 1) // 2
    for i, (title, count, body) in enumerate(t["roles"]):
        # An odd last card is centred rather than left hanging beside a gap.
        alone = i == len(t["roles"]) - 1 and len(t["roles"]) % 2 == 1
        x = 40 + (gx + cw) / 2 if alone else 40 + (i % 2) * (cw + gx)
        y = 110 + (i // 2) * (ch + gy)
        b.append(card(x, y, cw, ch))
        b.append(text(x + 26, y + 52, title, size=26, fill=VERDE,
                      family=DISPLAY, weight=700))
        b.append(chip(x + 26, y + 68, min(len(count) * 11 + 40, cw - 52),
                      count, fill=AMBAR, fg=VERDE, h=30, size=15))
        b.append(lines(x + 26, y + 140, body, size=18, leading=26,
                       opacity=0.78))
    return svg(W, H, "".join(b))


DIAGRAMS = {
    "the-button": the_button,
    "alert-flow": lambda t: steps(t["flow_title"], t["flow"], first_is_alarm=True),
    "roles": roles,
    # One per protocol page. The physical-button one is drawn faded, because
    # that layer doesn't exist yet and the diagram shouldn't imply it does.
    "p-introducing": lambda t: steps(*t["p-introducing"]),
    "p-telegram": lambda t: steps(*t["p-telegram"]),
    "p-buttons": lambda t: steps(*t["p-buttons"]),
    "p-response": do_dont,
    "p-drill": lambda t: steps(*t["p-drill"]),
}


def main():
    for lang, t in STRINGS.items():
        out = os.path.join(HERE, lang)
        os.makedirs(out, exist_ok=True)
        for name, fn in DIAGRAMS.items():
            path = os.path.join(out, f"{name}.svg")
            with open(path, "w", encoding="utf-8") as f:
                f.write(fn(t))
            print(f"  {os.path.relpath(path, HERE)}")


if __name__ == "__main__":
    main()
