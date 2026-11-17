#!/usr/bin/env python3
"""Install a subproject's npm dependencies when its lockfile changed since the last install (#222).

    npm_install.py [DIR]   # DIR defaults to the current folder

A gate used to run `test -d node_modules || npm ci`, which kept a node_modules installed from an
older lockfile: after the `@ink-tools/*` scope rename (#179) a reused checkout could not resolve the
new package names. This script keeps the SHA-256 of `package-lock.json` in `node_modules/STAMP`
and runs `npm ci` when node_modules is missing or the stamp differs. An unchanged checkout costs
one hash of one file. Exit 0 when node_modules matches the lockfile, else npm's exit code.
"""
from __future__ import annotations

import hashlib
import pathlib
import subprocess
import sys

STAMP = ".ink-tools-lock-sha256"


def lock_hash(folder: pathlib.Path) -> str:
    return hashlib.sha256((folder / "package-lock.json").read_bytes()).hexdigest()


def is_current(folder: pathlib.Path) -> bool:
    """True when node_modules was installed by this script from the present lockfile."""
    stamp = folder / "node_modules" / STAMP
    return stamp.is_file() and stamp.read_text(encoding="utf-8").strip() == lock_hash(folder)


def install(folder: pathlib.Path) -> int:
    if is_current(folder):
        return 0
    print(f"npm_install: {folder}: node_modules is missing or older than package-lock.json, running npm ci",
          flush=True)
    result = subprocess.run(["npm", "ci"], cwd=folder, check=False)
    if result.returncode != 0:
        return result.returncode
    (folder / "node_modules" / STAMP).write_text(lock_hash(folder) + "\n", encoding="utf-8")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if len(args) > 1:
        print(__doc__, file=sys.stderr)
        return 2
    folder = pathlib.Path(args[0] if args else ".").resolve()
    if not (folder / "package-lock.json").is_file():
        print(f"npm_install: {folder} has no package-lock.json", file=sys.stderr)
        return 2
    return install(folder)


if __name__ == "__main__":
    sys.exit(main())
