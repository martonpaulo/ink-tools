#!/usr/bin/env python3
"""Draw every Ink Tools icon in the Supernote's native outline style from Tabler Icons (#271).

`design/icons/icons.json` names each icon's Tabler outline glyphs (one per meaning, or several placed
side by side); `design/icons/tabler.json` keeps those glyphs from the pinned `@tabler/icons` package
(MIT, NOTICE.md); `design/icons/native.json` holds the native measurements (stroke, colour, caps,
margin). This script writes, for each icon, the SVG and the 96 x 96 PNG beside a plugin's button (or
the vector XML of an app's launcher icon), so no icon drifts from its source.

    python3 scripts/icons.py            write every file, the README tiles and the landing page's icons
                                        (site/icons) included, and design/icons/sheet.png (needs rsvg-convert)
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
import hashlib
import json
import math
import re
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts
ROOT = Path(__file__).resolve().parent.parent
SET = ROOT / "design" / "icons" / "icons.json"
NATIVE = ROOT / "design" / "icons" / "native.json"
TABLER = ROOT / "design" / "icons" / "tabler.json"
PLUGIN_PX = 96
SVG_NS = "http://www.w3.org/2000/svg"
SVG_OPEN = f'<svg xmlns="{SVG_NS}"'
PNG_CHUNK_FRAME = 12  # a PNG chunk's length, type and checksum around its data
RGB_CHANNELS = 3  # the red, green and blue of an icon.json fill
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


DISCRIMINANT = 4  # b*b - 4ac, a segment against a circle
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


def polylines(segments):
    """The points an absolute path passes, one list per subpath: lines as they are, curves and arcs
    sampled."""
    out, x, y, start = [], 0.0, 0.0, (0.0, 0.0)
    for command, v in segments:
        if command == "M":
            x, y = v
            start = (x, y)
            out.append([(x, y)])
            continue
        if command == "L":
            x, y = v
            points = [(x, y)]
        elif command in "HV":
            x, y = (v[0], y) if command == "H" else (x, v[0])
            points = [(x, y)]
        elif command in "CQ":
            ctrl = [(x, y)] + list(zip(v[::2], v[1::2]))
            points = []
            for step in range(1, STEPS + 1):
                t, pts = step / STEPS, ctrl
                while len(pts) > 1:  # de Casteljau
                    pts = [((1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]) for a, b in zip(pts, pts[1:])]
                points.append(pts[0])
            x, y = ctrl[-1]
        elif command == "A":
            *shape, ex, ey = v
            points = arc_points(x, y, *shape, ex, ey)
            x, y = ex, ey
        else:  # Z
            x, y = start
            points = [start]
        out[-1] += points
    return out


def outline_box(paths, stroke):
    """(left, top, right, bottom) of the stroke outline of absolute paths with round caps and joins:
    the box of every point the centreline passes, curves and arcs included, grown by half the stroke."""
    points = [p for d in paths for line in polylines(absolute(d)) for p in line]
    half = stroke / 2
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs) - half, min(ys) - half, max(xs) + half, max(ys) + half


def inside(a, b, ring):
    """The part (t0, t1) of segment a-b inside the circle (cx, cy, r), or None."""
    cx, cy, r = ring
    dx, dy = b[0] - a[0], b[1] - a[1]
    fx, fy = a[0] - cx, a[1] - cy
    qa, qb, qc = dx * dx + dy * dy, 2 * (fx * dx + fy * dy), fx * fx + fy * fy - r * r
    if qa == 0:
        return (0.0, 1.0) if qc < 0 else None
    root = qb * qb - DISCRIMINANT * qa * qc
    if root <= 0:
        return None
    root = math.sqrt(root)
    t0, t1 = max(0.0, (-qb - root) / (2 * qa)), min(1.0, (-qb + root) / (2 * qa))
    return (t0, t1) if t0 < t1 else None


def cut(line, ring):
    """The pieces of a polyline that lie outside the circle."""
    pieces, piece = [], [line[0]]
    for a, b in zip(line, line[1:]):
        span = inside(a, b, ring)
        if span is None:
            piece.append(b)
            continue
        t0, t1 = span
        if t0 > 0:
            piece.append((a[0] + t0 * (b[0] - a[0]), a[1] + t0 * (b[1] - a[1])))
        pieces.append(piece)
        piece = [(a[0] + t1 * (b[0] - a[0]), a[1] + t1 * (b[1] - a[1]))]
        if t1 < 1:
            piece.append(b)
    pieces.append(piece)
    return [p for p in pieces if len(set(p)) > 1]


def mirror(segments, axis, grid):
    """Absolute segments flipped across the grid's middle: x for left and right, y for top and
    bottom; an arc turns the other way."""
    flip_x, flip_y = axis == "x", axis == "y"

    def x(v):
        return grid - v if flip_x else v

    def y(v):
        return grid - v if flip_y else v

    out = []
    for command, v in segments:
        if command == "H":
            v = [x(v[0])]
        elif command == "V":
            v = [y(v[0])]
        elif command == "A":
            rx, ry, turn, large, sweep, ex, ey = v
            v = [rx, ry, -turn, large, 1 - sweep, x(ex), y(ey)]
        else:
            v = [x(n) if i % 2 == 0 else y(n) for i, n in enumerate(v)]
        out.append((command, v))
    return out


def number(value):
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def path_text(segments):
    return " ".join(command + " ".join(number(n) for n in v) for command, v in segments)


def frame(kind, native):
    """(grid, padding, stroke) of an icon kind: a plugin icon on Tabler's grid with the reference
    plugin icons' stroke share of the box (#450), an app's launcher icon on the native launcher icons'
    48 grid."""
    if kind == "app":
        v = native["vector"]
        return v["viewport"], 0, v["strokeWidth"]
    p = native["plugin"]
    ref = plugin_reference(native)
    return p["grid"], p["padding"], (p["grid"] + 2 * p["padding"]) * ref["strokePx"] / ref["sizePx"]


# A quarter pixel of the reference's own size, half a pixel of a 96 px plugin icon: the fitted span
# stays that much under the reference's, so anti-aliasing never crosses its margin (#450).
SPAN_UNDER_PX = 0.25


def plugin_reference(native):
    """The measured icons a plugin icon is sized and stroked to: native.json's plugin `reference`,
    the official plugins' own icon since the owner found ours smaller than theirs (#450)."""
    return native["plugin"][native["plugin"]["reference"]]


