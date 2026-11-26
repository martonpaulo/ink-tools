#!/usr/bin/env python3
"""Write the home page's tool cards, install guide, credits and licence from the repository's data (#437).

    site_figures.py [--root DIR] [--check]
    site_figures.py fetch [--root DIR]

The README's sibling: the same sources, in a landing page's form, so no tool fact is typed twice.

- docs/tools.json: the Tools and Developer tools sections, each tool's kind, status and features, and
  `credits`; readme_figures.py's check holds each status to AGENTS.md's README Status values;
- docs/releases.json: each release prefix's newest stable release, else its newest beta, which `fetch`
  writes from the GitHub REST API; the Download button links its file, so the page stays static;
- docs/install.md: every `## Install ...` section, as the page's numbered install guide;
- README.md's `## License` paragraph: the licence line.

Writes three blocks of site/index.html, each between its marker comments. A card keeps the body of
its `<!-- media:SLOT -->` block, which scripts/site_media.py owns. --check writes nothing: it exits 1
when the page differs from a fresh generation, so the `site` gate fails on a page that fell behind.
"""
import argparse
import html
import json
import posixpath
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import readme_figures  # noqa: E402

PAGE = "site/index.html"
RELEASES = "docs/releases.json"
SHOTS = "design/site-media/shots.json"
REPO = "martonpaulo/ink-tools"
REPO_URL = f"https://github.com/{REPO}"
BLOCKS = ("tools", "install", "credits")
KIND_LABELS = {"plugin": "Plugin", "app": "Tablet app", "Mac app": "Mac app", "CLI": "Mac command line"}
INSTALL_HEADING = re.compile(r"^## (Install .+)$", re.M)
STABLE = re.compile(r"-v(\d+\.\d+\.\d+)$")
BETA = re.compile(r"-v(\d+\.\d+\.\d+-beta\.\d+)$")
RELEASE_FILES = (".snplg", ".apk")
EXTERNAL = 'target="_blank" rel="noopener"'


def start_marker(name):
    return f"<!-- site-{name}:start: written by scripts/site_figures.py -->"


def end_marker(name):
    return f"<!-- site-{name}:end -->"


def esc(text):
    return html.escape(text, quote=True)


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def inline(text, base=""):
    """Inline Markdown as page HTML: `code` and [text](url); a path relative to `base`, the folder of
    the Markdown file it comes from, links to GitHub."""
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", esc(text))

    def link(match):
        label, url = match.group(1), html.unescape(match.group(2))
        if not url.startswith("https://"):
            url = f"{REPO_URL}/blob/main/{posixpath.normpath(posixpath.join(base, url.split('#')[0]))}" + (
                "#" + url.split("#", 1)[1] if "#" in url else "")
        return f'<a href="{esc(url)}" {EXTERNAL}>{label}</a>'

    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link, out)


# ---------------------------------------------------------------- releases


def pick_releases(releases, prefixes):
    """{prefix: row} for each prefix with a release: the newest stable one, else the newest beta, with
    its first release file. `releases` is the REST list, newest first; drafts and dev builds never count."""
    chosen = {}
    for prefix in prefixes:
        best = {}
        for rel in releases:
            tag = rel["tag_name"]
            if rel.get("draft") or not tag.startswith(f"{prefix}-v"):
                continue
            files = [a["name"] for a in rel.get("assets", []) if a["name"].endswith(RELEASE_FILES)]
            stable, beta = STABLE.search(tag), BETA.search(tag)
            kind = "stable" if stable and not rel.get("prerelease") else "beta" if beta else None
            if files and kind and kind not in best:
                best[kind] = {"tag": tag, "version": (stable or beta).group(1), "file": files[0],
                              "stable": kind == "stable"}
        if best:
            chosen[prefix] = best.get("stable") or best["beta"]
    return chosen


def prefix_of(tool):
    match = readme_figures.RELEASE_QUERY.search(tool.get("link", ""))
    return match.group(1) if match else None


def fetch(root):
    """Write docs/releases.json from the GitHub REST API, through the gh command line.

    shortcut: run by hand after a release, so a new release reaches the page only with the next fetch
    commit; upgrade to a fetch in the deploy's staging step when releases come faster than pages change."""
    out = subprocess.run(["gh", "api", "--paginate", "--slurp", f"repos/{REPO}/releases?per_page=100"],
                         capture_output=True, text=True, check=True).stdout
    releases = [rel for page in json.loads(out) for rel in page]
    releases.sort(key=lambda rel: rel.get("published_at") or "", reverse=True)
    data = json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))
    prefixes = sorted({p for p in map(prefix_of, data["tools"]) if p})
    body = {"about": "Written by scripts/site_figures.py fetch from the GitHub releases (#437): for each "
                     "release prefix of docs/tools.json, the newest stable release, else the newest beta, "
                     "and its file. The home page's Download buttons link these files.",
            "releases": pick_releases(releases, prefixes)}
    (root / RELEASES).write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- blocks


