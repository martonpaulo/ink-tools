"""Tests of icons.py (#271): every Ink Tools icon follows the Supernote's native outline style."""
import json
import math
import re
import struct
import sys
import tempfile
import zlib
import unittest
import xml.etree.ElementTree as ET
from itertools import combinations
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import icons  # noqa: E402

ROOT = icons.ROOT
TILES_JSON = icons.TILES
ICONS, NATIVE = icons.load()
STORE = icons.glyphs()
PATHS = {icon["out"]: icons.icon_paths(icon, NATIVE, STORE) for icon in ICONS}
V = NATIVE["vector"]
ANDROID = "{http://schemas.android.com/apk/res/android}"
# Two icons whose black pixels overlap by more than this share of their union read alike at a glance.
MAX_OVERLAP = 0.7
# Two icons of one tool share its motif by design and differ by the rest (owner, 2026-11-25, #271).
FAMILY_OVERLAP = 0.8
# One button's two states keep the same box and letter, and differ by their outline.
STATE_PAIRS = {frozenset(("plugins/real-time-conversion/assets/mode-on", "plugins/real-time-conversion/assets/mode-off")): 0.85}
# Two translate buttons that share a language share its two letters and the arrow, and differ by the
# other language's two letters (owner, 2026-11-25, #271).
TRANSLATE = "plugins/word-lookup/assets/translate-"
for _a, _b in (("es-pt", "zh-pt"), ("pt-es", "pt-zh")):
    STATE_PAIRS[frozenset((TRANSLATE + _a, TRANSLATE + _b))] = 0.85
NUMBER = icons.NUMBER
TOOLBAR = NATIVE["plugin"]["toolbar"]
# The share of its box an icon keeps clear on every side: the native toolbar icons' for a plugin
# icon, the native launcher icons' for an app's (owner review of the first sheet, #271).
MARGIN = {"plugin": TOOLBAR["inkMarginPx"] / TOOLBAR["sizePx"], "app": V["inkMargin"] / V["viewport"]}


def vector_problems(root_element, android, kind="plugin"):
    """What breaks the native style in a parsed SVG (`android` False) or vector drawable (True)."""
    grid, pad, stroke = icons.frame("app" if android else kind, NATIVE)
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
        if root_element.get("viewBox") != icons.view_box(grid, pad):
            problems.append(f"viewBox is not the {grid} grid with {pad} around it")
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
        if width is None or float(width) != stroke:
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


def absolute_problems(paths):
    """Commands the gate cannot read where they land: relative ones, and S and T, whose control point
    comes from the segment before."""
    return [f"{c} in {d}" for d in paths for c in sorted(set(re.findall(r"[a-zST]", d.replace("e", ""))))]


def margin_problem(paths, kind, pad=None):
    """None, or how the stroke outline comes nearer the box's edge than the native margin of `kind`;
    `pad` overrides the frame's padding."""
    grid, frame_pad, stroke = icons.frame(kind, NATIVE)
    pad = frame_pad if pad is None else pad
    side = grid + 2 * pad
    left, top, right, bottom = icons.outline_box(paths, stroke)
    gap = min(left + pad, top + pad, grid + pad - right, grid + pad - bottom)
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
        pos += icons.PNG_CHUNK_FRAME + size
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


SET = json.loads(icons.SET.read_text())


def retired(path):
    """Whether a file sits in a retired tool's folder, which ships nothing (#288)."""
    return any(Path(path).relative_to(ROOT).as_posix().startswith(folder + "/") for folder in SET["retired"])


class Families(unittest.TestCase):
    def test_each_tool_with_several_icons_shares_its_motif(self):
        # Owner, 2026-11-25 (#271): a tool's icons read as one family and still differ at a glance.
        tools = {}
        for icon in ICONS:
            tools.setdefault(icons.tool(icon["out"]), []).append(icon)
        families = SET["families"]
        for name, members in tools.items():
            if len(members) < 2:
                continue
            with self.subTest(name):
                self.assertIn(name, families)
                excepted = families[name].get("except", {})
                for icon in members:
                    if icon["out"].rsplit("/", 1)[1] in excepted:
                        continue
                    glyphs = {p if isinstance(p, str) else p["name"] for p in icon["tabler"]}
                    self.assertTrue(glyphs & set(families[name]["motif"]), icon["out"])

    def test_a_planned_icon_names_its_issue_and_lives_apart(self):
        for icon in ICONS:
            if "planned" in icon:
                with self.subTest(icon["out"]):
                    self.assertRegex(icon["planned"], r"^#\d+$")
                    self.assertTrue(icon["out"].startswith("design/icons/planned/"))


