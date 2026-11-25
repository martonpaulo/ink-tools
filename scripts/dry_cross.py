#!/usr/bin/env python3
"""The DRY checks Ink Tools adds over the Skill Deck copy `dry_check.py` (#295).

    dry_cross.py [--root DIR] [--data FILE] [--init | --shrink | --list]

`scripts/dry_check.py` is an unchanged copy of Skill Deck's `bench-setup/assets/dry_check.py`
(the `dry-gate` convention fails on any edit), so the checks this monorepo needs beyond it live here
and import it. They read the `crossTool` section of `dry-check.json`:

- languages: the copy reads no Java and no Swift. This file reads both, with the copy's own magic
  value and repeated-block rules, ratcheted per file and class (`crossTool.languages.counts`) and per
  area (`crossTool.languages.duplicates`). A suffix that the copy's `SUFFIXES` lists, or this file
  adds, with no reader prints a warning.
- constants: the copy exempts a value written as a named constant, so one value can be named twice in
  two tools and drift apart. The same constant value in files of two tools (`plugins/<x>`,
  `packages/<x>`, `apps/<x>`, `cli/<x>`, else the first folder) fails, unless a `twins.rules` row
  names its owner: the row's pattern matches the line, and the file is at or under the row's `owner`
  or `other`. Ratchet per file (`crossTool.constants.counts`).

The counts only go down, as in the copy: `--shrink` lowers them, `--init` records today's counts once.
Exit 0 when every check holds, 1 on a finding, 2 on a usage or data error.

shortcut: Java and Swift are read by one small C-family lexer and constants by one line pattern per
language, not by parsers, the same tradeoff the copy records for Go, shell and JavaScript.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import dry_check  # noqa: E402  the unchanged Skill Deck copy

SECTION = "crossTool"
# The languages the copy does not read, by suffix; each has a reader below.
NATIVE_SUFFIXES = {".java": "java", ".swift": "swift"}

# ---------- languages: Java and Swift ----------

C_TOKEN = re.compile(
    r"""//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'"""
    r"""|\b0[xXbBoO][0-9a-fA-F_]+[lL]?\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?[lLfFdD]?\b|[A-Za-z_$][\w$]*|[()\[\]{};=]|\n""",
    re.S,
)
# A literal inside a declaration made with one of these is named: Java's `final` field, Swift's `let`.
NAMING = {"java": "final", "swift": "let"}
JAVA_CONSTANT = re.compile(r"^[A-Z][A-Z0-9_]*$")


def c_family_findings(lang):
    """A reader for `dry_check.magic_findings`: a literal outside a named declaration has no name."""

    def read(path, source):
        found, strings = [], []
        line, depth, named_depth, declaring, previous = 1, 0, None, False, ""
        for match in C_TOKEN.finditer(source):
            token = match.group()
            ends_statement = token == ";" or (token == "\n" and lang == "swift")
            if token == "\n" or token == ";":
                if ends_statement and named_depth is not None and depth <= named_depth:
                    named_depth = None
                line += token == "\n"
                continue
            if token[:2] in ("//", "/*"):
                line += token.count("\n")
                continue
            if token == NAMING[lang]:
                declaring = True
            elif declaring and (lang == "swift" or JAVA_CONSTANT.match(token)):
                if named_depth is None:
                    named_depth = depth
                declaring = False
            elif declaring and token == "=":
                declaring = False  # a `final` local with a lower-case name is not a constant
            if token in "([{":
                depth += 1
            elif token in ")]}":
                depth -= 1
            named = named_depth is not None
            if token[0] in "\"'":
                text = token[1:-1]
                if not named:
                    found += dry_check.classify_string(path, line, text)
                    strings.append((line, text))
            elif token[0].isdigit() and not named:
                value = dry_check.number(token.rstrip("lLfFdD") if not token[:2].lower() == "0x" else token)
                if value is not None and value not in dry_check.PLAIN_NUMBERS and previous != "[":
                    found.append(dry_check.Finding(path, line, "number", token))
            previous = token
        return found, strings

    return read


