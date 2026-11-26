#!/usr/bin/env python3
"""Write the README's credits, tool tables, tool map and level table from the repository's data (#407).

    readme_figures.py [--root DIR] [--check]

Sources, each the one owner of its values:
- docs/tools.json: every tool row (the README Tools and Developer tools tables, the tool map), and
  `credits`, the Supernote projects the README Credits section names (#424);
- docs/architecture.md › Layer rules: the level table's public columns and the rule sentence;
- registry/items/: how many items sit at each level, and each tool's levels;
- AGENTS.md's `- README Status values:` line: the status dots and their legend.

Writes four README blocks, each between its marker comments: the Credits section (CREDITS_START), the
Tools tables (TOOLS_START), the
tool map as a Mermaid flowchart with a table of the same facts under it (MAP_START), and the five
levels as a Markdown table (LEVELS_START). GitHub renders the Mermaid block as accessible SVG, so the
repository holds no image of either figure (owner, 2026-11-26). --check writes nothing: it exits 1
when the README differs from a fresh generation, so a data change that forgets them fails the
`docs` gate. It also exits 1 when a NOTICE.md links a GitHub repository that `credits` neither
credits nor lists in `notCredited`, so a new credit in a NOTICE.md cannot miss the README. The public wording of what it writes is #408's gate.
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

CREDITS_START = "<!-- credits:start: written by scripts/readme_figures.py from docs/tools.json -->"
CREDITS_END = "<!-- credits:end -->"
TOOLS_START = "<!-- tools:start: written by scripts/readme_figures.py from docs/tools.json -->"
TOOLS_END = "<!-- tools:end -->"
MAP_START = "<!-- tool-map:start: written by scripts/readme_figures.py from docs/tools.json and registry/items -->"
MAP_END = "<!-- tool-map:end -->"
LEVELS_START = "<!-- levels:start: written by scripts/readme_figures.py from docs/architecture.md and registry/items -->"
LEVELS_END = "<!-- levels:end -->"

ADAPTERS = {
    "ts": ("sn-adapter", "TypeScript"),
    "java": ("Java reader",),
    "swift": ("Swift reader",),
    "python": ("Python reader",),
}
LEVELS = range(1, 6)
# Each level as a keycap emoji (owner, 2026-11-26, #412).
KEYCAPS = {n: f"{n}\ufe0f\u20e3" for n in range(1, 6)}
# The tool map's groups, by where a tool runs, from its tools.json kind: (subgraph id, heading, kinds).
# A GitHub repository link, as owner/name, in a NOTICE.md (#424).
REPOSITORY = re.compile(r"https://github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?(?=[/)#>\s`]|$)")
OWN_OWNER = "martonpaulo/"
GROUPS = (("plugins", "Tablet plugins", ("plugin",)), ("apps", "Tablet apps", ("app",)),
          ("mac", "Mac", ("Mac app", "CLI")))

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
    """A map row's levels: its registry tools' levels, and 1 when it runs on the official API."""
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


# ---------------------------------------------------------------- credits


def repository(url):
    """The owner/name of a GitHub repository URL, lower case, or None."""
    match = REPOSITORY.match(url)
    return match.group(1).lower() if match else None


def credits_block(credits):
    """The README Credits section: a thank-you, then one bullet per project in each group, no table (#425)."""
    out = [CREDITS_START, "", "## Credits", "", credits["intro"], ""]
    for group in credits["groups"]:
        out += [f"### {group['title']}", ""]
        for row in group["rows"]:
            version = f" {row['version']}" if row.get("version") else ""
            out.append(f"- [{row['project']}]({row['url']}){version} by {row['author']}: {row['text']}.")
        out.append("")
    out += [credits["closing"], ""]
    return "\n".join(out + [CREDITS_END])


def credit_problems(root, credits):
    """What the credits break: a row whose Where file is missing, or a NOTICE.md that links a GitHub
    repository the credits neither credit nor leave out by name (#424)."""
    problems = []
    named = set()
    for group in credits["groups"]:
        for row in group["rows"]:
            named.add(repository(row["url"]))
            if not (root / row["where"]).is_file():
                problems.append(f"docs/tools.json: credits: {row['project']}: no file {row['where']}")
    named |= {repository(url) for url in credits["notCredited"]}
    for notice in sorted(root.glob("**/NOTICE.md")):
        rel = notice.relative_to(root).as_posix()
        if "node_modules" in notice.parts:
            continue
        found = {m.group(1).lower() for m in REPOSITORY.finditer(notice.read_text(encoding="utf-8"))}
        for repo in sorted(found - named):
            if not repo.startswith(OWN_OWNER):
                problems.append(f"{rel}: links {repo}, which docs/tools.json credits neither credits nor lists "
                                "in notCredited")
    return problems


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
        out.append(f"| {KEYCAPS[n]} {lv['Public name']} | {lv['Public examples']} | {breaks}; {impact} "
                   f"| {lv['Tested by']} | {count} |")
    out += ["", "Level 1 is the highest and the steadiest; level 5 is the lowest and changes with no error.", "",
            LEVELS_END]
    return "\n".join(out)


# ---------------------------------------------------------------- tool map


def node_text(lines, bold_first=False):
    """A Mermaid node label: one line per entry, the first bold when asked, quotes as entities."""
    parts = [plain(line).replace('"', "#quot;") for line in lines]
    if bold_first and parts:
        parts[0] = f"<b>{parts[0]}</b>"
    return "<br/>".join(parts)


def keycaps(levels):
    """Each level as its keycap, separated by spaces: «1️⃣ 2️⃣ 5️⃣»."""
    return " ".join(KEYCAPS[n] for n in levels)


def cell(lines):
    """A Markdown table cell with one item per line."""
    return "<br>".join(plain(line) for line in lines)


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def group_of(tool):
    """The tool map group of a tool, from its kind."""
    for key, _, kinds in GROUPS:
        if tool["kind"] in kinds:
            return key
    raise SystemExit(f"docs/tools.json: {tool['name']}: kind {tool['kind']!r} has no tool map group")


def map_block(data, registry_tools):
    """The tool map as one top-to-bottom Mermaid flowchart that draws each part once (owner, 2026-11-26,
    #412): the outside service groups, the service adapters, the tools in three groups by where they run,
    the Supernote adapters, the registry and the tablet; and a table of the same facts with the levels."""
    rows = [t for t in data["tools"] if "map" in t]
    names = "; ".join(t["name"] + (" (planned)" if t["status"] == "Planned" else "") for t in rows)
    outside, services, edges, planned, table = [], {}, [], [], []
    members = {key: [] for key, _, _ in GROUPS}
    for tool in rows:
        m, node = tool["map"], "t_" + slug(tool["name"])
        is_planned = tool["status"] == "Planned"
        title = tool["name"] + (" (planned)" if is_planned else "")
        members[group_of(tool)].append((node, tool))
        if is_planned:
            planned.append(node)
        for source in m["sources"]:
            source_node = "o_" + slug(source["outside"][0])
            dashed = source.get("planned") or is_planned
            outside.append(f'    {source_node}["{node_text(source["outside"])}"]')
            if dashed:
                planned.append(source_node)
            if source.get("via"):
                service = "s_" + slug(source["via"])
                services.setdefault(service, f'    {service}["{node_text([source["via"]])}"]')
                if dashed:
                    planned.append(service)
                edges += [(source_node, service, dashed), (service, node, dashed)]
            else:
                edges.append((source_node, node, dashed))
        levels = row_levels(tool, registry_tools)
        sources = [f"{s['outside'][i]}" + (" (planned)" if s.get("planned") and i == 0 else "")
                   for s in m["sources"] for i in range(len(s["outside"]))]
        via = [s["via"] + (" (planned)" if s.get("planned") else "") for s in m["sources"] if s.get("via")]
        table.append(f"| {title} | {cell(sources) or 'nothing from outside'} | {cell(via + [ADAPTERS[m['supernote']][0]])} "
                     f"| {cell(m['tablet'])} | {keycaps(levels)} |")
    used = []
    for key, _, _ in GROUPS:
        runtimes = {t["map"]["supernote"] for _, t in members[key]}
        if len(runtimes) == 1:
            edges.append((f"g_{key}", f"a_{runtimes.pop()}", False))
        else:
            edges += [(node, f"a_{t['map']['supernote']}", False) for node, t in members[key]]
        used += [t["map"]["supernote"] for _, t in members[key]]
    adapters = [a for a in ADAPTERS if a in used]
    out = [MAP_START, "", "```mermaid", "flowchart TB",
           "  accTitle: Tool map: where each tool's data comes from and where it lands",
           "  accDescr: Top to bottom: the outside services, the service adapters they enter through, the tools "
           "grouped by where they run (tablet plugins, tablet apps, Mac), the Supernote adapter of each runtime, "
           f"the one registry of device dependencies they all read, and the tablet. Tools: {names}."]
    out += ['  subgraph outside["Outside world"]'] + outside + ["  end"]
    out += ['  subgraph services["Service adapters"]'] + list(services.values()) + ["  end"]
    for key, head, _ in GROUPS:
        if not members[key]:
            continue
        out.append(f'  subgraph g_{key}["{head}"]')
        out += [f'    {node}["{node_text([t["name"] + (" (planned)" if node in planned else "")] + t["map"]["logic"], bold_first=True)}"]'
                for node, t in members[key]]
        out.append("  end")
    out += ['  subgraph adapters["Supernote adapters"]']
    out += [f'    a_{a}["{node_text(ADAPTERS[a], bold_first=True)}"]' for a in adapters] + ["  end"]
    out += ['  registry["<b>Registry</b><br/>of device dependencies"]', '  tablet["<b>Supernote tablet</b>"]']
    out += [f"  {a} {'-.->' if dashed else '-->'} {b}" for a, b, dashed in edges]
    out += [f"  a_{a} --> registry" for a in adapters] + ["  registry --> tablet"]
    out += ["  classDef planned stroke-dasharray: 5 5"]
    if planned:
        out.append("  class " + ",".join(dict.fromkeys(planned)) + " planned")
    out += ["```", "", "| Tool | Source | Adapter | On the tablet | Levels |", "| :--- | :--- | :--- | :--- | :--- |"]
    out += table + ["", MAP_END]
    return "\n".join(out)


# ---------------------------------------------------------------- main


def data_problems(root, data):
    """What docs/tools.json breaks: a row with no icon file (#412), or a list joined with «·» on one
    line in the tool map's data, where each item takes its own line (owner, 2026-11-26)."""
    problems = []
    for tool in data["tools"]:
        icon = tool.get("icon")
        if not icon or not (root / icon).is_file():
            problems.append(f"docs/tools.json: {tool['name']}: no icon file ({icon or 'no icon'}); draw it with scripts/icons.py")
        m = tool.get("map") or {}
        texts = m.get("logic", []) + m.get("tablet", [])
        for source in m.get("sources", []):
            texts += source["outside"] + [source.get("via") or ""]
        problems += [f"docs/tools.json: {tool['name']}: «{x}» joins a list with «·»; give each item its own line"
                     for x in texts if "\u00b7" in x]
    return problems


def generate(root):
    """{relative path: expected text} for every file this script owns."""
    data = json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))
    problems = data_problems(root, data) + credit_problems(root, data["credits"])
    if problems:
        raise SystemExit("\n".join(problems))
    values = readme_status.allowed((root / "AGENTS.md").read_text(encoding="utf-8"))
    if not values:
        raise SystemExit("AGENTS.md: no README Status values line")
    levels, rule = load_levels(root)
    counts, registry_tools = load_registry(root)
    readme = (root / "README.md").read_text(encoding="utf-8")
    readme = with_block(readme, credits_block(data["credits"]), CREDITS_START, CREDITS_END)
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
