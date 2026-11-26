#!/usr/bin/env python3
"""Write the README's tool tables and its two diagrams from the repository's data (#407).

    readme_figures.py [--root DIR] [--check]

Sources, each the one owner of its values:
- docs/tools.json: every tool row (the README Tools and Developer tools tables, the tool map);
- docs/architecture.md › Layer rules: the level table's public columns and the rule sentence;
- registry/items/: how many items sit at each level, and each tool's level circles;
- AGENTS.md's `- README Status values:` line: the status dots and their legend.

Writes the README block between TOOLS_START and TOOLS_END, and design/diagrams/levels-<theme>.svg and
tool-map-<theme>.svg for the light and dark themes, which the README shows through one <picture>
each. --check writes nothing: it exits 1 naming each file that differs from a fresh generation, so a
data change that forgets the diagrams fails the `docs` gate. The public wording of every file it
writes is #408's gate.
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import readme_status  # noqa: E402

TOOLS_START = "<!-- tools:start: written by scripts/readme_figures.py from docs/tools.json -->"
TOOLS_END = "<!-- tools:end -->"
DIAGRAMS = Path("design/diagrams")
THEMES = ("light", "dark")

SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
# The owner's architecture page palette, light and dark; levels 1 to 5 are l1..l5.
PALETTE = {
    "light": {"paper": "#ffffff", "ink": "#151515", "muted": "#5d5f5a", "line": "#cfd0c8",
              "tint": "#eef1ec", "target": "#1f6f69", "bad": "#b23a2a", "chip": "#ffffff",
              "l1": "#2f6b3f", "l2": "#2c5d8a", "l3": "#8a6a1f", "l4": "#6b5a8a", "l5": "#a2452f"},
    "dark": {"paper": "#1d1e1b", "ink": "#ecece6", "muted": "#a6a8a0", "line": "#3d3f39",
             "tint": "#24271f", "target": "#6fc5bd", "bad": "#f08a76", "chip": "#151515",
             "l1": "#7fc08f", "l2": "#86b5e0", "l3": "#d8b35c", "l4": "#b9a6dc", "l5": "#e9907a"},
}
ADAPTERS = {
    "ts": ("sn-adapter", "TypeScript: official API + registry"),
    "java": ("Java reader", "from the one registry"),
    "python": ("Python reader", "from the one registry"),
    "swift": ("Swift reader", "from the one registry"),
}
LEVELS = range(1, 6)


def wrap(text, width):
    """Lines of at most `width` pixels, split at spaces."""
    limit, lines, line = int(width / LAYOUT["char"]), [], ""  # LAYOUT is defined below
    for word in text.split():
        if line and len(line) + 1 + len(word) > limit:
            lines.append(line)
            line = word
        else:
            line = f"{line} {word}".strip()
    return lines + [line] if line else lines


def esc(text):
    return html.escape(text, quote=True)


# ---------------------------------------------------------------- sources


def load_levels(root):
    """The five rows of architecture.md's level table, as dicts keyed by its header."""
    text = (root / "docs/architecture.md").read_text(encoding="utf-8")
    rows = [line.strip() for line in text.splitlines() if line.strip().startswith("| ")]
    header = next(readme_status.cells(r) for r in rows if readme_status.cells(r)[:2] == ["Level", "What"])
    levels = []
    for row in rows:
        cells = readme_status.cells(row)
        if len(cells) == len(header) and cells[0].isdigit():
            levels.append(dict(zip(header, cells)))
    if [lv["Level"] for lv in levels] != [str(n) for n in LEVELS]:
        raise SystemExit("docs/architecture.md: the level table must list levels 1 to 5")
    rule = re.search(r"Use the highest level that delivers.*?\.(?= |$)", plain(" ".join(text.split())))
    if not rule:
        raise SystemExit("docs/architecture.md: no «Use the highest level that delivers» sentence")
    # The owner and issue in parentheses are the document's record, not the figure's.
    return levels, re.sub(r" \((?:owner|#)[^)]*\)", "", rule.group(0))