class Style(unittest.TestCase):
    def test_the_native_measurements_are_the_recorded_ones(self):
        self.assertEqual((V["strokeWidth"], V["viewport"], V["lineCap"]), (4, 48, "round"))

    def test_a_plugin_icon_has_the_native_toolbar_stroke(self):
        # The stroke's share of the box is the native toolbar icons' 4 of 64 (owner, 2026-11-25, #271).
        grid, pad, stroke = icons.frame("plugin", NATIVE)
        self.assertEqual(stroke / (grid + 2 * pad), TOOLBAR["strokePx"] / TOOLBAR["sizePx"])
        self.assertEqual(grid, STORE["grid"])

    def test_every_icon_is_built_from_the_pinned_tabler_glyphs(self):
        names = {p if isinstance(p, str) else p["name"] for i in ICONS for p in i["tabler"]}
        self.assertTrue(all(i["tabler"] for i in ICONS))
        self.assertEqual(sorted(STORE["glyphs"]), sorted(names))  # no glyph missing, none unused
        self.assertEqual((STORE["package"], STORE["version"]), ("@tabler/icons", "3.53.0"))

    def test_relative_tabler_paths_become_absolute(self):
        self.assertEqual(icons.path_text(icons.absolute("M7 10h14l-4 -4")), "M7 10 H21 L17 6")
        self.assertEqual(icons.path_text(icons.absolute("M4 6v-1a1 1 0 0 1 1 -1h1m5 0h2")), "M4 6 V5 A1 1 0 0 1 5 4 H6 M11 4 H13")
        # S reflects the last control point; numbers such as -.5 and 1.5.5 are read apart.
        self.assertEqual(icons.path_text(icons.absolute("M0 0c1 0 2 1 2 2s1 2 2 2")), "M0 0 C1 0 2 1 2 2 C2 3 3 4 4 4")
        self.assertEqual(icons.path_text(icons.absolute("M1 1l-.5 1.5.5 .5")), "M1 1 L0.5 2.5 L1 3")
        self.assertEqual(icons.path_text(icons.place(icons.absolute("M2 2a1 1 0 0 1 2 0h2"), 2, (1, 1))), "M5 5 A2 2 0 0 1 9 5 H13")

    def test_every_generated_file_is_current(self):
        self.assertEqual(icons.check(), [])

    def test_every_icon_is_written_in_absolute_commands(self):
        for icon in ICONS:
            with self.subTest(icon["out"]):
                self.assertEqual(absolute_problems(PATHS[icon["out"]]), [])

    def test_every_icon_keeps_the_native_margin_on_every_side(self):
        for icon in ICONS:
            with self.subTest(icon["out"]):
                self.assertIsNone(margin_problem(PATHS[icon["out"]], icon["kind"]))

    def test_every_icon_spans_the_native_share_of_its_box(self):
        # Fitted, not Tabler's own optical size: the audit measured a 58% median span against the
        # native 66% (#271).
        for icon in ICONS:
            grid, pad, stroke = icons.frame(icon["kind"], NATIVE)
            left, top, right, bottom = icons.outline_box(PATHS[icon["out"]], stroke)
            with self.subTest(icon["out"]):
                span = max(right - left, bottom - top) / (grid + 2 * pad)
                self.assertAlmostEqual(span, icons.ink_span(icon["kind"], NATIVE), delta=0.005)  # arcs are sampled
                self.assertAlmostEqual((left + right) / 2, grid / 2, delta=0.02)  # cut pieces round to 0.001

    def test_a_badge_cuts_the_strokes_under_it(self):
        # A badge keeps the base at full size and clears its own corner, as Tabler's badged glyphs do.
        store = {"grid": 24, "glyphs": {"bar": ["M2 20 H22"], "dot": ["M12 12 h.01"]}}
        bar, dot = icons.icon_paths({"kind": "plugin", "tabler": ["bar", {"name": "dot", "badge": True}]}, NATIVE, store)
        self.assertLess(icons.outline_box([bar], 0)[2], icons.outline_box([dot], 0)[0])
        whole = icons.icon_paths({"kind": "plugin", "tabler": ["bar", "dot"]}, NATIVE, store)
        self.assertEqual(len(whole), 2)

    def test_a_stroke_inside_the_margin_is_caught(self):
        # The first sheet's P (#271): its bowl's arc bulges to 44.5, past the endpoints the old check read.
        self.assertTrue(margin_problem(["M33 35 V13 H39 A5.5 5.5 0 0 1 39 24 H33"], "app", 0))
        self.assertIsNone(margin_problem(["M33 35 V13 H37 A5 5 0 0 1 37 23 H33"], "app", 0))
        # A Bezier that leaves its endpoints' box, and a plugin icon written without the padding.
        self.assertTrue(margin_problem(["M10 4 C10 -2 38 -2 38 4"], "app", 0))
        self.assertTrue(margin_problem(["M3 12 H21"], "plugin", 0))
        self.assertIsNone(margin_problem(["M3 12 H21"], "plugin"))
        # Tabler keeps centrelines within 2 to 22; a glyph placed past that crosses the toolbar icons' margin.
        self.assertIsNone(margin_problem(["M2 2 H22 V22"], "plugin"))
        self.assertTrue(margin_problem(["M1 12 H21"], "plugin"))

    def test_each_written_icon_follows_the_native_style(self):
        for icon in ICONS:
            android = icon["kind"] == "app"
            file = ROOT / (icon["out"] + (".xml" if android else ".svg"))
            with self.subTest(str(file)):
                self.assertEqual(vector_problems(ET.parse(file).getroot(), android), [])

    def test_a_filled_or_off_grey_or_thick_icon_is_caught(self):
        good = icons.svg_text(["M4 4 H20"], NATIVE)
        self.assertEqual(vector_problems(ET.fromstring(good), False), [])
        self.assertTrue(vector_problems(ET.fromstring(good.replace(f'viewBox="{icons.view_box(*icons.frame("plugin", NATIVE)[:2])}"', 'viewBox="0 0 24 24"')), False))
        for old, new, word in (
            ('fill="none"', 'fill="#383838"', "filled"),
            ('stroke="#000000"', 'stroke="#808080"', "stroke colour"),
            (f'stroke-width="{icons.number(icons.frame("plugin", NATIVE)[2])}"', 'stroke-width="4"', "stroke width"),
        ):
            with self.subTest(word):
                found = vector_problems(ET.fromstring(good.replace(old, new)), False)
                self.assertTrue(any(word in p for p in found), found)
        self.assertTrue(any("filled" in p for p in vector_problems(ET.fromstring(
            icons.xml_text(["M4 4 H44"], NATIVE).replace("#00000000", "#ff383838")), True)))
        self.assertTrue(absolute_problems(["M2 4 h40"]))
        self.assertTrue(absolute_problems(["M2 4 S4 4 6 6"]))


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

    def test_a_readme_tile_is_the_icon_on_the_light_rounded_tile(self):
        # GitHub strips CSS, so the tile is in the image: a black icon reads on its dark theme too (#304).
        tile = NATIVE["readme"]["tile"]
        fill = tuple(int(tile["fill"][n : n + 2], 16) for n in (1, 3, 5))
        names = icons.tile_sources()[0]
        self.assertEqual(sorted(names), sorted(p.stem for p in (ROOT / tile["dir"]).glob("*.png")))
        for name in names:
            with self.subTest(name):
                width, height, alpha, colors = alpha_mask(ROOT / tile["dir"] / f"{name}.png")
                self.assertEqual((width, height), (icons.PLUGIN_PX, icons.PLUGIN_PX))
                self.assertEqual(alpha[0][0], 0)  # the corner is rounded off
                self.assertEqual(alpha[0][width // 2], 255)  # the edge is the tile
                self.assertEqual(alpha[height // 2][2], 255)
                self.assertIn(fill, colors)
                self.assertTrue(any(max(c) < 60 for c in colors), "the black icon is on it")

    def test_every_plugin_and_app_has_a_tile(self):
        names = set(icons.tile_sources()[0])
        found = {c.parent.name for c in ROOT.glob("plugins/*/PluginConfig.json")} | {p.parents[2].name for p in ROOT.glob("apps/*/res/drawable/ic_launcher.xml")}
        self.assertLessEqual(found, names)
        self.assertEqual(icons.tile_problems(), [])

    def test_a_render_is_byte_stable(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second = Path(tmp) / "a.png", Path(tmp) / "b.png"
            text = next(iter(icons.tile_sources()[0].values()))
            icons.render_tile(text, first)
            icons.render_tile(text, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            self.assertEqual(first.read_bytes(), icons.strip_png(first.read_bytes()))
            chunks, data, pos = [], first.read_bytes(), 8
            while pos < len(data):
                size, kind = struct.unpack(">I4s", data[pos : pos + 8])
                chunks.append(kind)
                pos += icons.PNG_CHUNK_FRAME + size
            self.assertEqual(set(chunks), {b"IHDR", b"IDAT", b"IEND"})

    def test_a_new_plugin_gets_a_tile_and_the_check_fails_until_it_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for rel in ("design/icons/icons.json", "design/icons/native.json", "design/icons/tabler.json", "README.md", TILES_JSON):
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                (root / rel).write_text((ROOT / rel).read_text())
            self.assertFalse([p for p in icons.tile_problems(root) if "fake-plugin" in p])
            plugin = root / "plugins/fake-plugin"
            (plugin / "assets").mkdir(parents=True)
            (plugin / "PluginConfig.json").write_text('{"iconPath": "assets/icon.png"}')
            (plugin / "assets/icon.svg").write_text((ROOT / "plugins/account-sync/assets/icon.svg").read_text())
            self.assertIn("design/icons/readme/fake-plugin.png: no README tile", icons.tile_problems(root))
            icons.write_readme_pngs(root)
            self.assertFalse([p for p in icons.tile_problems(root) if "fake-plugin" in p])
            (plugin / "assets/icon.svg").write_text((ROOT / "plugins/device-transfer/assets/icon.svg").read_text())
            self.assertIn("design/icons/readme/fake-plugin.png: stale", icons.tile_problems(root))

    def test_a_readme_row_without_its_tile_fails_the_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for rel in ("design/icons/icons.json", "design/icons/native.json", "design/icons/tabler.json", TILES_JSON):
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                (root / rel).write_text((ROOT / rel).read_text())
            readme = (ROOT / "README.md").read_text(encoding="utf-8")
            (root / "README.md").write_text(readme.replace("design/icons/readme/account-sync.png", "plugins/account-sync/assets/icon.png"))
            self.assertIn("README.md: a Tools row shows plugins/account-sync/assets/icon.png, not a tile of design/icons/readme/",
                          icons.tile_problems(root))

    def test_no_two_icons_read_alike(self):
        def ink(alpha):
            return {(x, y) for y, row in enumerate(alpha) for x, a in enumerate(row) if a > 127}
        shapes = {out: ink(mask[2]) for out, mask in self.masks.items()}
        for (a, sa), (b, sb) in combinations(shapes.items(), 2):
            with self.subTest(a=a, b=b):
                self.assertLess(len(sa & sb) / len(sa | sb), STATE_PAIRS.get(frozenset((a, b)), FAMILY_OVERLAP if icons.tool(a) == icons.tool(b) else MAX_OVERLAP), f"{a} and {b} overlap too much")

    def test_every_plugin_asset_png_is_drawn_from_the_set(self):
        drawn = {ROOT / (i["out"] + ".png") for i in ICONS if i["kind"] == "plugin"}
        drawn |= {ROOT / f'{i["out"]}-{px}.png' for i in ICONS for px in i.get("extraPng", [])}
        found = {p for p in ROOT.glob("plugins/*/assets/*.png") if not retired(p)}
        self.assertEqual(sorted(p.relative_to(ROOT).as_posix() for p in found - drawn), [])

    def test_every_plugin_icon_path_and_launcher_icon_is_drawn_from_the_set(self):
        outs = {i["out"] for i in ICONS}
        for config in (c for c in ROOT.glob("plugins/*/PluginConfig.json") if not retired(c)):
            icon = json.loads(config.read_text())["iconPath"]
            self.assertIn((config.parent / icon).relative_to(ROOT).with_suffix("").as_posix(), outs, config)
        for launcher in ROOT.glob("apps/*/res/drawable/ic_launcher.xml"):
            self.assertIn(launcher.relative_to(ROOT).with_suffix("").as_posix(), outs, launcher)


if __name__ == "__main__":
    unittest.main()