def register():
    """Teach the imported copy, in memory only, to read Java and Swift."""
    for lang in NATIVE_SUFFIXES.values():
        dry_check.READERS.setdefault(lang, c_family_findings(lang))
        dry_check.COMMENT.setdefault(lang, "//")


def unreadable_suffixes(suffixes=None, readers=None):
    """The listed suffixes no reader reads, as `(suffix, language)`, sorted."""
    suffixes = {**dry_check.SUFFIXES, **NATIVE_SUFFIXES} if suffixes is None else suffixes
    readers = dry_check.READERS if readers is None else readers
    return sorted((suffix, lang) for suffix, lang in suffixes.items() if lang not in readers)


def native_sources(root, paths, exclude):
    """`{path: (language, text)}` of every tracked Java and Swift file of ours, tests left out."""
    sources = {}
    for path in paths:
        lang = NATIVE_SUFFIXES.get(pathlib.PurePosixPath(path).suffix)
        if lang and dry_check.counted(path) and not MORE_TESTS.search(path) and not dry_check.matches(path, exclude):
            sources[path] = (lang, dry_check.read(root, path))
    return sources


def languages_check(root, paths, section, exclude):
    sources = native_sources(root, paths, exclude)
    magic = dry_check.magic_findings(sources)
    counts = {(p, k): n for p, kinds in section.get("counts", {}).items() for k, n in kinds.items()}
    lines = collections.defaultdict(list)
    for f in magic:
        lines[(f.path, f.kind)].append(f"{f.path}:{f.line}: {f.kind} {f.value}")
    problems = dry_check.ratchet(dry_check.magic_counts(magic), counts, {}, "Java or Swift magic values", lines)
    depth = int(section.get("depth", 2))
    blocks = dry_check.groups(sources)
    block_lines = collections.defaultdict(list)
    for length, copies in blocks:
        where = ", ".join(f"{p}:{a}-{b}" for p, a, b in copies)
        block_lines[dry_check.area(copies[0][0], depth)].append(f"{length} lines x {len(copies)}: {where}")
    problems += dry_check.ratchet(dry_check.duplicate_counts(blocks, depth), section.get("duplicates", {}), {},
                                  "Java or Swift repeated blocks", block_lines)
    return problems, (magic, blocks), f"{len(sources)} Java and Swift files, {len(magic)} values, {len(blocks)} blocks seen three times"


def languages_record(found, section, shrink):
    magic, blocks = found
    recorded = dry_check.magic_record(magic, section, shrink)
    depth = int(section.get("depth", 2))
    have, old = dry_check.duplicate_counts(blocks, depth), section.get("duplicates", {})
    duplicates = {a: min(have.get(a, 0), n) for a, n in old.items()} if shrink else dict(have)
    return {**recorded, "duplicates": {a: n for a, n in sorted(duplicates.items()) if n}}


# ---------- constants: one named value in two tools ----------