def load_registry(root):
    """(items per level, levels per registry tool) over registry/items/."""
    counts, tools = {n: 0 for n in LEVELS}, {}
    for path in sorted((root / "registry/items").glob("*.json")):
        for item in json.loads(path.read_text(encoding="utf-8"))["items"]:
            counts[item["level"]] += 1
            for reader in item["readers"]:
                tools.setdefault(reader, set()).add(item["level"])
    return counts, tools


def row_levels(tool, registry_tools):
    """A map row's level circles: its registry tools' levels, and 1 when it runs on the official API."""
    levels = set()
    for name in tool["map"]["registry"]:
        levels |= registry_tools.get(name, set())
    if tool["map"]["supernote"] == "ts":
        levels.add(1)
    return sorted(levels)


def code(text):
    """Inline Markdown in a tools.json string as README HTML: `code` and [text](url)."""
    out = esc(text)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', out)


def plain(text):
    """A tools.json string as SVG text: no Markdown."""
    return re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text.replace("`", ""))


# ---------------------------------------------------------------- README block


def readme_block(data, values):
    dots = {value.split(" ", 1)[1]: value.split(" ", 1)[0] for value in values}
    out = []
    for section in data["sections"]:
        out += ([] if out and out[-1] == "" else [""]) + [f"## {section['title']}", ""]
        if section["intro"]:
            out += [section["intro"], ""]
        out += ["<table>", "  <tr><th>Name</th><th>What it does</th></tr>"]
        for tool in (t for t in data["tools"] if t["section"] == section["id"]):
            if tool["status"] not in dots:
                raise SystemExit(f"docs/tools.json: {tool['name']}: status {tool['status']!r} is not one of {', '.join(dots)}")
            icon = (f'<p align="center"><img src="{tool["icon"]}" width="48" height="48" alt=""></p>'
                    if tool.get("icon") else "")
            note = f"<br><sub>{code(tool['note'])}</sub>" if tool.get("note") else ""
            name = (f'<td align="center"><br>{icon}<sub><sup>{dots[tool["status"]]}</sup></sub>&nbsp;'
                    f'<b>{esc(tool["name"])}</b><br><a href="{esc(tool["link"])}">{esc(tool["kind"])}</a>{note}<br><br></td>')
            items = "".join(
                f"<li><b>{esc(f['name'])}</b>: {code(f['text'])}{' (planned)' if f.get('planned') else ''}</li>"
                for f in tool["features"])
            out.append(f"  <tr>{name}<td><br><ul>{items}</ul><br></td></tr>")
        out += ["</table>", ""]
        if section is data["sections"][0]:
            legend = "&emsp;".join(f"<sub><sup>{v.split(' ', 1)[0]}</sup></sub>&nbsp;{v.split(' ', 1)[1]}" for v in values)
            out += [f"Status: {legend}", ""]
    return "\n".join([TOOLS_START] + out + [TOOLS_END])


def with_block(readme, block):
    start, end = readme.find(TOOLS_START), readme.find(TOOLS_END)
    if start < 0 or end < start:
        raise SystemExit("README.md: no tools block markers")
    return readme[:start] + block + readme[end + len(TOOLS_END):]


# ---------------------------------------------------------------- SVG pieces

