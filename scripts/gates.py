#!/usr/bin/env python3
"""Choose the gates a change needs from the paths it touches (#733).

    gates.py                    # the working tree against HEAD, untracked files included
    gates.py --staged           # the staged change
    gates.py --against REV      # the working tree against REV (a commit or main)
    gates.py PATH...            # these paths
    gates.py -                  # paths from standard input: git diff --name-only A B | gates.py -
    gates.py --why ...          # also the paths and rules that chose each gate
    gates.py --all              # every gate but the on-request ones: CI with no usable base
    gates.py --list             # every gate, its command and what it covers
    gates.py --check            # validate gates.json only

It prints one `name<TAB>command` line per gate, cheapest first, and nothing when no path changed.
It only chooses: no gate is weakened, and running every gate stays available. A path no rule names
selects every gate but the on-request ones, the safe default.

The gates and rules are data, in `gates.json` at the repository root (`--root DIR` for another):

    {"gates": [{"name": "unit", "command": "make test", "covers": "the unit tests"},
               {"name": "linux", "command": "make vm-test", "covers": "a Linux proof", "onRequest": true}],
     "rules": [{"path": "src/", "gates": ["unit"]}, {"path": "*.md", "gates": ["docs"]}]}

`gates` is in run order, cheapest first. A rule path ending in `/` is a folder prefix, one with `*`,
`?` or `[` is a glob matched against the whole path (`*` crosses folders, so `*.md` matches
`docs/a/b.md`) and, when it has no `/`, against the file name too (`test_*.py` matches
`src/test_a.py`); anything else is an exact path. Every rule that names a path applies, so a shared file selects every gate that
reads it. An on-request gate is printed only by `--list` or a rule that names it.

Three keys are optional (#1219). `"parallel": true` says the gates share no state, so a runner such
as `land.py finish` may run them at once after the first one passes alone. `"budgetSeconds": N` is
the wall time the selected gates should stay under; the runner reports a run past it.
`"unknown": "refuse"` exits 2 on a path that is neither in the tree nor in Git's history, a typo; a
deleted file has history, so a diff's paths always pass. A repository whose selector adds rules it
finds in its own tree imports this file and calls `main(argv, loader=...)` with a loader that
returns the data with them added; its loader may read the data from another file with `load(root, file)`.

Two more keys narrow a selection (#1219). A rule with `"fallback": true` applies to a path only when
no exact-path rule names that path: a folder's whole suite for a path no finer rule knows, such as a
deleted file. A gate with `"coveredBy": [names]` is left out when every gate it lists is selected
too: one test file's gate beside the parts that run its whole folder.

Exit 0 ok, 2 on a usage or data error. Python's standard library and Git only. Adapted from
Panoram's tools/gates.py (the owner's own code); project-setup `references/ci-pipelines.md` owns
the rule.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import pathlib
import subprocess
import sys

DATA_FILE = "gates.json"
EXIT_USAGE = 2
EVERY_GATE = "no rule names this path: every gate"


class DataError(Exception):
    pass


def load(root: pathlib.Path, file: pathlib.Path | None = None) -> dict:
    """Read and validate gates.json (`file`, else the one at `root`); raise DataError naming each problem."""
    file = file or root / DATA_FILE
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise DataError(f"no {DATA_FILE} in {root}") from None
    except json.JSONDecodeError as error:
        raise DataError(f"{file}: not JSON ({error})") from None
    problems = []
    gates = data.get("gates") if isinstance(data, dict) else None
    rules = data.get("rules", []) if isinstance(data, dict) else None
    if not isinstance(gates, list) or not gates:
        raise DataError(f"{file}: `gates` must be a non-empty list")
    if not isinstance(rules, list):
        raise DataError(f"{file}: `rules` must be a list")
    names = []
    for index, gate in enumerate(gates):
        if not isinstance(gate, dict) or not all(isinstance(gate.get(key), str) and gate.get(key) for key in ("name", "command")):
            problems.append(f"gates[{index}]: needs a `name` and a `command`")
            continue
        if gate["name"] in names:
            problems.append(f"gates[{index}]: `{gate['name']}` appears twice")
        names.append(gate["name"])
    for index, gate in enumerate(gates):
        covered = gate.get("coveredBy") if isinstance(gate, dict) else None
        if covered is None:
            continue
        if not isinstance(covered, list) or not covered or not all(isinstance(name, str) for name in covered):
            problems.append(f"gates[{index}]: `coveredBy` must be a non-empty list of gate names")
            continue
        for name in covered:
            if name not in names or name == gate.get("name"):
                problems.append(f"gates[{index}]: `coveredBy` names no other gate `{name}`")
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict) or not isinstance(rule.get("path"), str) or not rule["path"]:
            problems.append(f"rules[{index}]: needs a `path`")
            continue
        if "fallback" in rule and not isinstance(rule["fallback"], bool):
            problems.append(f"rules[{index}] ({rule['path']}): `fallback` must be true or false")
        chosen = rule.get("gates")
        if not isinstance(chosen, list) or not chosen:
            problems.append(f"rules[{index}] ({rule['path']}): names no gate")
            continue
        for name in chosen:
            if name not in names:
                problems.append(f"rules[{index}] ({rule['path']}): no gate named `{name}`")
    if "parallel" in data and not isinstance(data["parallel"], bool):
        problems.append("`parallel` must be true or false")
    budget = data.get("budgetSeconds")
    if "budgetSeconds" in data and (isinstance(budget, bool) or not isinstance(budget, (int, float)) or budget <= 0):
        problems.append("`budgetSeconds` must be a positive number")
    if data.get("unknown", "refuse") != "refuse":
        problems.append("`unknown` can only be \"refuse\"")
    if problems:
        raise DataError("\n".join(f"{file}: {problem}" for problem in problems))
    return data


def exact(pattern: str) -> bool:
    return not pattern.endswith("/") and not any(char in pattern for char in "*?[")


def matches(pattern: str, path: str) -> bool:
    if pattern.endswith("/"):
        return path.startswith(pattern)
    if any(char in pattern for char in "*?["):
        return fnmatch.fnmatchcase(path, pattern) or ("/" not in pattern and fnmatch.fnmatchcase(path.rsplit("/", 1)[-1], pattern))
    return path == pattern


def select(data: dict, paths: list[str]) -> dict[str, list[str]]:
    """The gates the paths need, in run order, each with the paths and rules that chose it."""
    order = [gate["name"] for gate in data["gates"]]
    default = [gate["name"] for gate in data["gates"] if not gate.get("onRequest")]
    chosen: dict[str, list[str]] = {}
    for path in paths:
        rules = [rule for rule in data.get("rules", []) if matches(rule["path"], path)]
        if any(exact(rule["path"]) for rule in rules):
            rules = [rule for rule in rules if not rule.get("fallback")]
        hits = [(rule["path"], rule["gates"]) for rule in rules]
        for pattern, gates in hits or [(EVERY_GATE, default)]:
            for gate in gates:
                chosen.setdefault(gate, []).append(f"{path} ({pattern})")
    return {gate: chosen[gate] for gate in uncovered(data, [name for name in order if name in chosen])}


def uncovered(data: dict, names: list[str]) -> list[str]:
    """`names` without each gate whose `coveredBy` gates are all among them."""
    covered = {gate["name"]: gate.get("coveredBy") for gate in data["gates"]}
    present = set(names)
    return [name for name in names if not (covered.get(name) and present.issuperset(covered[name]))]


def git(root: pathlib.Path, *args: str) -> list[str]:
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if result.returncode:
        raise DataError(f"git {' '.join(args)}: {result.stderr.strip()}")
    return [entry for entry in result.stdout.split("\0") if entry]


def unknown_paths(root: pathlib.Path, paths: list[str]) -> list[str]:
    """The paths neither in the tree nor in Git's history (#1219); a deleted file has history."""
    missing = [path for path in dict.fromkeys(paths) if not (root / path).exists()]
    return [path for path in missing
            if not subprocess.run(["git", "-C", str(root), "log", "-1", "--format=%H", "--", path],
                                  capture_output=True, text=True).stdout.strip()]


