#!/usr/bin/env python3
"""Draw every Ink Tools icon in the Supernote's native outline style from Tabler Icons (#271).

`design/icons/icons.json` names each icon's Tabler outline glyphs (one per meaning, or several placed
side by side); `design/icons/tabler.json` keeps those glyphs from the pinned `@tabler/icons` package
(MIT, NOTICE.md); `design/icons/native.json` holds the native measurements (stroke, colour, caps,
margin). This script writes, for each icon, the SVG and the 96 x 96 PNG beside a plugin's button (or
the vector XML of an app's launcher icon), so no icon drifts from its source.

    python3 scripts/icons.py            write every file and design/icons/sheet.png (needs rsvg-convert)
    python3 scripts/icons.py --check    fail when a written SVG or XML differs from its source
    python3 scripts/icons.py --tabler DIR
                                        refresh design/icons/tabler.json from an unpacked
                                        @tabler/icons package of the pinned version
    python3 scripts/icons.py --sheet DIR [--native DIR]
                                        write DIR/sheet.png: every icon at tablet size, after the
                                        native SVGs and PNGs in --native when given, and
                                        sheet-light-<small|default|large>.png at 48, 96 and 192 px
"""
import argparse
import base64
import json
import math
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts
ROOT = Path(__file__).resolve().parent.parent
SET = ROOT / "design" / "icons" / "icons.json"
NATIVE = ROOT / "design" / "icons" / "native.json"
TABLER = ROOT / "design" / "icons" / "tabler.json"
PLUGIN_PX = 96
SVG_NS = "http://www.w3.org/2000/svg"
ANDROID_NS = "http://schemas.android.com/apk/res/android"
SHEET_ZOOMS = {"small": 0.5, "default": 1, "large": 2}  # 48, 96 and 192 px icons


def load(root=ROOT):
    """(icons, native measurements) from the two JSON files under `root`."""
    icons = json.loads((root / "design/icons/icons.json").read_text())["icons"]
    native = json.loads((root / "design/icons/native.json").read_text())
    return icons, native


def glyphs(root=ROOT):
    """The Tabler store: {"version", "grid", "glyphs": {name: [path data]}, ...}."""
    return json.loads((root / "design/icons/tabler.json").read_text())


# An SVG path, read as commands: Tabler writes relative commands and number runs such as `-.657`.
COMMAND = re.compile(r"([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)")
NUMBER = re.compile(r"-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
ARITY = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}


def absolute(d):
    """Path `d` as [(command, numbers)] with absolute M L H V C Q A Z only: S and T become C and Q, so
    the gate reads every coordinate where it lands."""
    out, x, y, start, cubic, quad = [], 0.0, 0.0, (0.0, 0.0), None, None
    for letter, args in COMMAND.findall(d):
        up, rel = letter.upper(), letter.islower()
        if up == "Z":
            out.append(("Z", []))
            (x, y), cubic, quad = start, None, None
            continue
        values = [float(n) for n in NUMBER.findall(args)]
        size = ARITY[up]
        for i in range(0, len(values), size):
            v, ox, oy = values[i : i + size], (x if rel else 0.0), (y if rel else 0.0)
            command = "L" if up == "M" and i else up
            new_cubic = new_quad = None
            if command in "ML":
                x, y = v[0] + ox, v[1] + oy
                out.append((command, [x, y]))
                if command == "M":
                    start = (x, y)
            elif command == "H":
                x = v[0] + ox
                out.append(("H", [x]))
            elif command == "V":
                y = v[0] + oy
                out.append(("V", [y]))
            elif command in "CS":
                # Pairs of x y, moved by the current point when relative; S's first control mirrors the last.
                pairs = [(px + ox, py + oy) for px, py in zip(v[::2], v[1::2])]
                mirror = (2 * x - cubic[0], 2 * y - cubic[1]) if cubic else (x, y)
                first, second, (x, y) = [mirror] + pairs if command == "S" else pairs
                out.append(("C", [*first, *second, x, y]))
                new_cubic = second
            elif command in "QT":
                pairs = [(px + ox, py + oy) for px, py in zip(v[::2], v[1::2])]
                mirror = (2 * x - quad[0], 2 * y - quad[1]) if quad else (x, y)
                control, (x, y) = [mirror] + pairs if command == "T" else pairs
                out.append(("Q", [*control, x, y]))
                new_quad = control
            elif command == "A":
                *shape, ex, ey = v  # radii, angle and flags stay; the end point moves
                x, y = ex + ox, ey + oy
                out.append(("A", [*shape, x, y]))
            cubic, quad = new_cubic, new_quad
    return out