def download(tool, releases):
    """The card's Download link and version line, or nothing for a tool with no release to offer."""
    row = releases.get(prefix_of(tool) or "")
    if not row or tool["status"] == "Internal":
        return []
    url = f"{REPO_URL}/releases/download/{row['tag']}/{row['file']}"
    notes = f"{REPO_URL}/releases/tag/{row['tag']}"
    label = f"Version {row['version']}" if row["stable"] else f"Beta build {row['version']}"
    return ['      <p class="download">',
            f'        <a class="button primary" href="{esc(url)}" {EXTERNAL}>Download<span class="visually-hidden"> {esc(tool["name"])}</span></a>',
            f'        <a class="version" href="{esc(notes)}" {EXTERNAL}>{esc(label)}</a>',
            "      </p>"]


def card(tool, releases, media):
    kind = KIND_LABELS.get(tool["kind"])
    if not kind:
        raise SystemExit(f"docs/tools.json: {tool['name']}: kind {tool['kind']!r} has no page label")
    status = tool["status"]
    items = "".join(f"<li><strong>{esc(f['name'])}</strong>: {inline(f['text'])}"
                    f"{' <em>(planned)</em>' if f.get('planned') else ''}</li>" for f in tool["features"])
    out = ['    <li class="card">',
           '      <p class="card-head">',
           f'        <img src="/icons/{slug(tool["name"])}.png" width="48" height="48" alt="">',
           f'        <span class="kind">{kind}</span>',
           f'        <span class="badge status-{slug(status)}">{esc(status)}</span>',
           "      </p>",
           f"      <h3>{esc(tool['name'])}</h3>",
           f"      <ul class=\"features\">{items}</ul>"]
    out += download(tool, releases)
    slot = slug(tool["name"])
    if slot in media:
        out += [f"      <!-- media:{slot}: {media[slot][0]} -->", *("      " + line for line in media[slot][1]), f"      <!-- /media:{slot} -->"]
    return out + ["    </li>"]


def tools_block(data, releases, media):
    out = []
    for section in data["sections"]:
        out += ["", f'<section class="section" id="{section["id"]}" aria-labelledby="{section["id"]}-title">',
                '  <div class="container">', f'  <h2 id="{section["id"]}-title">{esc(section["title"])}</h2>']
        if section["intro"]:
            out.append(f'  <p class="lead">{esc(section["intro"])}</p>')
        out.append('  <ul class="grid-3 cards">')
        for tool in (t for t in data["tools"] if t["section"] == section["id"]):
            out += card(tool, releases, media)
        out += ["  </ul>", "  </div>", "</section>"]
    return out + [""]


def markdown_steps(text, source):
    """One install section's Markdown as HTML: paragraphs and one numbered list, nothing else."""
    out, items, para = [], [], []
    for line in text.strip().splitlines() + [""]:
        step = re.match(r"^\d+\. (.*)$", line)
        if step:
            items.append(step.group(1))
        elif line.startswith("   ") and items:
            items[-1] += " " + line.strip()
        elif line.strip():
            if line.startswith(("#", "|", "-", "*", ">", "```")):
                raise SystemExit(f"{source}: the page reads only paragraphs and numbered steps: {line!r}")
            para.append(line.strip())
        else:
            if para:
                out.append(f"<p>{inline(' '.join(para), 'docs')}</p>")
                para = []
    if items:
        out.append("<ol class=\"steps\">" + "".join(f"<li>{inline(i, 'docs')}</li>" for i in items) + "</ol>")
    return out


def install_block(text):
    """Every `## Install ...` section of docs/install.md, in its order, plugin first."""
    heads = list(INSTALL_HEADING.finditer(text))
    if not heads or not heads[0].group(1).lower().endswith("plugin"):
        raise SystemExit("docs/install.md: the first «## Install ...» section must be the plugin's")
    out = ["", '<div class="install-grid">']
    for head in heads:
        rest = text[head.end():]
        nxt = re.search(r"^## ", rest, re.M)
        body = rest[:nxt.start()] if nxt else rest
        out += ['  <article class="install">', f"    <h3>{esc(head.group(1))}</h3>"]
        out += ["    " + line for line in markdown_steps(body, "docs/install.md")]
        out.append("  </article>")
    return out + ["</div>", ""]