SVG_NS = "http://www.w3.org/2000/svg"
# Every size of the two diagrams, in px; the one owner of their geometry.
LAYOUT = {
    "line": 18, "char": 6.2, "boldWrap": 0.9, "margin": 24, "radius": 8, "boxRadius": 6, "stroke": 1.5,
    "targetStroke": 2, "pad": 14, "textTop": 24, "dash": "5 4",
    "font": {"title": 14, "text": 13, "small": 12, "label": 11, "labelSpacing": 0.6},
    "levels": {"width": 1000, "titleY": 32, "headY": 60, "top": 74, "rowPad": 22, "rowGap": 10, "minLines": 2,
               "chip": (24, 252), "examples": (296, 260), "breaks": (576, 190), "tested": (784, 170),
               "arrowInset": 26, "arrowLabel": 10, "arrowEnd": 14, "arrowTip": 4, "noteY": 18, "bottom": 36},
    "map": {"widths": (196, 176, 230, 188, 236), "gap": 26, "headY": 30, "top": 46, "rowPad": 20, "rowGap": 14,
            "emptyInset": 12, "circle": 10, "circleStep": 26, "circleInset": 18, "circleText": 4,
            "legendY": 8, "noteY": 30, "bottom": 48},
}
TOOL_COLUMN = 2
ADAPTER_COLUMN = 3
TABLET_COLUMN = 4


def stroked(colour, width):
    return f'stroke="{colour}" stroke-width="{width}"'


def svg(width, height, title, body, c):
    m, r, s = LAYOUT["margin"], LAYOUT["radius"], LAYOUT["stroke"]
    return (f'<svg xmlns="{SVG_NS}" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
            f'role="img" aria-labelledby="t" font-family="{SANS}">\n<title id="t">{esc(title)}</title>\n'
            f'<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{c["ink"]}"/></marker>'
            f'<marker id="headT" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{c["target"]}"/></marker></defs>\n'
            f'<rect x="{s / 2}" y="{s / 2}" width="{width - s}" height="{height - s}" rx="{r}" fill="{c["paper"]}" '
            f'{stroked(c["line"], s)}/>\n' + "\n".join(body) + "\n</svg>\n")


def text(x, y, value, c, size=None, fill="ink", weight=None, mono=False, anchor=None, extra=""):
    attrs = f'x="{x}" y="{y}" font-size="{size or LAYOUT["font"]["text"]}" fill="{c[fill] if fill in c else fill}"'
    if weight:
        attrs += f' font-weight="{weight}"'
    if mono:
        attrs += f' font-family="{MONO}"'
    if anchor:
        attrs += f' text-anchor="{anchor}"'
    return f"<text {attrs}{extra}>{esc(value)}</text>"


def label(x, y, value, c):
    font = LAYOUT["font"]
    return text(x, y, value, c, size=font["label"], fill="muted", mono=True, extra=f' letter-spacing="{font["labelSpacing"]}"')


# ---------------------------------------------------------------- levels diagram


