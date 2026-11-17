#!/usr/bin/env python3
"""Run `npm audit --omit=dev` in a subproject and fail on any advisory not excepted (#154).

    python3 scripts/npm_audit.py plugins/word-lookup [--exceptions audit-exceptions.json]

An exception in `audit-exceptions.json` names one advisory and the package it reaches, with the
reason it cannot be fixed yet; `docs/security.md` › Dependency audit holds the rule. Every other
advisory fails, whatever its severity. Exit 0 clean, 1 an advisory without an exception, 2 when
npm or a file cannot be read.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXIT_FOUND = 1
EXIT_ERROR = 2


def advisories(report: dict) -> set[tuple[str, str, str]]:
    """Each (advisory id, package, severity) an `npm audit --json` report names."""
    if "error" in report or "vulnerabilities" not in report:
        raise ValueError(f"not an npm audit report: {json.dumps(report)[:200]}")
    found = set()
    for entry in report["vulnerabilities"].values():
        for source in entry.get("via", []):
            if isinstance(source, dict):
                found.add((source["url"].rstrip("/").rsplit("/", 1)[-1], source["name"], source["severity"]))
    return found


def load_exceptions(file: pathlib.Path) -> set[tuple[str, str]]:
    data = json.loads(file.read_text(encoding="utf-8"))
    result = set()
    for index, item in enumerate(data["exceptions"]):
        if not all(isinstance(item.get(key), str) and item[key] for key in ("advisory", "package", "reason")):
            raise ValueError(f"{file}: exceptions[{index}] needs an advisory, a package and a reason")
        result.add((item["advisory"], item["package"]))
    return result


def check(report: dict, exceptions: set[tuple[str, str]]) -> tuple[list, list]:
    """The advisories that fail and the ones an exception covers, each sorted."""
    found = sorted(advisories(report))
    blocked = [item for item in found if (item[0], item[1]) not in exceptions]
    excepted = [item for item in found if (item[0], item[1]) in exceptions]
    return blocked, excepted


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folder", type=pathlib.Path)
    parser.add_argument("--exceptions", type=pathlib.Path, default=ROOT / "audit-exceptions.json")
    args = parser.parse_args(argv)
    result = subprocess.run(
        ["npm", "audit", "--omit=dev", "--json"], cwd=args.folder, capture_output=True, text=True,
    )
    try:
        blocked, excepted = check(json.loads(result.stdout), load_exceptions(args.exceptions))
    except (ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"npm-audit: {error}; npm said: {result.stderr.strip()[:300]}", file=sys.stderr)
        return EXIT_ERROR
    for advisory, package, severity in excepted:
        print(f"excepted\t{advisory}\t{package}\t{severity}")
    for advisory, package, severity in blocked:
        print(f"FAIL\t{advisory}\t{package}\t{severity}\thttps://github.com/advisories/{advisory}")
    print(f"npm-audit: {args.folder}: {len(blocked)} failing, {len(excepted)} excepted")
    return EXIT_FOUND if blocked else 0


if __name__ == "__main__":
    sys.exit(main())
