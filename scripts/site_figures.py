#!/usr/bin/env python3
"""Write the home page's tool cards, install guide and credits from the repository's data (#437), and check the page (#439).

    site_figures.py [--root DIR] [--check]
    site_figures.py fetch [--root DIR]

The README's sibling: the same sources, in a landing page's form, so no tool fact is typed twice.

- docs/tools.json: the Tools and Developer tools sections, each tool's kind, status and features, and
  `credits`; readme_figures.py's check holds each status to AGENTS.md's README Status values;
- docs/releases.json: each release prefix's newest stable release, else its newest beta, which `fetch`
  writes from the GitHub REST API; the Download button links its file, so the page stays static;
- docs/install.md: every `## Install ...` section, as the page's numbered install guide;
- site/icons/<icon>.svg: each tool's icon, which scripts/icons.py draws in the plugin icons' style.

Writes three blocks of site/index.html, each between its marker comments. A card keeps the body of
its `<!-- media:SLOT -->` block, which scripts/site_media.py owns. --check writes nothing: it exits 1
when the page differs from a fresh generation, so the `site` gate fails on a page that fell behind.
It also fails on a repeated fact or a narrowed section (#439):

- a sentence of four words or more, or a link target, that appears twice on a page outside its
  navigation (the site header and any <nav>);
- a width the layout does not own: every <section> holds one `.container`, `.container` alone is
  `var(--page-width)` wide, the header's width, and only a paragraph (`p`) takes a `max-width`, which
  is `var(--measure-prose)`, so no section's content box is narrower than the header's.
"""
import argparse
import html
from html.parser import HTMLParser
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
SITE_URL = "https://inktools.martonpaulo.com/"
PAGES = ("site/index.html", "site/privacy/index.html", "site/404.html")
CSS = "site/styles/main.css"
MIN_WORDS = 4  # a shorter run, such as «Download» or «Version 0.1.0», is a label, not a sentence
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
    the Markdown file it comes from, links to GitHub; a link to this site's home page stays on the page."""
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", esc(text))

    def link(match):
        label, url = match.group(1), html.unescape(match.group(2))
        if url.startswith(SITE_URL + "#"):
            return f'<a href="{esc(url.removeprefix(SITE_URL))}">{label}</a>'
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
           f'        <img src="/{icon_path(tool)}" width="48" height="48" alt="">',
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


def credits_block(credits):
    lines = {}
    for group in credits["groups"]:
        for row in group["rows"]:
            lines.setdefault(row["url"], []).append(row["text"])
    out = ["", f"<p>{inline(credits['intro'])}</p>", '<ul class="credits">']
    out += [f'  <li><a href="{esc(url)}" {EXTERNAL}>{esc(readme_figures.repository_name(url))}</a>: '
            f"{inline('; '.join(texts))}.</li>" for url, texts in lines.items()]
    # The licence is said once, in the footer of every page (#439).
    return out + ["</ul>", f"<p>{inline(credits['closing'])}</p>", ""]


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
    page = replace(page, "credits", credits_block(data["credits"]), "        ")
    return page


def icon_path(tool):
    """The tool's page icon, named as its README icon is: scripts/icons.py writes it (#439)."""
    return f"icons/{Path(tool['icon']).stem}.svg"


def icon_problems(root, data):
    return [f"site/{icon_path(t)}: {t['name']} has no page icon; run python3 scripts/icons.py"
            for t in data["tools"] if not (root / "site" / icon_path(t)).is_file()]


# ---------------------------------------------------------------- page checks (#439)

BLOCK_TAGS = {"p", "li", "h1", "h2", "h3", "h4", "figcaption", "td", "th", "dt", "dd", "div", "section", "header", "footer", "ul", "ol"}
SKIPPED = {"head", "header", "nav", "script", "style"}  # the site header is navigation


class Reader(HTMLParser):
    """A page's visible text, one block per line, and its link targets, outside <head>, the site header, <nav> and scripts."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.text, self.links, self.skip, self.sections = [], [], 0, []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in SKIPPED:
            self.skip += 1
        if tag == "section":
            self.sections.append([])
        elif self.sections and tag == "div" and len(self.sections[-1]) == 0:
            self.sections[-1].append(attrs.get("class") or "")
        if self.skip:
            return
        if tag in BLOCK_TAGS:
            self.text.append("\n")
        if tag == "a" and attrs.get("href"):
            self.links.append(attrs["href"])

    def handle_endtag(self, tag):
        if tag in SKIPPED:
            self.skip -= 1
        elif tag in BLOCK_TAGS and not self.skip:
            self.text.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.text.append(data)


def sentences(text):
    for block in text.split("\n"):
        for sentence in re.split(r"(?<=[.!?])\s+", " ".join(block.split())):
            if len(sentence.split()) >= MIN_WORDS:
                yield sentence


def repetition_problems(name, page):
    """A sentence or a link target that a page says twice outside its navigation."""
    reader = Reader()
    reader.feed(page)
    seen, problems = set(), []
    for kind, items in (("sentence", sentences("".join(reader.text))), ("link target", reader.links)):
        for item in items:
            if (kind, item) in seen:
                problems.append(f"{name}: the {kind} «{item}» appears twice; say it once")
            seen.add((kind, item))
    return problems


def section_problems(name, page):
    """A <section> whose first block is not the `.container` that owns the page width."""
    reader = Reader()
    reader.feed(page)
    return [f"{name}: a <section> whose first block is not <div class=\"container\">"
            for first in reader.sections if first != ["container"]]


WIDTH = re.compile(r"(?:^|;|\{)\s*(max-width|max-inline-size|width|inline-size)\s*:\s*([^;}]+)")
RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
SMALL_LENGTH = re.compile(r"^-?[\d.]+(px|em)$|^100%$")  # an icon, a dot, a hidden label, a full-width picture


def width_problems(css):
    """A width declaration the layout does not own (#439): only `.container` takes `var(--page-width)`,
    the header's width; only a paragraph takes a `max-width`, `var(--measure-prose)`; any other width
    is a small fixed size or 100%, never a measure that narrows a section."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    problems = []
    for selectors, body in RULE.findall(css):
        selectors = [" ".join(sel.split()) for sel in re.split(r",(?![^()]*\))", selectors)]  # not a comma inside :not(...)
        if selectors[0].startswith("@"):
            continue
        for prop, value in WIDTH.findall(body):
            value = value.strip()
            if value == "var(--page-width)" and prop == "width" and selectors == [".container"]:
                continue
            if value == "var(--measure-prose)" and prop == "max-width" and all(re.search(r"(^|[\s>+~])p(\.[\w-]+|:[\w-]+(\([^)]*\))?)*$", sel) for sel in selectors):
                continue
            if prop in ("width", "inline-size") and SMALL_LENGTH.match(value):
                continue
            problems.append(f"{CSS}: {', '.join(selectors)} {{ {prop}: {value} }}: only .container sets the width "
                            "(var(--page-width)) and only a paragraph a measure (var(--measure-prose))")
    return problems


def page_problems(root):
    problems = width_problems((root / CSS).read_text(encoding="utf-8"))
    for name in PAGES:
        page = (root / name).read_text(encoding="utf-8")
        problems += section_problems(name, page) + repetition_problems(name, page)
    return problems


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
        problems = icon_problems(root, data) + page_problems(root)
        if path.read_text(encoding="utf-8") != body:
            problems.append(f"{PAGE}: differs from a fresh generation; run python3 scripts/site_figures.py")
    else:
        path.write_text(body, encoding="utf-8")
    for line in problems:
        print(line)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
