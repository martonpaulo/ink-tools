#!/usr/bin/env python3
"""Write the home page's tool cards, install guide, credits and hero counts from the repository's data (#437, #443), and check the page (#439, #443).

    site_figures.py [--root DIR] [--check]
    site_figures.py fetch [--root DIR]

The README's sibling: the same sources, in a landing page's form, so no tool fact is typed twice.

- docs/tools.json: the Tools and Developer tools sections, each tool's kind, status and features, and
  `credits`; readme_figures.py's check holds each status to AGENTS.md's README Status values;
- docs/releases.json: each release prefix's newest stable release, else its newest beta, which `fetch`
  writes from the GitHub REST API; the Download button links its file, so the page stays static; and
  the hero's counts (#443): `downloads`, the sum of every release file's download count, and `stars`,
  the repository's stars, the numbers windowhop.martonpaulo.com shows (its render-download-count.sh);
- docs/install.md: every `## Install ...` section, as the page's numbered install guide;
- site/icons/<icon>.svg: each tool's icon, which scripts/icons.py draws in the plugin icons' style.

Writes four blocks of site/index.html, each between its marker comments. A card keeps the body of
its `<!-- media:SLOT -->` block, which scripts/site_media.py owns. --check writes nothing: it exits 1
when the page differs from a fresh generation, so the `site` gate fails on a page that fell behind.
It also fails on a repeated fact or a narrowed section (#439):

- a sentence of four words or more, or a link target, that appears twice on a page outside its
  navigation (the site header and any <nav>);
- a width the layout does not own: every <section> holds one `.container`, `.container` alone is
  `var(--page-width)` wide, the header's width, and no text takes a width cap (no `max-width`, no
  `ch` length), so no section's or paragraph's content box is narrower than the header's (#444);
- a card or install box whose title sits lower than its padding: `.card` and `.install` share one
  padding, and no rule gives a heading inside a section a top margin (#443).

A grid's last card alone on its row spans the row (#443): the generator marks it `lone-3` when the
grid shows three columns and `lone-2` when it shows two, and the stylesheet spans each at its width.
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
BLOCKS = ("stats", "tools", "install", "credits")
COLUMNS = (3, 2)  # the card grids' column counts, desktop then tablet; a phone shows one column
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


def total_downloads(releases):
    """Every published release file's download count, summed; a draft's files count no download."""
    return sum(asset.get("download_count", 0) for rel in releases if not rel.get("draft")
               for asset in rel.get("assets", []))


def prefix_of(tool):
    match = readme_figures.RELEASE_QUERY.search(tool.get("link", ""))
    return match.group(1) if match else None


def fetch(root):
    """Write docs/releases.json from the GitHub REST API, through the gh command line.

    shortcut: run by hand after a release, so a new release or count reaches the page only with the next
    fetch commit; upgrade to a fetch in the deploy's staging step and a weekly scheduled deploy, as
    windowhop's deploy.yml does, when a workflow change can land (a cloud session cannot push one)."""
    out = subprocess.run(["gh", "api", "--paginate", "--slurp", f"repos/{REPO}/releases?per_page=100"],
                         capture_output=True, text=True, check=True).stdout
    releases = [rel for page in json.loads(out) for rel in page]
    releases.sort(key=lambda rel: rel.get("published_at") or "", reverse=True)
    data = json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))
    prefixes = sorted({p for p in map(prefix_of, data["tools"]) if p})
    stars = json.loads(subprocess.run(["gh", "api", f"repos/{REPO}"], capture_output=True, text=True,
                                      check=True).stdout)["stargazers_count"]
    body = {"about": "Written by scripts/site_figures.py fetch from the GitHub releases (#437): for each "
                     "release prefix of docs/tools.json, the newest stable release, else the newest beta, "
                     "and its file. The home page's Download buttons link these files. `downloads` and "
                     "`stars` are the hero's counts (#443).",
            "downloads": total_downloads(releases), "stars": stars,
            "releases": pick_releases(releases, prefixes)}
    (root / RELEASES).write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- blocks


def group(number):
    return f"{number:,}"


def stats_block(counts):
    """The hero's one quiet line, «N downloads · ★ M stars on GitHub», linking the repository's
    stargazers; a count that is missing or zero is left out, and with neither there is no line, as on
    windowhop.martonpaulo.com."""
    parts = []
    for key, word, mark in (("downloads", "download", ""), ("stars", "star", "★ ")):
        number = counts.get(key)
        if isinstance(number, int) and number > 0:
            parts.append(f"{mark}{group(number)} {word}{'' if number == 1 else 's'}")
    if not parts:
        return [""]
    text = " · ".join(parts) + (" on GitHub" if counts.get("stars") else "")
    return ["", f'<p class="hero-stats"><a href="{REPO_URL}/stargazers" {EXTERNAL}>{esc(text)}</a></p>', ""]


def lone_classes(count, first_spans=False):
    """{index: class} for a grid of `count` cards whose last card is alone on its row, per column count
    of COLUMNS; `first_spans` when the first card already takes a whole row (the install guide)."""
    marks = {}
    for columns in COLUMNS:
        rest = count - 1 if first_spans else count
        if rest > 0 and rest % columns == 1:
            marks.setdefault(count - 1, []).append(f"lone-{columns}")
    return {index: " ".join(names) for index, names in marks.items()}


def with_lone(classes, index, lone):
    return " ".join([classes] + ([lone[index]] if index in lone else []))


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


