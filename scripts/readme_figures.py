#!/usr/bin/env python3
"""Write the README's tool tables, tool map and level table from the repository's data (#407).

    readme_figures.py [--root DIR] [--check]

Sources, each the one owner of its values:
- docs/tools.json: every tool row (the README Tools and Developer tools tables, the tool map);
- docs/architecture.md › Layer rules: the level table's public columns and the rule sentence;
- registry/items/: how many items sit at each level, and each tool's level circles;
- AGENTS.md's `- README Status values:` line: the status dots and their legend.

Writes three README blocks, each between its marker comments: the Tools tables (TOOLS_START), the
tool map as a Mermaid flowchart with a table of the same facts under it (MAP_START), and the five
levels as a Markdown table (LEVELS_START). GitHub renders the Mermaid block as accessible SVG, so the
repository holds no image of either figure (owner, 2026-11-26). --check writes nothing: it exits 1
when the README differs from a fresh generation, so a data change that forgets them fails the
`docs` gate. The public wording of what it writes is #408's gate.
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
MAP_START = "<!-- tool-map:start: written by scripts/readme_figures.py from docs/tools.json and registry/items -->"
MAP_END = "<!-- tool-map:end -->"
LEVELS_START = "<!-- levels:start: written by scripts/readme_figures.py from docs/architecture.md and registry/items -->"
LEVELS_END = "<!-- levels:end -->"

ADAPTERS = {
    "ts": ("sn-adapter", "TypeScript: official API + registry"),
    "java": ("Java reader", "from the one registry"),
    "python": ("Python reader", "from the one registry"),
    "swift": ("Swift reader", "from the one registry"),
}
LEVELS = range(1, 6)
# The coloured chip of each level, in the order of the owner's palette (green for the steadiest).
CHIPS = {1: "🟩", 2: "🟦", 3: "🟨", 4: "🟪", 5: "🟥"}
# The tool map's columns, left to right: the subgraph id and its heading.
MAP_COLUMNS = (("outside", "Outside world"), ("service", "Service adapter"), ("tool", "Tool + pure logic"),
               ("adapter", "Supernote adapter"), ("tablet", "On the tablet · levels"))


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
    """A tools.json string as plain text, for a Mermaid label or the rule sentence: no Markdown."""
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


def with_block(readme, block, start_marker, end_marker):
    """`readme` with the text from `start_marker` to `end_marker` replaced by `block`, which holds both."""
    start, end = readme.find(start_marker), readme.find(end_marker)
    if start < 0 or end < start:
        raise SystemExit(f"README.md: no {start_marker} ... {end_marker} markers")
    return readme[:start] + block + readme[end + len(end_marker):]


# ---------------------------------------------------------------- level table


def levels_block(levels, rule, counts):
    """The five levels as a Markdown table, the rule sentence above it and the reading line under it."""
    out = [LEVELS_START, "", rule, "",
           "| Level | Examples | When it breaks | Where it is tested | Registry items |",
           "| :--- | :--- | :--- | :--- | ---: |"]
    for lv in levels:
        n = int(lv["Level"])
        breaks = lv["Breaks when"]
        if breaks.strip().lower() == "silently":
            breaks = f"**{breaks}**"
        impact = "affects only our tests" if "test" in lv["Impact"] else "affects the person"
        count = str(counts[n]) if counts[n] else "none needed"
        out.append(f"| {CHIPS[n]} {n} · {lv['Public name']} | {lv['Public examples']} | {breaks}; {impact} "
                   f"| {lv['Tested by']} | {count} |")
    out += ["", "Level 1 is the highest and the steadiest; level 5 is the lowest and changes with no error.", "",
            LEVELS_END]
    return "\n".join(out)


# ---------------------------------------------------------------- tool map


def node_text(lines, bold_first=False):
    """Mermaid node label: one line per entry, the first bold when asked, quotes as entities."""
    parts = [plain(line).replace('"', "#quot;") for line in lines]
    if bold_first and parts:
        parts[0] = f"<b>{parts[0]}</b>"
    return "<br>".join(parts)


def chips(levels, sep=" "):
    """Each level as its chip and number; `sep=""` keeps them together where a Mermaid label wraps."""
    return " ".join(f"{CHIPS[n]}{sep}{n}" for n in levels)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def map_block(data, registry_tools):
    """The tool map as one Mermaid flowchart, a column per subgraph and a chain per tool, and a table of
    the same facts for readers without Mermaid."""
    rows = [t for t in data["tools"] if "map" in t]
    names = "; ".join(t["name"] + (" (planned)" if t["status"] == "Planned" else "") for t in rows)
    columns = {key: [] for key, _ in MAP_COLUMNS}
    chains, planned, table = [], [], []
    for tool in rows:
        m, base = tool["map"], slug(tool["name"])
        is_planned = tool["status"] == "Planned"
        levels = row_levels(tool, registry_tools)
        title = tool["name"] + (" (planned)" if is_planned else "")
        adapter = ADAPTERS[m["supernote"]]
        cells = {"outside": node_text(m["outside"]), "service": node_text(m["service"]),
                 "tool": node_text([title] + m["logic"], bold_first=True),
                 "adapter": node_text(adapter, bold_first=True),
                 "tablet": node_text(m["tablet"] + [f"levels {chips(levels, sep='')}"])}
        chain = []
        for key, _ in MAP_COLUMNS:
            if cells[key]:
                columns[key].append(f'    {base}_{key}["{cells[key]}"]')
                chain.append(f"{base}_{key}")
        chains.append("  " + " --> ".join(chain))
        if is_planned:
            planned += chain
        source = ", ".join(plain(x) for x in m["outside"]) or "nothing from outside"
        via = ", ".join(plain(x) for x in m["service"])
        table.append(f"| {title} | {source} | {via + '; ' if via else ''}{adapter[0]} | {chips(levels)} |")
    out = [MAP_START, "", "```mermaid", "flowchart LR",
           "  accTitle: Tool map: where each tool's data comes from and where it lands",
           "  accDescr: One chain per tool, left to right: the outside world, the service adapter, the tool and its "
           f"pure logic, the Supernote adapter, and what it changes on the tablet with its dependency levels. Tools: {names}."]
    for key, head in MAP_COLUMNS:
        out += [f'  subgraph {key}["{head}"]', "    direction TB"] + columns[key] + ["  end"]
    out += chains
    out += ["  classDef planned stroke-dasharray: 5 5",
            "  classDef registry stroke-width: 2px"]
    out.append("  class " + ",".join(f"{slug(t['name'])}_adapter" for t in rows) + " registry")
    if planned:
        out.append("  class " + ",".join(planned) + " planned")
    out += ["```", "", "| Tool | Source | Adapter | Levels |", "| :--- | :--- | :--- | :--- |"] + table + ["", MAP_END]
    return "\n".join(out)


# ---------------------------------------------------------------- main


def generate(root):
    """{relative path: expected text} for every file this script owns."""
    data = json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))
    values = readme_status.allowed((root / "AGENTS.md").read_text(encoding="utf-8"))
    if not values:
        raise SystemExit("AGENTS.md: no README Status values line")
    levels, rule = load_levels(root)
    counts, registry_tools = load_registry(root)
    readme = (root / "README.md").read_text(encoding="utf-8")
    readme = with_block(readme, readme_block(data, values), TOOLS_START, TOOLS_END)
    readme = with_block(readme, map_block(data, registry_tools), MAP_START, MAP_END)
    readme = with_block(readme, levels_block(levels, rule, counts), LEVELS_START, LEVELS_END)
    return {"README.md": readme}


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
