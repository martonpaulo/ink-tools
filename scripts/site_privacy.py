#!/usr/bin/env python3
"""Check that the site has both pages and that the privacy policy covers every networked plugin (#371).

    site_privacy.py [--root DIR]

The home page `site/index.html` and the privacy policy `site/privacy/index.html` must exist. Each
plugin whose `plugins/<folder>/PluginConfig.json` declares the network permission (named in
`packages/sn-adapter/src/official/plugin.ts`) must have a
heading `<h2 id="<folder>">` in the privacy policy that names the plugin by its `name`, so a plugin
that gains network access cannot ship without saying what it sends and where.

Four more `<h2>` sections must exist, one for each network use or stored secret that is not a plugin
(`SECTIONS`: language pack downloads, the Supernote Cloud password, Browse & Access, a Device Link
sign-in token, #505), so a page that drops one fails.

Prints one `missing<TAB>what` line per problem. Exit 0 with none, 1 with problems, 2 on a bad root.
Python's standard library only.
"""
from __future__ import annotations

import argparse
import html
import json
import pathlib
import re
import sys

PAGES = ("site/index.html", "site/privacy/index.html")
PRIVACY = "site/privacy/index.html"
# sn-adapter owns the permission names; this reads the network one from there instead of a copy.
PERMISSIONS = "packages/sn-adapter/src/official/plugin.ts"
# Sections the page must keep whatever the plugins declare: id and heading text (#505).
SECTIONS = {
    "language-packs": "Language pack downloads",
    "supernote-cloud": "Supernote Cloud password",
    "browse-and-access": "Browse & Access",
    "device-link-token": "Sign-in token sent through Device Link",
}


def internet_permission(root: pathlib.Path) -> str:
    """The network permission's name, as sn-adapter declares it."""
    match = re.search(r"PERMISSION_INTERNET = '([^']+)'", (root / PERMISSIONS).read_text(encoding="utf-8"))
    if not match:
        raise ValueError(f"{PERMISSIONS} declares no PERMISSION_INTERNET")
    return match.group(1)


def networked_plugins(root: pathlib.Path) -> list[tuple[str, str]]:
    """(folder, display name) of every plugin that declares the network permission."""
    internet = internet_permission(root)
    found = []
    for config in sorted(root.glob("plugins/*/PluginConfig.json")):
        data = json.loads(config.read_text(encoding="utf-8"))
        if internet in data.get("uses-permissions", []):
            found.append((config.parent.name, data["name"]))
    return found


def headings(page: str) -> dict[str, str]:
    """Each `<h2 id=...>`'s id and its text, tags removed."""
    pattern = re.compile(r'<h2\s+id="([^"]+)"[^>]*>(.*?)</h2>', re.DOTALL)
    return {match.group(1): html.unescape(re.sub(r"<[^>]+>", "", match.group(2))).strip() for match in pattern.finditer(page)}


def check(root: pathlib.Path) -> list[str]:
    problems = [page for page in PAGES if not (root / page).is_file()]
    if PRIVACY in problems:
        return problems
    found = headings((root / PRIVACY).read_text(encoding="utf-8"))
    for folder, name in networked_plugins(root):
        if found.get(folder) != name:
            problems.append(f'{PRIVACY}: <h2 id="{folder}">{name}</h2>')
    for section, title in SECTIONS.items():
        if found.get(section) != title:
            problems.append(f'{PRIVACY}: <h2 id="{section}">{title}</h2>')
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=".", help="the repository (default: the current folder)")
    args = parser.parse_args(argv)
    root = pathlib.Path(args.root)
    if not (root / "plugins").is_dir():
        print(f"site_privacy.py: no plugins/ in {root}", file=sys.stderr)
        return 2
    problems = check(root)
    for problem in problems:
        print(f"missing\t{problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