def card(tool, releases, media, classes="card", broken=None):
    """One tool's card; `broken` is its (reason, issue number) when it fails now (#436)."""
    kind = KIND_LABELS.get(tool["kind"])
    if not kind:
        raise SystemExit(f"docs/tools.json: {tool['name']}: kind {tool['kind']!r} has no page label")
    status = readme_figures.BROKEN if broken else tool["status"]
    items = "".join(f"<li><strong>{esc(f['name'])}</strong>: {inline(f['text'])}"
                    f"{' <em>(planned)</em>' if f.get('planned') else ''}</li>" for f in tool["features"])
    out = [f'    <li class="{classes}">',
           '      <p class="card-head">',
           f'        <img src="/{icon_path(tool)}" width="48" height="48" alt="">',
           f'        <span class="kind">{kind}</span>',
           f'        <span class="badge status-{slug(status)}">{esc(status)}</span>',
           "      </p>",
           f"      <h3>{esc(tool['name'])}</h3>",
           f"      <ul class=\"features\">{items}</ul>"]
    if broken:
        reason, number = broken
        out.append(f'      <p>{esc(reason)} (<a href="{readme_figures.ISSUES}{number}" {EXTERNAL}>#{number}</a>)</p>')
    out += download(tool, releases)
    slot = slug(tool["name"])
    if slot in media:
        out += [f"      <!-- media:{slot}: {media[slot][0]} -->", *("      " + line for line in media[slot][1]), f"      <!-- /media:{slot} -->"]
    return out + ["    </li>"]


def tools_block(data, releases, media, broken=None):
    """The tool cards of each section; `broken` is readme_figures.broken_tools's map (#436)."""
    broken = broken or {}
    out = []
    for section in data["sections"]:
        out += ["", f'<section class="section" id="{section["id"]}" aria-labelledby="{section["id"]}-title">',
                '  <div class="container">', f'  <h2 id="{section["id"]}-title">{esc(section["title"])}</h2>']
        if section["intro"]:
            out.append(f'  <p class="lead">{esc(section["intro"])}</p>')
        out.append('  <ul class="grid-3 cards">')
        tools = [t for t in data["tools"] if t["section"] == section["id"]]
        lone = lone_classes(len(tools))
        for index, tool in enumerate(tools):
            out += card(tool, releases, media, with_lone("card", index, lone), broken.get(tool["name"]))
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
    out = ["", '<div class="grid-3 install-grid">']
    lone = lone_classes(len(heads), first_spans=True)
    for index, head in enumerate(heads):
        rest = text[head.end():]
        nxt = re.search(r"^## ", rest, re.M)
        body = rest[:nxt.start()] if nxt else rest
        out += [f'  <article class="{with_lone("install", index, lone)}">', f"    <h3>{esc(head.group(1))}</h3>"]
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
    page = replace(page, "stats", stats_block(json.loads((root / RELEASES).read_text(encoding="utf-8"))), "        ")
    facts = json.loads((root / readme_figures.FACTS).read_text(encoding="utf-8"))
    broken = readme_figures.broken_tools(data["tools"], facts, readme_figures.load_off(root))
    page = replace(page, "tools", tools_block(data, releases, media, broken), "    ")
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


SPAN = ("lone-3", "lone-2")


def width_problems(css):
    """A width declaration the layout does not own (#439): only `.container` takes `var(--page-width)`,
    the header's width; no text takes a width cap of its own (#444): no `max-width` or
    `max-inline-size` at all, and no length in `ch`; any other width is a small fixed size or 100%."""
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
            if prop in ("width", "inline-size") and SMALL_LENGTH.match(value) and not value.endswith("ch"):
                continue
            problems.append(f"{CSS}: {', '.join(selectors)} {{ {prop}: {value} }}: only .container sets the width "
                            "(var(--page-width)); text never takes a width cap (#444)")
    return problems


def box_problems(css):
    """A box whose title sits lower than its padding, and a lone last card that does not span (#443):
    `.card` and `.install` share one `padding`, no rule gives a section heading a top margin, and each
    `lone-N` class spans its row."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    problems, paddings = [], {}
    for selectors, body in RULE.findall(css):
        names = [" ".join(sel.split()) for sel in re.split(r",(?![^()]*\))", selectors)]
        for sel in names:
            margin = re.search(r"(?:^|;|\{)\s*margin(-top|-block|-block-start)?\s*:\s*([^;}]+)", body)
            if re.search(r"\bh[1-6]$", sel) and re.match(r"^\.(section|card|install)\b", sel) and margin:
                top = margin.group(2).split()[0]
                if top not in ("0", "auto"):
                    problems.append(f"{CSS}: {sel} {{ margin: {margin.group(2).strip()} }}: a heading in a section "
                                    "or a box takes no top margin, so a card's title sits at its padding")
            if sel in (".card", ".install"):
                pad = re.search(r"(?:^|;|\{)\s*padding\s*:\s*([^;}]+)", body)
                if pad:
                    paddings[sel] = pad.group(1).strip()
    if len(set(paddings.values())) != 1 or len(paddings) != 2 or len(paddings[".card"].split()) != 1:
        problems.append(f"{CSS}: .card and .install share one even padding (one value), found {paddings}")
    for lone in SPAN:
        if not re.search(rf"\.{lone}\s*\{{[^}}]*grid-column:\s*1\s*/\s*-1", css):
            problems.append(f"{CSS}: no rule makes .{lone} span its row (grid-column: 1 / -1)")
    return problems


def page_problems(root):
    css = (root / CSS).read_text(encoding="utf-8")
    problems = width_problems(css) + box_problems(css)
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
