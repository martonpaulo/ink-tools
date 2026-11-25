"""Tests of icons.py (#271): every Ink Tools icon follows the Supernote's native outline style."""
import math
import re
import struct
import sys
import zlib
import unittest
import xml.etree.ElementTree as ET
from itertools import combinations
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import icons  # noqa: E402

ROOT = icons.ROOT
ICONS, NATIVE = icons.load()
V = NATIVE["vector"]
ANDROID = "{http://schemas.android.com/apk/res/android}"
# Two icons whose black pixels overlap by more than this share of their union read alike at a glance.
MAX_OVERLAP = 0.7
# One button's two states keep the same box and letter, and differ by their outline.
STATE_PAIRS = {frozenset(("plugins/real-time-conversion/assets/mode-on", "plugins/real-time-conversion/assets/mode-off")): 0.85}
# Two translate buttons that share a language share its two letters and the arrow, and differ by the
# other language's two letters (owner, 2026-11-25, #271).
TRANSLATE = "plugins/word-lookup/assets/translate-"
for _a, _b in (("es-pt", "zh-pt"), ("pt-es", "pt-zh")):
    STATE_PAIRS[frozenset((TRANSLATE + _a, TRANSLATE + _b))] = 0.85
NUMBER = re.compile(r"-?\d+(?:\.\d+)?")
PAD = NATIVE["plugin"]["padding"]
TOOLBAR = NATIVE["plugin"]["toolbar"]
# The share of its box an icon keeps clear on every side: the native toolbar icons' for a plugin
# icon, the native launcher icons' for an app's (owner review of the first sheet, #271).
MARGIN = {"plugin": TOOLBAR["inkMarginPx"] / TOOLBAR["sizePx"], "app": V["inkMargin"] / V["viewport"]}
STEPS = 64  # points sampled along each curve or arc


def vector_problems(root_element, android, pad=0):
    """What breaks the native style in a parsed SVG (`android` False) or vector drawable (True)."""
    problems = []
    attr = (lambda e, n: e.get(ANDROID + n)) if android else (lambda e, n: e.get(n))
    paths = [e for e in root_element.iter() if e.tag.split("}")[-1] == "path"]
    if not paths:
        problems.append("no path")
    if android:
        if attr(root_element, "viewportWidth") != str(V["viewport"]) or attr(root_element, "width") != f'{V["sizeDp"]}dp':
            problems.append("not a 48 dp icon on a 48 viewport")
        sources = paths
    else:
        if root_element.get("viewBox") != icons.view_box(NATIVE, pad):
            problems.append(f"viewBox is not the 48 grid with {pad} around it")
        sources = [root_element]
    for element in sources:
        fill = attr(element, "fillColor" if android else "fill")
        color = attr(element, "strokeColor" if android else "stroke")
        width = attr(element, "strokeWidth" if android else "stroke-width")
        cap = attr(element, "strokeLineCap" if android else "stroke-linecap")
        join = attr(element, "strokeLineJoin" if android else "stroke-linejoin")
        if fill not in ("#00000000", "none"):
            problems.append(f"filled: {fill}")
        if color != V["strokeColor"]:
            problems.append(f"stroke colour {color}")
        if width is None or float(width) != V["strokeWidth"]:
            problems.append(f"stroke width {width}")
        if (cap, join) != (V["lineCap"], V["lineJoin"]):
            problems.append(f"caps {cap} joins {join}")
    for element in paths:
        for attribute in element.attrib:
            if attribute.split("}")[-1] in ("fill", "stroke", "fillColor", "strokeColor") and not android:
                problems.append("a path carries its own paint")
    if any(e.tag.split("}")[-1] in ("rect", "circle", "ellipse", "image") for e in root_element.iter()):
        problems.append("a shape element, not a stroke path")
    return problems