def place(segments, scale=1.0, at=(0.0, 0.0)):
    """Absolute segments scaled about the origin, then moved by `at`; an arc's radii scale, its angle
    and flags stay."""
    def x(v):
        return v * scale + at[0]

    def y(v):
        return v * scale + at[1]

    out = []
    for command, v in segments:
        if command == "H":
            v = [x(v[0])]
        elif command == "V":
            v = [y(v[0])]
        elif command == "A":
            rx, ry, *turn, ex, ey = v
            v = [rx * scale, ry * scale, *turn, x(ex), y(ey)]
        else:
            v = [x(n) if i % 2 == 0 else y(n) for i, n in enumerate(v)]
        out.append((command, v))
    return out


STEPS = 64  # points sampled along each curve or arc


def arc_points(x1, y1, rx, ry, phi, large, sweep, x2, y2):
    """Points along an SVG arc, by the endpoint-to-centre conversion of SVG 1.1 F.6.5."""
    if (x1, y1) == (x2, y2):
        return []
    if not rx or not ry:
        return [(x2, y2)]
    cos, sin = math.cos(math.radians(phi)), math.sin(math.radians(phi))
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    xp, yp = cos * dx + sin * dy, -sin * dx + cos * dy
    rx, ry = abs(rx), abs(ry)
    grow = xp * xp / (rx * rx) + yp * yp / (ry * ry)
    if grow > 1:
        rx, ry = rx * math.sqrt(grow), ry * math.sqrt(grow)
    num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    root = math.sqrt(max(0.0, num / (rx * rx * yp * yp + ry * ry * xp * xp)))
    if large == sweep:
        root = -root
    cxp, cyp = root * rx * yp / ry, -root * ry * xp / rx
    cx, cy = cos * cxp - sin * cyp + (x1 + x2) / 2, sin * cxp + cos * cyp + (y1 + y2) / 2
    start = math.atan2((yp - cyp) / ry, (xp - cxp) / rx)
    delta = math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - start
    if sweep and delta < 0:
        delta += 2 * math.pi
    elif not sweep and delta > 0:
        delta -= 2 * math.pi
    out = []
    for i in range(1, STEPS + 1):
        t = start + delta * i / STEPS
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        out.append((cos * ex - sin * ey + cx, sin * ex + cos * ey + cy))
    return out


def outline_box(paths, stroke):
    """(left, top, right, bottom) of the stroke outline of absolute paths with round caps and joins:
    the box of every point the centreline passes, curves and arcs included, grown by half the stroke."""
    points = []
    for d in paths:
        x = y = 0.0
        start = (0.0, 0.0)
        for command, args in COMMAND.findall(d):
            v = [float(n) for n in NUMBER.findall(args)]
            if command == "M":
                start = (v[0], v[1])
            if command in "ML":
                for i in range(0, len(v), 2):
                    x, y = v[i], v[i + 1]
                    points.append((x, y))
            elif command in "HV":
                for value in v:
                    x, y = (value, y) if command == "H" else (x, value)
                    points.append((x, y))
            elif command in "CQ":
                size = ARITY[command]
                for i in range(0, len(v), size):
                    group = v[i : i + size]
                    ctrl = [(x, y)] + list(zip(group[::2], group[1::2]))
                    for step in range(1, STEPS + 1):
                        t, pts = step / STEPS, ctrl
                        while len(pts) > 1:  # de Casteljau
                            pts = [((1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]) for a, b in zip(pts, pts[1:])]
                        points.append(pts[0])
                    x, y = ctrl[-1]
            elif command == "A":
                for i in range(0, len(v), ARITY["A"]):
                    *shape, ex, ey = v[i : i + ARITY["A"]]
                    points += arc_points(x, y, *shape, ex, ey)
                    x, y = ex, ey
            elif command == "Z":
                x, y = start
    half = stroke / 2
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs) - half, min(ys) - half, max(xs) + half, max(ys) + half


def number(value):
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def path_text(segments):
    return " ".join(command + " ".join(number(n) for n in v) for command, v in segments)


def frame(kind, native):
    """(grid, padding, stroke) of an icon kind: a plugin icon on Tabler's grid with the toolbar icons'
    margin and stroke ratio, an app's launcher icon on the native launcher icons' 48 grid."""
    if kind == "app":
        v = native["vector"]
        return v["viewport"], 0, v["strokeWidth"]
    p = native["plugin"]
    return p["grid"], p["padding"], p["strokeWidth"]


def ink_span(kind, native):
    """The share of its box an icon's stroke outline spans, on its longer side: the native toolbar
    icons' for a plugin icon, the native launcher icons' for an app's, each a little under, so
    rounding never crosses their margin."""
    if kind == "app":
        return native["vector"]["inkSpan"] / native["vector"]["viewport"]
    return native["plugin"]["toolbar"]["inkSpanPx"] / native["plugin"]["toolbar"]["sizePx"]


