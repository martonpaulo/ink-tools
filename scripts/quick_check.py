#!/usr/bin/env python3
"""Type-check only the subprojects a change reaches, before any full gate (#180).

    quick_check.py                 # paths from $SKD_CHANGED_PATHS (one per line), else the tree against HEAD
    quick_check.py PATH...         # these paths
    quick_check.py --list PATH...  # print the directories that would be checked, run nothing

The paths go through `gates.py`'s rules (`gates.json`), the one map. A selected gate whose command
starts with `cd DIR &&` names a subproject; when DIR/package.json has a `typecheck` script and
DIR/node_modules matches its lockfile (`npm_install.py`, #222), `npm run typecheck` runs there. Subprojects without that script (the JVM
and Python gates) are skipped: the full gate still runs them. ESLint is left to the gate, since it is
not cheap on the larger plugins. Every run first refuses tracked paths that differ only in case
(`case_check.py`, #227), since a case-insensitive disk would merge them. Exit 0 pass, 1 a type error (its lines are printed), 2 a usage error.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import case_check  # noqa: E402
import gates  # noqa: E402
import npm_install  # noqa: E402

CD_PREFIX = re.compile(r"^cd (\S+) &&")


def typecheck_dirs(root: pathlib.Path, paths: list[str]) -> list[str]:
    """The subproject folders (relative, in gate order) whose gate the paths select and that have a `typecheck` script."""
    data = gates.load(root)
    commands = {gate["name"]: gate["command"] for gate in data["gates"]}
    found: list[str] = []
    for name in gates.select(data, paths):
        match = CD_PREFIX.match(commands[name])
        package = root / match.group(1) / "package.json" if match else None
        if package is None or not package.is_file() or match.group(1) in found:
            continue
        scripts = json.loads(package.read_text(encoding="utf-8")).get("scripts", {})
        if "typecheck" in scripts:
            found.append(match.group(1))
    return found


def tree_paths(root: pathlib.Path) -> list[str]:
    changed = gates.git(root, "diff", "--name-only", "-z", "HEAD")
    return sorted(set(changed + gates.git(root, "ls-files", "-z", "--others", "--exclude-standard")))


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    listing = "--list" in args
    paths = [arg for arg in args if arg != "--list"]
    root = pathlib.Path(__file__).resolve().parent.parent
    if not paths:
        env = os.environ.get("SKD_CHANGED_PATHS", "")
        paths = [line for line in env.splitlines() if line] or tree_paths(root)
    try:
        folders = typecheck_dirs(root, paths)
    except gates.DataError as error:
        print(error, file=sys.stderr)
        return 2
    if listing:
        print("\n".join(folders))
        return 0
    failed = 0
    for kind, first, second in case_check.collisions(case_check.tracked(root)):
        failed = 1
        print(f"quick case: {kind}: {first} <-> {second}")
    for folder in folders:
        if not npm_install.is_current(root / folder):
            print(f"quick {folder}: skipped, node_modules missing or older than the lockfile (the gate installs it)")
            continue
        result = subprocess.run(["npm", "run", "typecheck", "--silent"], cwd=root / folder,
                                capture_output=True, text=True, check=False)
        if result.returncode != 0:
            failed = 1
            print(f"quick {folder}: type error\n{result.stdout}{result.stderr}")
        else:
            print(f"quick {folder}: pass")
    if not folders:
        print("quick: no subproject with a typecheck script is reached")
    return failed


if __name__ == "__main__":
    sys.exit(main())