def ink_span(kind, native):
    """The share of its box an icon's stroke outline spans, on its longer side: the reference plugin
    icons' for a plugin icon (#450), the native launcher icons' for an app's, a little under, so
    rounding never crosses their margin."""
    if kind == "app":
        return native["vector"]["inkSpan"] / native["vector"]["viewport"]
    ref = plugin_reference(native)
    return (ref["inkSpanPx"] - SPAN_UNDER_PX) / ref["sizePx"]


def badge_placing(store):
    """Where a badge glyph goes: icons.json's `badge` scale, offset and gap."""
    return json.loads(SET.read_text())["badge"]


def icon_paths(icon, native, store):
    """The absolute stroke paths of an icon on its frame's grid, from its Tabler glyphs: placed as
    icons.json says, then scaled about their centre so the outline spans the native share of the
    box and centred in it, as the native icons are (interface audit, #271)."""
    grid, pad, stroke = frame(icon["kind"], native)
    parts, kept = [], []  # kept: the parts no badge may cut, such as a letter the badge sits beside
    for part in icon["tabler"]:
        part = {"name": part} if isinstance(part, str) else part
        placing = {**badge_placing(store), **part} if part.get("badge") else part  # a badge may set its own scale
        glyph = store["glyphs"][part["name"]]
        glyph = [glyph[i] for i in part["paths"]] if "paths" in part else glyph  # some of a glyph's paths only
        segments = [absolute(d) for d in glyph]
        if "mirror" in part:  # "x" flips left and right, "y" top and bottom, on the glyph's grid
            segments = [mirror(s, part["mirror"], store["grid"]) for s in segments]
        mine = [place(s, placing.get("scale", 1), placing.get("at", (0, 0))) for s in segments]
        if part.get("badge"):  # a knocked-out ring: it cuts the strokes drawn before it, `gap` clear of its own
            points = [q for p in mine for line in polylines(p) for q in line]
            left, top, right, bottom = outline_box([path_text(p) for p in mine], 0)
            centre = ((left + right) / 2, (top + bottom) / 2)
            ring = (*centre, max(math.dist(centre, q) for q in points) + placing["gap"])
            cut_parts = []
            for p in parts:
                lines = polylines(p)
                if not any(inside(a, b, ring) for line in lines for a, b in zip(line, line[1:])):
                    cut_parts.append(p)  # untouched: it keeps its curves
                    continue
                cut_parts += [[("M", list(piece[0]))] + [("L", list(q)) for q in piece[1:]] for line in lines for piece in cut(line, ring)]
            parts = cut_parts
        (kept if part.get("keep") else parts).extend(mine)
    parts += kept
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
        f'{SVG_OPEN} viewBox="{view_box(grid, pad)}" '
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