def icon_paths(icon, native, store):
    """The absolute stroke paths of an icon on its frame's grid, from its Tabler glyphs: placed as
    icons.json says, then scaled about their centre so the outline spans the native share of the
    box and centred in it, as the native icons are (interface audit, #271)."""
    grid, pad, stroke = frame(icon["kind"], native)
    parts = []
    for part in icon["tabler"]:
        part = {"name": part} if isinstance(part, str) else part
        for d in store["glyphs"][part["name"]]:
            parts.append(place(absolute(d), part.get("scale", 1), part.get("at", (0, 0))))
    left, top, right, bottom = outline_box([path_text(p) for p in parts], 0)
    grow = (ink_span(icon["kind"], native) * (grid + 2 * pad) - stroke) / max(right - left, bottom - top)
    shift = (grid / 2 - grow * (left + right) / 2, grid / 2 - grow * (top + bottom) / 2)
    return [path_text(place(p, grow, shift)) for p in parts]


def view_box(grid, pad=0):
    """The grid with `pad` units around it, as an SVG viewBox."""
    return f"{number(-pad)} {number(-pad)} {number(grid + 2 * pad)} {number(grid + 2 * pad)}"


def svg_text(paths, native, size=PLUGIN_PX, kind="plugin"):
    v = native["vector"]
    grid, pad, stroke = frame(kind, native)
    body = "\n".join(f'  <path d="{d}"/>' for d in paths)
    return (
        f'<svg xmlns="{SVG_NS}" viewBox="{view_box(grid, pad)}" '
        f'width="{size}" height="{size}" fill="none" stroke="{v["strokeColor"]}" '
        f'stroke-width="{number(stroke)}" stroke-linecap="{v["lineCap"]}" '
        f'stroke-linejoin="{v["lineJoin"]}">\n  <!-- Generated by scripts/icons.py from '
        f"design/icons/icons.json and Tabler Icons (MIT, NOTICE.md) (#271); edit icons.json. -->\n{body}\n</svg>\n"
    )


def xml_text(paths, native):
    v = native["vector"]
    body = "\n".join(
        f'  <path\n      android:fillColor="#00000000"\n      android:strokeColor="{v["strokeColor"]}"\n'
        f'      android:strokeWidth="{v["strokeWidth"]}"\n      android:strokeLineCap="{v["lineCap"]}"\n'
        f'      android:strokeLineJoin="{v["lineJoin"]}"\n      android:pathData="{d}" />'
        for d in paths
    )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<!-- Generated by scripts/icons.py from design/icons/icons.json and Tabler Icons (MIT, NOTICE.md) (#271); edit icons.json. -->\n"
        f'<vector xmlns:android="{ANDROID_NS}"\n'
        f'    android:width="{v["sizeDp"]}dp"\n    android:height="{v["sizeDp"]}dp"\n'
        f'    android:viewportWidth="{v["viewport"]}"\n    android:viewportHeight="{v["viewport"]}">\n{body}\n</vector>\n'
    )


def texts(root=ROOT):
    """{relative path: text} of every generated SVG and XML."""
    icons, native = load(root)
    store = glyphs(root)
    out = {}
    for icon in icons:
        paths = icon_paths(icon, native, store)
        if icon["kind"] == "app":
            out[icon["out"] + ".xml"] = xml_text(paths, native)
        else:
            out[icon["out"] + ".svg"] = svg_text(paths, native)
    return out


def vendor(package_dir, root=ROOT):
    """Refresh tabler.json with exactly the glyphs icons.json names, from an unpacked @tabler/icons
    package of the pinned version; a missing name or another version raises."""
    package_dir = Path(package_dir)
    store = glyphs(root)
    version = json.loads((package_dir / "package.json").read_text())["version"]
    if version != store["version"]:
        raise SystemExit(f"icons: the package is {version}; tabler.json pins {store['version']}")
    nodes = json.loads((package_dir / "tabler-nodes-outline.json").read_text())
    icons, _ = load(root)
    names = sorted({p if isinstance(p, str) else p["name"] for i in icons for p in i["tabler"]})
    missing = [n for n in names if n not in nodes]
    if missing:
        raise SystemExit(f"icons: Tabler {version} has no {', '.join(missing)}")
    store["glyphs"] = {n: [a["d"] for tag, a in nodes[n] if tag == "path"] for n in names}
    (root / "design/icons/tabler.json").write_text(json.dumps(store, indent=1, ensure_ascii=False) + "\n")


def render_png(svg, png, px):
    subprocess.run(
        ["rsvg-convert", "-w", str(px), "-h", str(px), "-o", str(png), str(svg)], check=True
    )