def centerline_problems(paths):
    """Absolute coordinates outside the native extent; relative moves are not used."""
    problems = []
    for d in paths:
        if re.search(r"[a-z]", d.replace("e", "")):
            problems.append(f"relative command in {d}")
        for number in NUMBER.findall(d):
            pass
        # A, the arc flags and radii are not coordinates; every other command lists x y pairs, H and V one number.
        for command, args in re.findall(r"([MLHVCQAZ])([^MLHVCQAZ]*)", d):
            values = [float(n) for n in NUMBER.findall(args)]
            if command == "A":
                values = [v for i, v in enumerate(values) if i % 7 in (5, 6)]
            for value in values:
                if not V["centerlineMin"] <= value <= V["centerlineMax"]:
                    problems.append(f"{value} is outside {V['centerlineMin']} to {V['centerlineMax']} in {d}")
    return problems


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
        for command, args in re.findall(r"([MLHVCQAZ])([^MLHVCQAZ]*)", d):
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
                n = 6 if command == "C" else 4
                for i in range(0, len(v), n):
                    ctrl = [(x, y)] + [(v[i + k], v[i + k + 1]) for k in range(0, n, 2)]
                    for step in range(1, STEPS + 1):
                        t, pts = step / STEPS, ctrl
                        while len(pts) > 1:  # de Casteljau
                            pts = [((1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]) for a, b in zip(pts, pts[1:])]
                        points.append(pts[0])
                    x, y = ctrl[-1]
            elif command == "A":
                for i in range(0, len(v), 7):
                    points += arc_points(x, y, *v[i : i + 5], v[i + 5], v[i + 6])
                    x, y = v[i + 5], v[i + 6]
            elif command == "Z":
                x, y = start
    half = stroke / 2
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs) - half, min(ys) - half, max(xs) + half, max(ys) + half


def margin_problem(paths, kind, pad):
    """None, or how the stroke outline comes nearer the box's edge than the native margin of `kind`."""
    side = V["viewport"] + 2 * pad
    left, top, right, bottom = outline_box(paths, V["strokeWidth"])
    gap = min(left + pad, top + pad, V["viewport"] + pad - right, V["viewport"] + pad - bottom)
    need = MARGIN[kind] * side
    if gap < need - 1e-9:
        return f"the stroke comes {gap:.2f} of {side} from the edge; the native margin is {need:.2f}"
    return None


def alpha_mask(png):
    """(width, height, rows of alpha bytes, set of RGB triples with alpha > 0) of an 8-bit RGBA PNG."""
    data = Path(png).read_bytes()
    pos, idat, width, height = 8, b"", 0, 0
    while pos < len(data):
        size, kind = struct.unpack(">I4s", data[pos : pos + 8])
        chunk = data[pos + 8 : pos + 8 + size]
        pos += 12 + size
        if kind == b"IHDR":
            width, height, depth, color = struct.unpack(">IIBB", chunk[:10])
            if (depth, color) != (8, 6):
                raise ValueError(f"{png}: not an 8-bit RGBA PNG")
        elif kind == b"IDAT":
            idat += chunk
    raw, stride = zlib.decompress(idat), width * 4
    rows, prev, at = [], bytearray(stride), 0
    for _ in range(height):
        mode, line = raw[at], bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride
        for i in range(stride):
            a = line[i - 4] if i >= 4 else 0
            b = prev[i]
            c = prev[i - 4] if i >= 4 else 0
            if mode == 1:
                line[i] = (line[i] + a) & 255
            elif mode == 2:
                line[i] = (line[i] + b) & 255
            elif mode == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif mode == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    alpha = [bytes(r[3::4]) for r in rows]
    colors = {tuple(r[x * 4 : x * 4 + 3]) for r in rows for x in range(width) if r[x * 4 + 3]}
    return width, height, alpha, colors


