"""Tests of icons.py (#271): every Ink Tools icon follows the Supernote's native outline style."""
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
NUMBER = re.compile(r"-?\d+(?:\.\d+)?")


def vector_problems(root_element, android):
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
        if root_element.get("viewBox") != f'0 0 {V["viewport"]} {V["viewport"]}':
            problems.append("viewBox is not the 48 grid")
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

    def test_each_written_icon_follows_the_native_style(self):
        for icon in ICONS:
            android = icon["kind"] == "app"
            file = ROOT / (icon["out"] + (".xml" if android else ".svg"))
            with self.subTest(str(file)):
                self.assertEqual(vector_problems(ET.parse(file).getroot(), android), [])

    def test_a_filled_or_off_grey_or_thick_icon_is_caught(self):
        good = icons.svg_text(["M4 4 H44"], NATIVE)
        self.assertEqual(vector_problems(ET.fromstring(good), False), [])
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
        cls.masks = {}
        for icon in ICONS:
            if icon["kind"] == "plugin":
                cls.masks[icon["out"]] = alpha_mask(ROOT / (icon["out"] + ".png"))

    def test_each_png_is_96_px_black_with_the_native_padding(self):
        low, high = V["centerlineMin"] - V["strokeWidth"] // 2, V["centerlineMax"] + V["strokeWidth"] // 2
        for out, (width, height, alpha, colors) in self.masks.items():
            with self.subTest(out):
                self.assertEqual((width, height), (icons.PLUGIN_PX, icons.PLUGIN_PX))
                self.assertEqual(colors, {(0, 0, 0)})
                xs = [x for row in alpha for x, a in enumerate(row) if a > 127]
                ys = [y for y, row in enumerate(alpha) for a in row if a > 127]
                scale = icons.PLUGIN_PX // V["viewport"]
                self.assertGreaterEqual(min(xs + ys), low * scale - 1)
                self.assertLessEqual(max(xs + ys), high * scale)

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
