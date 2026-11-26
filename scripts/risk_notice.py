#!/usr/bin/env python3
"""Keep the one risk notice in every place a person reads before installing (#373).

    risk_notice.py [--root DIR] [--write]

`docs/risk-notice.md` owns the text: Markdown paragraphs with `**bold**` and `[text](https://...)`
links only. Each target holds it between `<!-- risk-notice:start ... -->` and
`<!-- risk-notice:end -->` as HTML paragraphs, which Markdown renders too, so the prose exists once
and the DRY check of documents does not count the copies as a second rule. `scripts/release_notes.py` reads the same file for each release's notes. Without
`--write` it checks: exit 1 naming each target whose block is missing or differs, else 0.
"""
import argparse
import html
import re
import sys
from pathlib import Path

SOURCE = "docs/risk-notice.md"
START = "<!-- risk-notice:start: written by scripts/risk_notice.py from docs/risk-notice.md -->"
END = "<!-- risk-notice:end -->"
BLOCK = re.compile(r"<!-- risk-notice:start[^>]*-->\n.*?" + re.escape(END), re.S)
TARGETS = ("README.md", "docs/install.md", "site/index.html")
LINK = re.compile(r"\[([^\]]+)\]\((https://[^)\s]+)\)")
BOLD = re.compile(r"\*\*([^*]+)\*\*")


def paragraphs(text):
    """The notice's paragraphs, each on one line."""
    return [" ".join(part.split()) for part in text.strip().split("\n\n") if part.strip()]


def as_html(paragraph):
    """One Markdown paragraph as an HTML paragraph: bold and absolute links only."""
    text = html.escape(paragraph, quote=False)
    text = BOLD.sub(r"<strong>\1</strong>", text)
    # The site's check asks every outside link to open in a new tab.
    text = LINK.sub(r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
    return f"<p>{text}</p>"


def block(notice):
    """The text between and including the markers."""
    body = "\n".join(as_html(p) for p in paragraphs(notice))
    return f"{START}\n{body}\n{END}"


def run(root, write):
    notice = (root / SOURCE).read_text(encoding="utf-8")
    problems = []
    wanted = block(notice)
    for name in TARGETS:
        path = root / name
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        found = BLOCK.findall(text)
        if len(found) != 1:
            problems.append(f"{name}: needs exactly one risk-notice block, found {len(found)}")
            continue
        if found[0] != wanted:
            if write:
                path.write_text(text.replace(found[0], wanted), encoding="utf-8")
            else:
                problems.append(f"{name}: the risk notice differs from {SOURCE}; run scripts/risk_notice.py --write")
    for problem in problems:
        print(problem)
    return 1 if problems else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".", help="the checkout (default: here)")
    parser.add_argument("--write", action="store_true", help="rewrite each block from the source")
    args = parser.parse_args()
    sys.exit(run(Path(args.root), args.write))


if __name__ == "__main__":
    main()