def levels_svg(levels, rule, counts, theme):
    c, L, font, line, top = PALETTE[theme], LAYOUT["levels"], LAYOUT["font"], LAYOUT["line"], LAYOUT["textTop"]
    chip, examples_col, breaks_col, tested_col = L["chip"], L["examples"], L["breaks"], L["tested"]
    body = [text(chip[0], L["titleY"], rule, c, size=font["title"], weight="600"),
            label(chip[0], L["headY"], "LEVEL", c), label(examples_col[0], L["headY"], "EXAMPLES", c),
            label(breaks_col[0], L["headY"], "WHEN IT BREAKS", c), label(tested_col[0], L["headY"], "WHERE IT IS TESTED", c)]
    y = L["top"]
    for lv in levels:
        n = int(lv["Level"])
        examples = wrap(lv["Public examples"], examples_col[1])
        tested = wrap(plain(lv["Tested by"]), tested_col[1])
        breaks = wrap(lv["Breaks when"], breaks_col[1])
        impact = "affects only our tests" if "test" in lv["Impact"] else "affects the person"
        height = L["rowPad"] + max(L["minLines"], len(examples), len(tested), len(breaks) + 1) * line
        count = f"{counts[n]} registry items" if counts[n] else "no registry item needed"
        body.append(f'<rect x="{chip[0]}" y="{y}" width="{chip[1]}" height="{height - L["rowGap"]}" '
                    f'rx="{LAYOUT["boxRadius"]}" fill="{c["l" + str(n)]}"/>')
        body.append(text(chip[0] + LAYOUT["pad"], y + top, f"{n} · {lv['Public name'].upper()}", c,
                         size=font["label"], fill=c["chip"], weight="600", mono=True))
        body.append(text(chip[0] + LAYOUT["pad"], y + top + line, count, c, size=font["small"], fill=c["chip"], mono=True))
        for i, part in enumerate(examples):
            body.append(text(examples_col[0], y + top + i * line, part, c))
        silent = lv["Breaks when"].strip().lower() == "silently"
        for i, part in enumerate(breaks):
            body.append(text(breaks_col[0], y + top + i * line, part, c, fill="bad" if silent else "ink",
                             weight="600" if silent else None))
        body.append(text(breaks_col[0], y + top + len(breaks) * line, impact, c, size=font["small"], fill="muted"))
        for i, part in enumerate(tested):
            body.append(text(tested_col[0], y + top + i * line, part, c))
        y += height
    arrow_x = L["width"] - L["arrowInset"]
    body.append(f'<path d="M{arrow_x} {y - L["arrowEnd"]} V{L["top"] + L["arrowTip"]}" {stroked(c["target"], LAYOUT["targetStroke"])} '
                f'fill="none" marker-end="url(#headT)"/>')
    mid, label_x = (y + L["top"]) // 2, arrow_x - L["arrowLabel"]
    body.append(text(label_x, mid, "prefer higher", c, size=font["label"], fill="target", mono=True, anchor="middle",
                     extra=f' transform="rotate(-90 {label_x} {mid})"'))
    note = "Level 1 is the highest and the steadiest; level 5 the lowest and the most fragile, since it changes with no error."
    body.append(text(chip[0], y + L["noteY"], note, c, size=font["small"], fill="muted"))
    title = "The five dependency levels: " + "; ".join(f"{lv['Level']}, {lv['Public name']}" for lv in levels)
    return svg(L["width"], y + L["bottom"], title, body, c)


# ---------------------------------------------------------------- tool map diagram


def box(x, y, w, h, c, stroke="line", dashed=False, width=None):
    dash = f' stroke-dasharray="{LAYOUT["dash"]}"' if dashed else ""
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{LAYOUT["boxRadius"]}" fill="{c["paper"]}" '
            f'{stroked(c[stroke], width or LAYOUT["stroke"])}{dash}/>')


def lines_in(x, y, lines, width, c, first_bold=False):
    """Each line wrapped to `width`; a first bold line, then muted ones, or muted where planned."""
    out, row, font = [], 0, LAYOUT["font"]
    for i, line in enumerate(lines):
        bold = i == 0 and first_bold
        muted = not bold and (first_bold or "(planned)" in line)
        for part in wrap(line, width * (LAYOUT["boldWrap"] if bold else 1)):
            out.append(text(x, y + row * LAYOUT["line"], part, c, weight="600" if bold else None,
                            size=font["small"] if muted else font["text"], fill="muted" if muted else "ink"))
            row += 1
    return out, row


def arrow(x1, x2, y, c):
    return (f'<path d="M{x1} {y} H{x2 - 2}" {stroked(c["ink"], LAYOUT["stroke"])} fill="none" '
            f'marker-end="url(#head)"/>')