def changed_paths(root: pathlib.Path, staged: bool, against: str | None) -> list[str]:
    # --no-renames: a moved file lists its old path too, so the folder it left keeps its gates (#839).
    if staged:
        return sorted(set(git(root, "diff", "--name-only", "--no-renames", "-z", "--cached")))
    paths = git(root, "diff", "--name-only", "--no-renames", "-z", against or "HEAD")
    paths += git(root, "ls-files", "-z", "--others", "--exclude-standard")
    return sorted(set(paths))


def main(argv: list[str] | None = None, loader=load) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="*", help="paths to classify; '-' reads them from standard input")
    parser.add_argument("--root", default=".", help="the repository root (default: the current folder)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true", help="the staged change")
    mode.add_argument("--against", metavar="REV", help="the working tree against REV (default HEAD)")
    mode.add_argument("--all", action="store_true", help="every gate but the on-request ones")
    mode.add_argument("--list", action="store_true", help="every gate, its command and what it covers")
    mode.add_argument("--check", action="store_true", help="validate gates.json only")
    parser.add_argument("--why", action="store_true", help="print the paths and rules behind each gate")
    args = parser.parse_args(argv)
    root = pathlib.Path(args.root)
    if args.paths and (args.staged or args.against or args.all or args.list or args.check):
        parser.error("paths cannot be combined with --staged, --against, --all, --list or --check")
    try:
        data = loader(root)
        if args.check:
            print(f"ok: {len(data['gates'])} gates, {len(data.get('rules', []))} rules")
            return 0
        if args.list:
            for gate in data["gates"]:
                note = " (on request)" if gate.get("onRequest") else ""
                print(f"{gate['name']}\t{gate['command']}\t{gate.get('covers', '')}{note}")
            return 0
        if args.all:
            commands = {gate["name"]: gate["command"] for gate in data["gates"]}
            for name in uncovered(data, [gate["name"] for gate in data["gates"] if not gate.get("onRequest")]):
                print(f"{name}\t{commands[name]}")
            return 0
        if args.paths == ["-"]:
            paths = [line.strip() for line in sys.stdin if line.strip()]
        elif args.paths:
            paths = args.paths
        else:
            paths = changed_paths(root, args.staged, args.against)
        paths = list(dict.fromkeys(path[2:] if path.startswith("./") else path for path in paths))
        unknown = unknown_paths(root, paths) if data.get("unknown") == "refuse" else []
        if unknown:
            raise DataError("unknown path, neither in the tree nor in Git's history: " + ", ".join(unknown))
    except DataError as error:
        print(error, file=sys.stderr)
        return EXIT_USAGE
    commands = {gate["name"]: gate["command"] for gate in data["gates"]}
    for gate, reasons in select(data, paths).items():
        print(f"{gate}\t{commands[gate]}")
        if args.why:
            for reason in dict.fromkeys(reasons):
                print(f"  {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
