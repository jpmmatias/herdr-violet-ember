from pathlib import Path
import re
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "mods/ember-companion/ember.svg"
OUTPUT = ROOT / "mods/ember-companion/animation"
BASE = SOURCE.read_text()
EYES = re.compile(r'  <path d="M65 108.*?<g fill="#FFFFFF">.*?</g>', re.S)
MOUTH = '<path d="M96 143Q104 151 113 142" fill="none" stroke="#A45D79" stroke-width="2" stroke-linecap="round"/>'


def eyes(closed=False, glance=0, concerned=False, happy=False):
    if closed or happy:
        curve = 104 if happy else 122
        return f'<path d="M68 115Q78 {curve} 88 115M122 115Q132 {curve} 142 115" fill="none" stroke="#302A40" stroke-width="3" stroke-linecap="round"/>'
    brows = "M65 107L89 101M119 101L144 107" if concerned else "M65 108Q77 99 89 109M119 109Q132 99 144 108"
    return f'''<path d="{brows}" fill="none" stroke="#302A40" stroke-width="3" stroke-linecap="round"/>
  <g transform="translate({glance} 0)">
    <ellipse cx="78" cy="115" rx="8" ry="12" fill="#755BB2"/><ellipse cx="132" cy="115" rx="8" ry="12" fill="#755BB2"/>
    <ellipse cx="79" cy="118" rx="4" ry="7" fill="#302A40"/><ellipse cx="131" cy="118" rx="4" ry="7" fill="#302A40"/>
    <g fill="#FFFFFF"><circle cx="76" cy="110" r="3"/><circle cx="130" cy="110" r="3"/></g>
  </g>'''


def frame(state, index):
    eye_markup = eyes(
        closed=state == "sleeping" or (state in ("idle", "working", "blocked") and index == 2),
        glance=(-3 if index == 1 else 3) if state == "working" else 0,
        concerned=state == "blocked",
        happy=state == "done",
    )
    svg, replacements = EYES.subn(lambda _: "  " + eye_markup, BASE)
    if replacements != 1 or MOUTH not in svg:
        raise ValueError("Ember source face changed. Update the animation generator.")
    mouths = {
        "working": '<path d="M98 144L110 144" fill="none" stroke="#A45D79" stroke-width="2" stroke-linecap="round"/>',
        "blocked": '<path d="M96 148Q104 140 113 148" fill="none" stroke="#A45D79" stroke-width="2" stroke-linecap="round"/>',
        "done": '<path d="M94 141Q104 162 115 141Z" fill="#A45D79"/>',
        "sleeping": '<ellipse cx="104" cy="145" rx="4" ry="3" fill="#A45D79"/>',
    }
    svg = svg.replace(MOUTH, mouths.get(state, MOUTH))
    decoration = ""
    if state == "working":
        decoration = '<g fill="#E1D7FF">' + ''.join(
            f'<circle cx="{160 + i * 13}" cy="{32 - (4 if index == i else 0)}" r="{4 if index == i else 2}"/>'
            for i in range(3)
        ) + '</g>'
    elif state == "done":
        decoration = '<g stroke="#FFD68A" stroke-width="3" stroke-linecap="round">' + ''.join(
            f'<path d="M{x} {y}v8m-4-4h8"/>'
            for x, y in ((24, 73 - index * 3), (182, 57 + index * 3), (171, 180 - index * 4))
        ) + '</g>'
    elif state == "sleeping":
        y = 36 - index * 3
        decoration = f'<path d="M168 {y}h12l-12 12h12M186 {y - 14}h9l-9 9h9" fill="none" stroke="#C7B6F4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    svg = svg.replace('</svg>', decoration + '\n</svg>')
    ET.fromstring(svg)
    return svg


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for state in ("idle", "working", "blocked", "done", "sleeping"):
        for index in range(3):
            (OUTPUT / f"{state}-{index}.svg").write_text(frame(state, index))
    print("Generated 15 native Ember SVG frames.")


if __name__ == "__main__":
    main()