Constant = collections.namedtuple("Constant", "path line tool value text")
LITERAL = r"""(?P<value>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|-?\d[\d_]*(?:\.\d+)?[lLfFdD]?)"""
CONSTANT_LINE = {
    "python": re.compile(r"^\s*_?[A-Z][A-Z0-9_]*\s*(?::\s*[^=]+)?=\s*" + LITERAL + r"\s*(?:#.*)?$"),
    "javascript": re.compile(
        r"^\s*(?:export\s+)?(?:(?:const|let|var)|(?:(?:public|private|protected)\s+)?static\s+readonly)\s+"
        r"[A-Z][A-Z0-9_]*\s*(?::\s*[^=]+)?=\s*" + LITERAL + r"\s*(?:as\s+const)?\s*[;,]?\s*(?://.*)?$"),
    "shell": re.compile(r"^\s*(?:readonly\s+|export\s+|local\s+|declare\s+-\w+\s+)?[A-Z_][A-Z0-9_]*=" + LITERAL + r"\s*(?:#.*)?$"),
    "java": re.compile(r"^\s*(?:(?:public|private|protected|static|final)\s+)*final\s+[\w<>\[\], .]+?\s+"
                       r"[A-Z][A-Z0-9_]*\s*=\s*" + LITERAL + r"\s*;\s*(?://.*)?$"),
    "swift": re.compile(r"^\s*(?:(?:public|private|fileprivate|internal|static)\s+)*let\s+\w+\s*(?::\s*[^=]+)?=\s*"
                        + LITERAL + r"\s*(?://.*)?$"),
}
STRING_MINIMUM = 4  # characters: a shorter string («ok», «id») is a word, not a contract
# A small whole number (an exit code, a retry count, 30 s) repeats by chance, and so does a unit
# conversion; a contract value such as 1920, 2560 or 0.55 does not.
NUMBER_MINIMUM = 100
CONVERSIONS = {1000, 1024, 60000}
# Test code the copy's TEST_FILE does not name: JVM tests, test helpers and fixtures of a package.
MORE_TESTS = re.compile(r"(^|/)(native-tests|test-support|testing)/")
# Skill Deck's own check scripts, copied unchanged into each subproject's gate: one source, upstream.
VENDORED = re.compile(r"(^|/)scripts/(dry_check|text_check|issue_links|gates|sleep_guard)\.py$")
TOOL_ROOTS = ("plugins", "packages", "apps", "cli")


def tool(path: str) -> str:
    """The tool a file belongs to: `plugins/<x>` and the like, else its first folder, else `.`."""
    parts = pathlib.PurePosixPath(path).parts
    if len(parts) > 2 and parts[0] in TOOL_ROOTS:
        return "/".join(parts[:2])
    return parts[0] if len(parts) > 1 else "."


def literal_value(token: str):
    """A comparable value for a literal, or None when it is too plain to be a contract."""
    if token[0] in "\"'":
        text = token[1:-1]
        return ("string", text) if len(text) >= STRING_MINIMUM else None
    value = dry_check.number(token.rstrip("lLfFdD"))
    if value is None or abs(value) in CONVERSIONS:
        return None
    whole = value == int(value)
    plain = abs(value) < NUMBER_MINIMUM if whole else len(token.split(".")[1].rstrip("lLfFdD")) < 2
    return None if plain else ("number", value)


def constants(root, paths, exclude):
    """Every named constant with a single literal value, in every code file of ours, tests left out."""
    found = []
    for path in paths:
        lang = NATIVE_SUFFIXES.get(pathlib.PurePosixPath(path).suffix) or dry_check.language(root, path)
        pattern = CONSTANT_LINE.get(lang)
        if not pattern or dry_check.TEST_FILE.search(path) or MORE_TESTS.search(path) or dry_check.NOT_OURS.search(path) \
                or path.endswith(dry_check.GENERATED) or dry_check.matches(path, exclude) or VENDORED.search(path):
            continue
        for number, text in enumerate(dry_check.read(root, path).splitlines(), 1):
            match = pattern.match(text)
            value = match and literal_value(match.group("value"))
            if value:
                found.append(Constant(path, number, tool(path), value, text.strip()))
    return found


def at_or_under(path: str, place: str) -> bool:
    place = place.rstrip("/")
    return path == place or path.startswith(place + "/")


def covered(constant, rows):
    """True when a twins row names this constant's owner: its pattern matches the line, in its files."""
    for row in rows:
        try:
            pattern = re.compile(row.get("pattern") or "(?!)")
        except re.error:
            continue  # the copy's twins check reports the broken pattern
        sides = [row.get("owner") or "", row.get("other") or ""]
        if pattern.search(constant.text) and any(side and at_or_under(constant.path, side) for side in sides):
            return True
    return False


def cross_tool(found, rows):
    """The constants whose value is also named in another tool, with no twins row naming its owner."""
    by_value = collections.defaultdict(list)
    for constant in found:
        by_value[constant.value].append(constant)
    loose = []
    for value, uses in by_value.items():
        if len({use.tool for use in uses}) > 1:
            loose += [use for use in uses if not covered(use, rows)]
    return sorted(loose, key=lambda c: (c.path, c.line))