def credits_block(credits, licence):
    lines = {}
    for group in credits["groups"]:
        for row in group["rows"]:
            lines.setdefault(row["url"], []).append(row["text"])
    out = ["", f"<p>{inline(credits['intro'])}</p>", '<ul class="credits">']
    out += [f'  <li><a href="{esc(url)}" {EXTERNAL}>{esc(readme_figures.repository_name(url))}</a>: '
            f"{inline('; '.join(texts))}.</li>" for url, texts in lines.items()]
    out += ["</ul>", f"<p>{inline(credits['closing'])}</p>",
            '<h3 id="license">License</h3>', f"<p>{licence}</p>", ""]
    return out


def licence_line(readme):
    """README.md's License paragraph, with its relative links made absolute."""
    match = re.search(r"^## License\n\n(.+?)(?:\n\n|\n?\Z)", readme, re.M | re.S)
    if not match:
        raise SystemExit("README.md: no «## License» paragraph")
    text = " ".join(match.group(1).split())
    return inline(re.sub(r"\]\(LICENSE\)", f"]({REPO_URL}/blob/main/LICENSE)", text))


def media_blocks(root, page):
    """{slot: (writer note, body lines)} for every slot of design/site-media/shots.json: the body
    site_media.py wrote on the page, or an empty one for it to fill."""
    shots = json.loads((root / SHOTS).read_text(encoding="utf-8"))
    found = {slot: (f"written by scripts/site_media.py from {SHOTS}", []) for slot in shots["slots"]}
    pattern = re.compile(r"^(?P<indent>[ \t]*)<!-- media:(?P<slot>[a-z0-9-]+): (?P<note>.*?) -->\n(?P<body>.*?)^[ \t]*<!-- /media:(?P=slot) -->$", re.M | re.S)
    for match in pattern.finditer(page):
        indent, slot = match["indent"], match["slot"]
        if slot in found:  # each line without the marker's indent, which the card writes again
            found[slot] = (match["note"], [line.removeprefix(indent) for line in match["body"].splitlines()])
    return found


def replace(page, name, lines, indent):
    start, end = page.find(start_marker(name)), page.find(end_marker(name))
    if start < 0 or end < start:
        raise SystemExit(f"{PAGE}: no {start_marker(name)} ... {end_marker(name)} markers")
    body = "\n".join((indent + line) if line else "" for line in lines)
    return page[:start] + start_marker(name) + body + indent + end_marker(name) + page[end + len(end_marker(name)):]


def generate(root):
    """The page as a fresh generation would write it."""
    data = json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))
    releases = json.loads((root / RELEASES).read_text(encoding="utf-8"))["releases"]
    page = (root / PAGE).read_text(encoding="utf-8")
    media = media_blocks(root, page)
    page = replace(page, "tools", tools_block(data, releases, media), "    ")
    page = replace(page, "install", install_block((root / "docs/install.md").read_text(encoding="utf-8")), "        ")
    readme = (root / "README.md").read_text(encoding="utf-8")
    page = replace(page, "credits", credits_block(data["credits"], licence_line(readme)), "        ")
    return page


def icon_problems(root, data):
    """A tool whose page icon, site/icons/<slug>.png, is missing or differs from its README icon, which
    owns it: the deploy publishes site/ alone, so the page holds a copy, written by a plain write."""
    problems = []
    for tool in data["tools"]:
        page_icon = root / "site/icons" / f"{slug(tool['name'])}.png"
        if not page_icon.is_file() or page_icon.read_bytes() != (root / tool["icon"]).read_bytes():
            problems.append(f"{page_icon.relative_to(root).as_posix()}: differs from {tool['icon']}")
    return problems


def write_icons(root, data):
    (root / "site/icons").mkdir(exist_ok=True)
    for tool in data["tools"]:
        (root / "site/icons" / f"{slug(tool['name'])}.png").write_bytes((root / tool["icon"]).read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", nargs="?", choices=["fetch"])
    parser.add_argument("--root", default=".")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = Path(args.root)
    if args.command == "fetch":
        fetch(root)
        return 0
    data = json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))
    body = generate(root)
    path = root / PAGE
    problems = []
    if args.check:
        problems = icon_problems(root, data)
        if path.read_text(encoding="utf-8") != body:
            problems.append(f"{PAGE}: differs from a fresh generation; run python3 scripts/site_figures.py")
    else:
        write_icons(root, data)
        path.write_text(body, encoding="utf-8")
    for line in problems:
        print(line)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