def write(root=ROOT):
    icons, _ = load(root)
    for rel, text in texts(root).items():
        (root / rel).write_text(text)
    for icon in icons:
        if icon["kind"] != "plugin":
            continue
        svg = root / (icon["out"] + ".svg")
        render_png(svg, root / (icon["out"] + ".png"), PLUGIN_PX)
        for px in icon.get("extraPng", []):
            render_png(svg, root / f'{icon["out"]}-{px}.png', px)


def check(root=ROOT):
    """The generated files that are missing or differ from their source."""
    return [
        rel
        for rel, text in texts(root).items()
        if not (root / rel).is_file() or (root / rel).read_text() != text
    ]


def sheet(out_dir, native_dir=None, sizes=False):
    """DIR/sheet.png: each Ink Tools icon at its tablet size (96 px) on white in a thin box, labelled;
    the native SVGs of `native_dir` first, so a pair that reads alike or a cut stroke shows at a glance."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    icons, native = load()
    store = glyphs()
    layout = json.loads(SET.read_text())["sheet"]  # cell size, padding and caption position, in px
    cells = []
    if native_dir:  # native launcher SVGs and native toolbar PNGs, each scaled to the cell
        for file in sorted(Path(native_dir).glob("*.svg")) + sorted(Path(native_dir).glob("*.png")):
            if file.suffix == ".svg":
                art = file.read_text()
            else:
                data = base64.b64encode(file.read_bytes()).decode()
                art = f'<svg width="{PLUGIN_PX}" height="{PLUGIN_PX}"><image width="{PLUGIN_PX}" height="{PLUGIN_PX}" href="data:image/png;base64,{data}"/></svg>'
            cells.append(("native / " + file.stem.removeprefix("native-"), art))
    for icon in icons:
        parts_ = icon["out"].split("/")
        cells.append((f"{parts_[1]} / {parts_[-1]}", svg_text(icon_paths(icon, native, store), native, kind=icon["kind"])))
    rows = -(-len(cells) // layout["columns"])
    parts = [
        f'<svg xmlns="{SVG_NS}" width="{layout["columns"] * layout["cellWidth"]}" height="{rows * layout["cellHeight"]}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
    ]
    for n, (label, svg) in enumerate(cells):
        x, y = n % layout["columns"] * layout["cellWidth"] + layout["padX"], n // layout["columns"] * layout["cellHeight"] + layout["padY"]
        inner = re.sub(r"<svg[^>]*>", lambda m: re.sub(r' xmlns="[^"]*"', "", m.group(0)), svg, count=1)
        parts.append(f'<g transform="translate({x} {y})">{inner}</g>')
        # The icon's box, so a stroke that comes near or past its edge shows (owner review, #271).
        edge, side = layout["boxOffset"], PLUGIN_PX + 2 * layout["boxOffset"]  # a 1 px line just outside the icon
        parts.append(f'<rect x="{x - edge}" y="{y - edge}" width="{side}" height="{side}" fill="none" stroke="{layout["boxColor"]}"/>')
        for row, line in enumerate(label.split(" / ", 1)):
            parts.append(
                f'<text x="{x + layout["labelX"]}" y="{y + layout["labelY"] + row * layout["labelStep"]}" font-family="sans-serif" font-size="{layout["labelSize"]}" '
                f'text-anchor="middle" fill="#000000">{line}</text>'
            )
    parts.append("</svg>")
    svg_file = out_dir / "sheet.svg"
    svg_file.write_text("\n".join(parts))
    subprocess.run(["rsvg-convert", "-o", str(out_dir / "sheet.png"), str(svg_file)], check=True)
    for name, zoom in SHEET_ZOOMS.items() if sizes else ():  # the renders `render_evidence.py` asks for: light only, e-ink has no dark
        subprocess.run(["rsvg-convert", "-z", str(zoom), "-o", str(out_dir / f"sheet-light-{name}.png"), str(svg_file)], check=True)
    svg_file.unlink()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--sheet")
    ap.add_argument("--native")
    ap.add_argument("--tabler")
    args = ap.parse_args(argv)
    if args.tabler:
        vendor(args.tabler)
        return 0
    if args.check:
        stale = check()
        for rel in stale:
            print(f"icons: {rel} differs from design/icons/icons.json; run python3 scripts/icons.py")
        print("icons: ok" if not stale else f"icons: {len(stale)} stale")
        return 1 if stale else 0
    if args.sheet:
        sheet(args.sheet, args.native, sizes=True)
        return 0
    write()
    sheet(ROOT / "design" / "icons")
    return 0


if __name__ == "__main__":
    sys.exit(main())