class Style(unittest.TestCase):
    def test_the_native_measurements_are_the_recorded_ones(self):
        self.assertEqual((V["strokeWidth"], V["viewport"], V["lineCap"]), (4, 48, "round"))

    def test_every_generated_file_is_current(self):
        self.assertEqual(icons.check(), [])

    def test_every_icon_is_stroke_only_inside_the_native_extent(self):
        for icon in ICONS:
            with self.subTest(icon["out"]):
                self.assertEqual(centerline_problems(icon["paths"]), [])

    def test_every_icon_keeps_the_native_margin_on_every_side(self):
        for icon in ICONS:
            with self.subTest(icon["out"]):
                pad = PAD if icon["kind"] == "plugin" else 0
                self.assertIsNone(margin_problem(icon["paths"], icon["kind"], pad))

    def test_a_stroke_inside_the_margin_is_caught(self):
        # The first sheet's P (#271): its bowl's arc bulges to 44.5, past the endpoints the old check read.
        self.assertTrue(margin_problem(["M33 35 V13 H39 A5.5 5.5 0 0 1 39 24 H33"], "app", 0))
        self.assertIsNone(margin_problem(["M33 35 V13 H37 A5 5 0 0 1 37 23 H33"], "app", 0))
        # A Bezier that leaves its endpoints' box, and a plugin icon written without the padding.
        self.assertTrue(margin_problem(["M10 4 C10 -2 38 -2 38 4"], "app", 0))
        self.assertTrue(margin_problem(["M4 24 H44"], "plugin", 0))
        self.assertIsNone(margin_problem(["M4 24 H44"], "plugin", PAD))

    def test_each_written_icon_follows_the_native_style(self):
        for icon in ICONS:
            android = icon["kind"] == "app"
            file = ROOT / (icon["out"] + (".xml" if android else ".svg"))
            with self.subTest(str(file)):
                self.assertEqual(vector_problems(ET.parse(file).getroot(), android, 0 if android else PAD), [])

    def test_a_filled_or_off_grey_or_thick_icon_is_caught(self):
        good = icons.svg_text(["M4 4 H44"], NATIVE)
        self.assertEqual(vector_problems(ET.fromstring(good), False), [])
        self.assertTrue(vector_problems(ET.fromstring(good), False, PAD))
        for old, new, word in (
            ('fill="none"', 'fill="#383838"', "filled"),
            ('stroke="#000000"', 'stroke="#808080"', "stroke colour"),
            ('stroke-width="4"', 'stroke-width="6"', "stroke width"),
        ):
            with self.subTest(word):
                found = vector_problems(ET.fromstring(good.replace(old, new)), False)
                self.assertTrue(any(word in p for p in found), found)
        self.assertTrue(any("filled" in p for p in vector_problems(ET.fromstring(
            icons.xml_text(["M4 4 H44"], NATIVE).replace("#00000000", "#ff383838")), True)))
        self.assertTrue(centerline_problems(["M2 4 H44"]))


class Pngs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.masks, cls.sizes = {}, {}
        for icon in ICONS:
            if icon["kind"] == "plugin":
                cls.masks[icon["out"]] = alpha_mask(ROOT / (icon["out"] + ".png"))
                cls.sizes[icon["out"] + ".png"] = icons.PLUGIN_PX
                for px in icon.get("extraPng", []):
                    cls.sizes[f'{icon["out"]}-{px}.png'] = px

    def test_each_png_is_black_and_keeps_the_native_margin_at_its_size(self):
        for rel, size in self.sizes.items():
            with self.subTest(rel):
                width, height, alpha, colors = alpha_mask(ROOT / rel) if size != icons.PLUGIN_PX else self.masks[rel[: -len(".png")]]
                self.assertEqual((width, height), (size, size))
                self.assertEqual(colors, {(0, 0, 0)})
                xs = [x for row in alpha for x, a in enumerate(row) if a]
                ys = [y for y, row in enumerate(alpha) for a in row if a]
                # Any ink, even an anti-aliased edge, stays out of the margin, less one pixel of rounding.
                self.assertGreaterEqual(min(min(xs), min(ys), size - 1 - max(xs), size - 1 - max(ys)), int(MARGIN["plugin"] * size) - 1)

    def test_no_two_icons_read_alike(self):
        def ink(alpha):
            return {(x, y) for y, row in enumerate(alpha) for x, a in enumerate(row) if a > 127}
        shapes = {out: ink(mask[2]) for out, mask in self.masks.items()}
        for (a, sa), (b, sb) in combinations(shapes.items(), 2):
            with self.subTest(a=a, b=b):
                self.assertLess(len(sa & sb) / len(sa | sb), STATE_PAIRS.get(frozenset((a, b)), MAX_OVERLAP), f"{a} and {b} overlap too much")

    def test_every_plugin_asset_png_is_drawn_from_the_set(self):
        drawn = {ROOT / (i["out"] + ".png") for i in ICONS if i["kind"] == "plugin"}
        drawn |= {ROOT / f'{i["out"]}-{px}.png' for i in ICONS for px in i.get("extraPng", [])}
        found = set(ROOT.glob("plugins/*/assets/*.png"))
        self.assertEqual(sorted(p.relative_to(ROOT).as_posix() for p in found - drawn), [])

    def test_every_plugin_icon_path_and_launcher_icon_is_drawn_from_the_set(self):
        import json
        outs = {i["out"] for i in ICONS}
        for config in ROOT.glob("plugins/*/PluginConfig.json"):
            icon = json.loads(config.read_text())["iconPath"]
            self.assertIn((config.parent / icon).relative_to(ROOT).with_suffix("").as_posix(), outs, config)
        for launcher in ROOT.glob("apps/*/res/drawable/ic_launcher.xml"):
            self.assertIn(launcher.relative_to(ROOT).with_suffix("").as_posix(), outs, launcher)


if __name__ == "__main__":
    unittest.main()
