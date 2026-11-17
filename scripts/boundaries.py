#!/usr/bin/env python3
"""Check that every plugin reaches the Supernote and outside services only through their adapters (#101).

    boundaries.py [--root DIR]

The rules are `docs/architecture.md` › Layer rules:

- `sdk`: only `packages/sn-adapter/src/official/` imports `sn-plugin-lib`, so an SDK change is fixed
  in one place. Tests and Jest mocks may import it to drive its mock.
- `authority`: only `packages/sn-adapter/` names a Supernote content provider
  (`com.ratta.supernote.<app>.provider`); there it comes from `descriptor.json`. Tests may name one.
- `service`: no code outside `packages/sync-core/src/` names a service host (`api.todoist.com`,
  `www.googleapis.com`, `oauth2.googleapis.com`), and no code outside `packages/sync-core/` imports a
  service client module (`todoist`, `google`, `ics`, `http`) by its path: a plugin takes the
  provider-neutral `@supernote-tools/sync-core`.
- `dictionary`: no code outside `packages/ink-core/src/` names a dictionary host (`wiktionary.org`):
  a plugin takes the provider-neutral `DictionaryProvider` of `@supernote-tools/ink-core` (#115).
- `url`: no code that runs on the tablet (a plugin's or package's `src/`, a plugin's `index.js`)
  constructs a `URL` or reads `searchParams`: React Native's `URL` throws on `protocol`, `host` and
  every other getter but `href`; take `parseUrl` of `@supernote-tools/sync-core` (#209).

`plugins/probe/` is exempt from every rule but `url`: it exists to call the internals directly. Only code is
read (`.ts`, `.tsx`, `.js`, `.jsx`, `.cjs`, `.mjs`, and `.java` and `.kt` for `authority`), never a
comment-only mention in a document. Prints one `path:line: rule: text` line per finding.
Exit 0 with none, 1 with findings, 2 on a bad root.
"""
import argparse
import re
import sys
from pathlib import Path

SKIP = {"node_modules", ".git", ".scratch", ".claude", "build", "android", ".toolchain"}
SCRIPT = {".ts", ".tsx", ".js", ".jsx", ".cjs", ".mjs"}
NATIVE = {".java", ".kt"}
EXEMPT = ("plugins/probe/",)
TEST_PARTS = {"__tests__", "__mocks__", "tests"}

# An import target: `from 'x'`, `import 'x'`, `require('x')`, `import('x')`, `jest.mock('x'`.
IMPORT = re.compile(r"""(?:\bfrom\s+|\bimport\s+|\brequire\(\s*|\bimport\(\s*|\bjest\.mock\(\s*)['"]([^'"]+)['"]""")
AUTHORITY = re.compile(r"com\.ratta\.supernote\.\w+\.provider")
HOST = re.compile(r"\b(?:api\.todoist\.com|www\.googleapis\.com|oauth2\.googleapis\.com)\b")
DICTIONARY_HOST = re.compile(r"\bwiktionary\.org\b")
CLIENT = re.compile(r"(?:^|/)sync-core/(?:src/)?(?:todoist|google|ics|http)(?:\.ts)?$")
URL_USE = re.compile(r"\bnew\s+URL\s*\(|\.searchParams\b")
TABLET = re.compile(r"^(?:plugins|packages)/[^/]+/(?:src/|index\.(?:js|jsx|ts|tsx)$)")
LINE_COMMENT = re.compile(r"^\s*(?://|\*|/\*)")


def code_files(root):
    """Every code file under root, as (path relative to root, suffix), skipping build and tool folders."""
    stack = [root]
    while stack:
        folder = stack.pop()
        for entry in sorted(folder.iterdir()):
            if entry.is_dir():
                if entry.name not in SKIP:
                    stack.append(entry)
            elif entry.suffix in SCRIPT | NATIVE:
                yield entry.relative_to(root).as_posix(), entry.suffix


def is_test(rel):
    return bool(TEST_PARTS & set(rel.split("/")[:-1]))


def findings(root):
    """[(path, line number, rule, text)] for every broken rule under root."""
    found = []
    for rel, suffix in code_files(root):
        exempt = rel.startswith(EXEMPT)
        test = is_test(rel)
        tablet = suffix in SCRIPT and not test and bool(TABLET.match(rel))
        if exempt and not tablet:
            continue
        lines = (root / rel).read_text(encoding="utf-8", errors="replace").splitlines()
        for number, line in enumerate(lines, 1):
            if LINE_COMMENT.match(line):
                continue
            if tablet and URL_USE.search(line):
                found.append((rel, number, "url", "uses React Native's URL, whose getters throw; take parseUrl of sync-core"))
            if exempt:
                continue
            if suffix in SCRIPT:
                for target in IMPORT.findall(line):
                    if target == "sn-plugin-lib" and not test and not rel.startswith("packages/sn-adapter/src/official/"):
                        found.append((rel, number, "sdk", "imports sn-plugin-lib outside sn-adapter's official tier"))
                    if CLIENT.search(target) and not rel.startswith("packages/sync-core/"):
                        found.append((rel, number, "service", "imports the service client %s; take @supernote-tools/sync-core" % target))
                if HOST.search(line) and not test and not rel.startswith("packages/sync-core/src/"):
                    found.append((rel, number, "service", "names the service host %s outside sync-core" % HOST.search(line).group(0)))
                if DICTIONARY_HOST.search(line) and not test and not rel.startswith("packages/ink-core/src/"):
                    found.append((rel, number, "dictionary", "names the dictionary host wiktionary.org outside ink-core"))
            if AUTHORITY.search(line) and not test and not rel.startswith("packages/sn-adapter/"):
                found.append((rel, number, "authority", "names the provider %s outside sn-adapter" % AUTHORITY.search(line).group(0)))
    return sorted(found)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check the adapter boundaries (#101).")
    parser.add_argument("--root", default=".", help="the repository's checkout (default: the current directory)")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print("boundaries: %s is not a folder" % args.root, file=sys.stderr)
        return 2
    found = findings(root)
    for rel, number, rule, text in found:
        print("%s:%d: %s: %s" % (rel, number, rule, text))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