def tool(out):
    """The tool an icon belongs to: its plugin or app folder, or a planned tool's folder."""
    parts = out.split("/")
    return parts[1] if parts[0] in ("plugins", "apps") else parts[-2]


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
    names = sorted({p if isinstance(p, str) else p["name"] for i in [*icons, *site_icons(root).values()] for p in i["tabler"]})
    missing = [n for n in names if n not in nodes]
    if missing:
        raise SystemExit(f"icons: Tabler {version} has no {', '.join(missing)}")
    store["glyphs"] = {n: [a["d"] for tag, a in nodes[n] if tag == "path"] for n in names}
    (root / "design/icons/tabler.json").write_text(json.dumps(store, indent=1, ensure_ascii=False) + "\n")


def render_png(svg, png, px):
    subprocess.run(
        ["rsvg-convert", "-w", str(px), "-h", str(px), "-o", str(png), str(svg)], check=True
    )


def mac_icon_svg(root=ROOT):
    """The Mac app's `AppIcon.icon` as one SVG: its page layer on a rounded square of its fill colour."""
    folder = root / "apps/ink-notebook-editor/Support/AppIcon.icon"
    fill = json.loads((folder / "icon.json").read_text())["fill"]["automatic-gradient"]
    channels = fill.split(":")[1].split(",")[:RGB_CHANNELS]
    colour = "rgb(" + ",".join(f"{float(v):.0%}" for v in channels) + ")"
    page = (folder / "Assets/page.svg").read_text()
    inner = re.sub(r"</?svg[^>]*>", "", page)
    return (
        f"{SVG_OPEN} viewBox=\"0 0 1024 1024\" width=\"1024\" height=\"1024\">"
        f'<rect width="1024" height="1024" rx="230" fill="{colour}"/>{inner}</svg>\n'
    )


TILES = "design/icons/readme/tiles.json"  # {tile name: {"svg": sha256 of its source, "png": sha256 of its file}}


def sha(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode()).hexdigest()


def tile_sources(root=ROOT):
    """({tile name: tile SVG}, [problems]) for every plugin and app the repository holds (#304): each
    `plugins/*/PluginConfig.json`'s icon (its SVG beside the PNG), each `apps/*/res/drawable/ic_launcher.xml`
    (drawn from icons.json), and each planned tool icons.json marks `readme`; the Mac app has its own tile."""
    icons, native = load(root)
    store = glyphs(root)
    by_out = {i["out"]: i for i in icons}
    out, problems = {}, []
    for config in sorted(root.glob("plugins/*/PluginConfig.json")):
        svg = (config.parent / json.loads(config.read_text())["iconPath"]).with_suffix(".svg")
        if svg.is_file():
            out[config.parent.name] = tile_text(svg.read_text(), native)
        else:
            problems.append(f"{svg.relative_to(root).as_posix()}: the plugin's icon SVG is missing")
    for launcher in sorted(root.glob("apps/*/res/drawable/ic_launcher.xml")):
        icon = by_out.get(launcher.relative_to(root).with_suffix("").as_posix())
        if icon:
            out[launcher.parents[2].name] = tile_text(svg_text(icon_paths(icon, native, store), native, kind="app"), native)
        else:
            problems.append(f"{launcher.relative_to(root).as_posix()}: no icons.json entry draws it")
    for icon in icons:
        if icon.get("readme"):
            out[tool(icon["out"])] = tile_text(svg_text(icon_paths(icon, native, store), native), native)
    return out, problems


def tile_text(icon_svg, native, surface="readme"):
    """An icon's SVG centred on a rounded tile, native.json's `<surface>.tile` (the README's or the
    landing page's), on a 100 box."""
    tile = native[surface]["tile"]
    pad = tile["padding"] * 100
    box = f'x="{number(pad)}" y="{number(pad)}" width="{number(100 - 2 * pad)}" height="{number(100 - 2 * pad)}"'
    inner = re.sub(r'width="\d+" height="\d+"', box, icon_svg, count=1)
    return (
        f'{SVG_OPEN} viewBox="0 0 100 100" width="{PLUGIN_PX}" height="{PLUGIN_PX}">'
        f'<rect width="100" height="100" rx="{number(tile["radius"] * 100)}" fill="{tile["fill"]}"/>{inner}</svg>\n'
    )


