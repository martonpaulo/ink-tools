#!/usr/bin/env python3
"""Refuse two tracked paths that a case-insensitive disk takes for one (#227).

    case_check.py [--root DIR]

macOS and Windows disks ignore case, so the owner's Mac sees one file where Linux and CI see two
(#226: `src/Editor.tsx` beside `src/editor.ts`). Three kinds of pair are refused:

- `path`: two tracked files or folders equal once lowercased (`Docs/a.md` and `docs/b.md` too);
- `module`: two script modules in one folder (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) whose
  names are equal once lowercased and stripped of the extension, since an import without one, such
  as `./src/Editor`, may resolve to either.

Reads `git ls-files`, so untracked and ignored files never count. Prints one `kind: a <-> b` line
per pair. Exit 0 with none, 1 with pairs, 2 on a bad root.
"""
import argparse
import subprocess
import sys
from pathlib import Path, PurePosixPath

MODULE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def names(paths):
    """Every tracked file and every folder above one, each once."""
    found = set()
    for path in paths:
        parts = PurePosixPath(path).parts
        for end in range(1, len(parts) + 1):
            found.add("/".join(parts[:end]))
    return sorted(found)


def collisions(paths):
    """The (kind, a, b) pairs a case-insensitive disk would merge, sorted."""
    pairs = set()
    groups = {}
    for name in names(paths):
        groups.setdefault(("path", name.lower()), []).append(name)
    for path in paths:
        pure = PurePosixPath(path)
        if pure.suffix in MODULE_SUFFIXES:
            groups.setdefault(("module", str(pure.with_suffix("")).lower()), []).append(path)
    for (kind, _key), members in groups.items():
        members = sorted(set(members))
        for index, first in enumerate(members):
            for second in members[index + 1:]:
                if kind == "module" and first.lower() == second.lower():
                    continue  # already a `path` pair
                if kind == "module" and PurePosixPath(first).with_suffix("") == PurePosixPath(second).with_suffix(""):
                    continue  # `a.ts` beside `a.tsx`: same case, an ordinary pair
                pairs.add((kind, first, second))
    return sorted(pairs)


def tracked(root):
    result = subprocess.run(["git", "-C", str(root), "ls-files", "-z"], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return [entry for entry in result.stdout.split("\0") if entry]


def main(argv=None):
    parser = argparse.ArgumentParser(description="Refuse tracked paths that differ only in case (#227).")
    parser.add_argument("--root", default=".", help="the repository's checkout (default: the current directory)")
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    try:
        paths = tracked(root)
    except (OSError, RuntimeError) as error:
        print("case: cannot list %s: %s" % (args.root, error), file=sys.stderr)
        return 2
    found = collisions(paths)
    for kind, first, second in found:
        print("%s: %s <-> %s" % (kind, first, second))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