def constants_check(root, paths, section, exclude, rows):
    loose = cross_tool(constants(root, paths, exclude), rows)
    lines = collections.defaultdict(list)
    for c in loose:
        others = sorted({u.tool for u in loose if u.value == c.value} - {c.tool})
        elsewhere = f"also in {', '.join(others)}" if others else "also in a tool whose copy a twins row covers"
        lines[c.path].append(f"{c.path}:{c.line}: {c.text[:dry_check.VALUE_SHOWN]} ({elsewhere}; add a twins row naming its owner)")
    found = collections.Counter(c.path for c in loose)
    return dry_check.ratchet(found, section.get("counts", {}), {}, "constants named in another tool too", lines), loose, \
        f"{len(loose)} constants another tool names too"


def constants_record(found, section, shrink):
    have, old = collections.Counter(c.path for c in found), section.get("counts", {})
    counts = {p: min(have.get(p, 0), n) for p, n in old.items()} if shrink else dict(have)
    return {**section, "counts": {p: n for p, n in sorted(counts.items()) if n}}


# ---------- main ----------


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="The DRY checks Ink Tools adds over dry_check.py (#295).")
    parser.add_argument("--root", type=pathlib.Path, help="the repository root (default: Git's top level)")
    parser.add_argument("--data", type=pathlib.Path, help="the data file (default: dry-check.json at the root)")
    modes = parser.add_mutually_exclusive_group()
    for flag in ("--init", "--shrink", "--list"):
        modes.add_argument(flag, dest="mode", action="store_const", const=flag[2:])
    parsed = parser.parse_args(argv)
    root, data_path, mode = parsed.root, parsed.data, parsed.mode or "check"
    register()
    for suffix, lang in unreadable_suffixes():
        print(f"dry-cross: warning: {suffix} is listed as {lang}, but no reader reads it", file=sys.stderr)
    root = (root or dry_check.git_root()).resolve()
    data_path = data_path if data_path and data_path.is_absolute() else root / (data_path or dry_check.DATA_FILE)
    try:
        data = json.loads(data_path.read_text(encoding="utf-8"))
        paths = dry_check.tracked(root)
    except (OSError, ValueError, dry_check.GitFailed) as error:
        print(f"dry-cross: cannot read {data_path} or the tracked files: {error}", file=sys.stderr)
        return dry_check.EXIT_USAGE
    if SECTION not in data:
        print(f"dry-cross: skipped: {data_path.name} has no {SECTION} object")
        return 0
    section = data[SECTION]
    exclude = section.get("exclude", data.get("magicValues", {}).get("exclude", []))
    rows = data.get("twins", {}).get("rules", [])
    checks = {
        "languages": (lambda s: languages_check(root, paths, s, exclude), languages_record),
        "constants": (lambda s: constants_check(root, paths, s, exclude, rows), constants_record),
    }
    status = 0
    for name, (run, record) in checks.items():
        part = section.get(name, {})
        problems, found, summary = run(part)
        if mode == "list":
            items = found if name == "constants" else found[0]
            for item in items:
                print(f"{name}: {item.path}:{item.line}: {getattr(item, 'text', None) or f'{item.kind} {item.value}'}")
            continue
        if mode in ("init", "shrink"):
            if mode == "init" and (part.get("counts") or part.get("duplicates")):
                print(f"dry-cross: {name} already has counts; --init records today's count once, use --shrink", file=sys.stderr)
                status = max(status, dry_check.EXIT_USAGE)
                continue
            section[name] = record(found, part, shrink=mode == "shrink")
            print(f"dry-cross: {name} recorded, {summary}")
            continue
        for problem in problems:
            print(f"{name}: {problem}")
        if problems:
            status = max(status, dry_check.EXIT_FINDING)
        else:
            print(f"dry-cross: {name} ok, {summary}")
    if mode in ("init", "shrink"):
        data_path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return status


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