def strip_png(data):
    """A PNG with only its image chunks, so a render carries no time, text or colour-profile metadata."""
    keep, pos = [data[:8]], 8
    while pos < len(data):
        size, kind = struct.unpack(">I4s", data[pos : pos + 8])
        if kind in (b"IHDR", b"IDAT", b"IEND"):
            keep.append(data[pos : pos + PNG_CHUNK_FRAME + size])
        pos += PNG_CHUNK_FRAME + size
    return b"".join(keep)


def render_tile(svg_text_, png):
    """Render a tile byte-stably: fixed size and resolution, an alpha channel, nothing but image chunks."""
    with tempfile.TemporaryDirectory() as tmp:
        svg = Path(tmp) / "tile.svg"
        svg.write_text(svg_text_)
        subprocess.run(
            ["rsvg-convert", "--dpi-x", "96", "--dpi-y", "96", "-w", str(PLUGIN_PX), "-h", str(PLUGIN_PX), "-o", str(Path(tmp) / "tile.png"), str(svg)],
            check=True,
        )
        png.write_bytes(strip_png((Path(tmp) / "tile.png").read_bytes()))


def write_readme_pngs(root=ROOT):
    """Write every README tile and TILES, the hashes `check` compares."""
    _, native = load(root)
    sources, problems = tile_sources(root)
    if problems:
        raise SystemExit("icons: " + "; ".join(problems))
    folder = root / native["readme"]["tile"]["dir"]
    folder.mkdir(parents=True, exist_ok=True)
    record = {}
    for name, text in sorted(sources.items()):
        render_tile(text, folder / f"{name}.png")
        record[name] = {"svg": sha(text), "png": sha((folder / f"{name}.png").read_bytes())}
    (root / TILES).write_text(json.dumps(record, indent=1) + "\n")


def site_sources(root=ROOT):
    """{tool name: SVG} of the landing page's tool icons (#439): each tool's own icon, a plugin's, an
    app's launcher, a planned tool's or the command line's (icons.json `readme`) and the Mac app's
    (`site.icons`), every one drawn as a plugin icon is, with its stroke and margin, on native.json's `site`
    tile, so the page shows one style and never an app's own artwork."""
    icons, native = load(root)
    store = glyphs(root)
    out = {}
    for icon in icons:
        main = icon["out"].startswith(("plugins/", "apps/")) and icon["out"].endswith(("/icon", "/ic_launcher"))
        if main or icon.get("readme"):
            drawn = svg_text(icon_paths({**icon, "kind": "plugin"}, native, store), native)
            out[tool(icon["out"])] = tile_text(drawn, native, "site")
    for name, icon in site_icons(root).items():
        out[name] = tile_text(svg_text(icon_paths({**icon, "kind": "plugin"}, native, store), native), native, "site")
    return out


def site_icons(root=ROOT):
    """icons.json `site.icons`: {tool name: {"tabler": [...]}} for a tool with no Tabler icon of its own."""
    return json.loads((root / "design/icons/icons.json").read_text())["site"]["icons"]


def site_problems(root=ROOT):
    """A landing-page icon that is missing, stale or has no tool."""
    _, native = load(root)
    folder = root / native["site"]["tile"]["dir"]
    sources = site_sources(root)
    problems = [f"{folder.relative_to(root).as_posix()}/{name}.svg differs from design/icons/icons.json"
                for name, text in sorted(sources.items())
                if not (folder / f"{name}.svg").is_file() or (folder / f"{name}.svg").read_text() != text]
    problems += [f"{path.relative_to(root).as_posix()}: no tool draws it; remove it"
                 for path in sorted(folder.glob("*")) if path.stem not in sources or path.suffix != ".svg"]
    return problems


def write_site_icons(root=ROOT):
    _, native = load(root)
    folder = root / native["site"]["tile"]["dir"]
    folder.mkdir(parents=True, exist_ok=True)
    for name, text in site_sources(root).items():
        (folder / f"{name}.svg").write_text(text)


# A Tools row: its tile, then its kind link, to the piece's releases (?q=name) or its folder (#268).
ROW = (r'<tr><td[^>]*><br><p align="center"><img src="([^"]+)"[^\n]*?'
       r'<a href="(?:[^"]*releases\?q=([a-z-]+)[^"]*|((?:plugins|apps)/[^"/]+)/)">(?:plugin|app|Mac app)</a>')