def map_svg(data, registry_tools, theme):
    c, M, font, pad = PALETTE[theme], LAYOUT["map"], LAYOUT["font"], LAYOUT["pad"]
    cols, x = [], LAYOUT["margin"]
    for w in M["widths"]:
        cols.append((x, w))
        x += w + M["gap"]
    width = x - M["gap"] + LAYOUT["margin"]
    heads = ["OUTSIDE WORLD", "SERVICE ADAPTER", "TOOL + PURE LOGIC", "SUPERNOTE ADAPTER", "ON THE TABLET · LEVELS"]
    body = [label(x, M["headY"], head, c) for (x, _), head in zip(cols, heads)]
    y = M["top"]
    rows = [t for t in data["tools"] if "map" in t]
    for tool in rows:
        m = tool["map"]
        planned = tool["status"] == "Planned"
        levels = row_levels(tool, registry_tools)
        cells = [m["outside"], m["service"], [tool["name"] + (" (planned)" if planned else "")] + m["logic"],
                 list(ADAPTERS[m["supernote"]]), m["tablet"]]
        inner = [w - 2 * pad for _, w in cols]
        inner[TABLET_COLUMN] -= len(levels) * M["circleStep"]
        bold = (TOOL_COLUMN, ADAPTER_COLUMN)
        used = max(lines_in(0, 0, lines, inner[i], c, first_bold=i in bold)[1] for i, lines in enumerate(cells))
        h = M["rowPad"] + used * LAYOUT["line"]
        mid = y + h // 2
        drawn = []
        for i, ((x, w), lines) in enumerate(zip(cols, cells)):
            if not lines:
                if i == 0:
                    body.append(text(x + M["emptyInset"], mid, "nothing from outside", c, size=font["small"], fill="muted"))
                continue
            stroke, sw = ("target", LAYOUT["targetStroke"]) if i == ADAPTER_COLUMN else ("line", LAYOUT["stroke"])
            body.append(box(x, y, w, h, c, stroke=stroke, dashed=planned, width=sw))
            body += lines_in(x + pad, y + LAYOUT["textTop"], lines, inner[i], c, first_bold=i in bold)[0]
            drawn.append((x, w))
        for (x1, w1), (x2, _) in zip(drawn, drawn[1:]):
            body.append(arrow(x1 + w1, x2, mid, c))
        x, w = cols[TABLET_COLUMN]
        for k, level in enumerate(reversed(levels)):
            cx, cy = x + w - M["circleInset"] - k * M["circleStep"], y + M["circleInset"]
            body.append(f'<circle cx="{cx}" cy="{cy}" r="{M["circle"]}" fill="{c["l" + str(level)]}"/>')
            body.append(text(cx, cy + M["circleText"], str(level), c, size=font["label"], fill=c["chip"], weight="600",
                             anchor="middle"))
        y += h + M["rowGap"]
    body.append(text(LAYOUT["margin"], y + M["legendY"], "Teal border: every device name a tool uses comes from the one registry.",
                     c, size=font["label"], fill="target", mono=True))
    body.append(text(LAYOUT["margin"], y + M["noteY"], "Each row is a tool. Outside services always enter through an "
                     "adapter in our words; the circles are the tool's dependency levels.", c, size=font["small"], fill="muted"))
    title = "Tool map: for each tool, where its data comes from and where it lands. " + "; ".join(t["name"] for t in rows)
    return svg(width, y + M["bottom"], title, body, c)


# ---------------------------------------------------------------- main


def generate(root):
    """{relative path: expected text} for every file this script owns."""
    data = json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))
    values = readme_status.allowed((root / "AGENTS.md").read_text(encoding="utf-8"))
    if not values:
        raise SystemExit("AGENTS.md: no README Status values line")
    levels, rule = load_levels(root)
    counts, registry_tools = load_registry(root)
    out = {"README.md": with_block((root / "README.md").read_text(encoding="utf-8"), readme_block(data, values))}
    for theme in THEMES:
        out[str(DIAGRAMS / f"levels-{theme}.svg")] = levels_svg(levels, rule, counts, theme)
        out[str(DIAGRAMS / f"tool-map-{theme}.svg")] = map_svg(data, registry_tools, theme)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(args.root)
    problems = []
    for rel, body in generate(root).items():
        path = root / rel
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != body:
                problems.append(f"{rel}: differs from a fresh generation; run python3 scripts/readme_figures.py")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(body, encoding="utf-8")
    for line in problems:
        print(line)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