def tile_problems(root=ROOT):
    """What is wrong with the README tiles: one missing or stale, a plugin or app without one, or a README
    Tools row without its tile or with another's (never a render: the recorded hashes decide)."""
    _, native = load(root)
    sources, problems = tile_sources(root)
    folder = native["readme"]["tile"]["dir"]
    recorded = json.loads((root / TILES).read_text()) if (root / TILES).is_file() else {}
    for name, text in sorted(sources.items()):
        png = root / folder / f"{name}.png"
        note = recorded.get(name)
        if not png.is_file() or not note:
            problems.append(f"{folder}/{name}.png: no README tile")
        elif note["svg"] != sha(text) or note["png"] != sha(png.read_bytes()):
            problems.append(f"{folder}/{name}.png: stale")
    readme = (root / "README.md").read_text(encoding="utf-8") if (root / "README.md").is_file() else ""
    editor = "design/icons/apps/ink-notebook-editor.png"
    for src, release, folder_link in re.findall(ROW, readme):
        name = release or folder_link.split("/")[1]
        want = editor if name == "ink-notebook-editor" else f"{folder}/{name}.png"
        if src != want:
            problems.append(f"README.md: the row of {name} shows {src}, not {want}")
        elif not (root / want).is_file():
            problems.append(f"README.md: {want} is missing")
    return problems


def write_app_pngs(root=ROOT):
    """A picture of each app's launcher icon: design/icons/apps/<app folder>.png at PLUGIN_PX; the Mac
    app's is its own tile, which the README shows."""
    icons, native = load(root)
    store = glyphs(root)
    out = root / "design/icons/apps"
    out.mkdir(parents=True, exist_ok=True)
    sources = {
        tool(i["out"]): svg_text(icon_paths(i, native, store), native, kind="app")
        for i in icons
        if i["kind"] == "app"
    }
    sources["ink-notebook-editor"] = mac_icon_svg(root)
    with tempfile.TemporaryDirectory() as tmp:
        for name, text in sources.items():
            svg = Path(tmp) / f"{name}.svg"
            svg.write_text(text)
            render_png(svg, out / f"{name}.png", PLUGIN_PX)


def write(root=ROOT):
    write_app_pngs(root)
    icons, _ = load(root)
    for rel, text in texts(root).items():
        (root / rel).parent.mkdir(parents=True, exist_ok=True)  # a planned tool's folder
        (root / rel).write_text(text)
    for icon in icons:
        if icon["kind"] != "plugin":
            continue
        svg = root / (icon["out"] + ".svg")
        render_png(svg, root / (icon["out"] + ".png"), PLUGIN_PX)
        for px in icon.get("extraPng", []):
            render_png(svg, root / f'{icon["out"]}-{px}.png', px)
    write_readme_pngs(root)
    write_site_icons(root)


def check(root=ROOT):
    """The generated files that are missing or differ from their source."""
    return [
        f"{rel} differs from design/icons/icons.json"
        for rel, text in texts(root).items()
        if not (root / rel).is_file() or (root / rel).read_text() != text
    ] + tile_problems(root) + site_problems(root)


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
        label = f'{tool(icon["out"])} / {icon["out"].rsplit("/", 1)[1]}'
        if "planned" in icon:
            label += f' / planned {icon["planned"]} {icon.get("plannedIf", "")}'.rstrip()
        cells.append((label, svg_text(icon_paths(icon, native, store), native, kind=icon["kind"])))
    rows = -(-len(cells) // layout["columns"])
    parts = [
        f'{SVG_OPEN} width="{layout["columns"] * layout["cellWidth"]}" height="{rows * layout["cellHeight"]}">',
        '<rect width="100%" height="100%" fill="#ffffff"/>',
    ]
    for n, (label, svg) in enumerate(cells):
        x, y = n % layout["columns"] * layout["cellWidth"] + layout["padX"], n // layout["columns"] * layout["cellHeight"] + layout["padY"]
        inner = re.sub(r"<svg[^>]*>", lambda m: re.sub(r' xmlns="[^"]*"', "", m.group(0)), svg, count=1)
        parts.append(f'<g transform="translate({x} {y})">{inner}</g>')
        # The icon's box, so a stroke that comes near or past its edge shows (owner review, #271).
        edge, side = layout["boxOffset"], PLUGIN_PX + 2 * layout["boxOffset"]  # a 1 px line just outside the icon
        parts.append(f'<rect x="{x - edge}" y="{y - edge}" width="{side}" height="{side}" fill="none" stroke="{layout["boxColor"]}"/>')
        for row, line in enumerate(label.split(" / ")):
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
            print(f"icons: {rel}; run python3 scripts/icons.py")
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
