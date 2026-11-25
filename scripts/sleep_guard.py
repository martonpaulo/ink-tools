#!/usr/bin/env python3
"""No test proves «nothing happened», or waits for work, by sleeping (#740).

    sleep_guard.py [ROOT]

A sleep in a test (`time.Sleep(`, `time.sleep(`, `sleep(`, `Task.sleep(`, `Thread.sleep(`,
`usleep(`, `waitForTimeout(`, a shell `sleep 1`) needs a `timing-independent:` note on its line or
the line above, saying why the time cannot change the result: a poll with a deadline, a fake that
stands for slow work. A check that nothing arrived waits on a signal instead; a known one not fixed
yet carries `timing-dependent (#N):`, naming the open issue that removes it.

An assertion on elapsed wall-clock time (`assertLess(elapsed, 2)`, `time.monotonic() - start`,
`time.Since(`, `Date.now() -`, a comparison with a `*_MS` or `*_SECONDS` budget constant, #1858)
is a measurement, not a test: a loaded machine fails it (#1712). It
needs the same note, or the file holds a measurement switch, an environment variable named
`<PREFIX>_PERF_TESTS` the bound runs only under (Panoram's `PANORAM_PERF_TESTS`).

A test file is `*_test.go`, `test_*.py`, `*_test.py`, `*.test.*`, `*.spec.*`, `*Tests.swift`,
`*Test.swift`, or a code file in a `tests`, `Tests`, `test` or `__tests__` folder. Dot folders,
`node_modules`, `vendor`, `third_party` and `.build` are left out. Prints one line per finding and
exits 1 on any, 2 on a usage error. Python's standard library only. Adapted from Panoram's
tools/sleep_guard.py (the owner's own code), which reads Go only.

shortcut: a regex per line, not a parser, so a sleep inside a string counts (a fake's code usually
is one) and a trailing comment that names a sleep counts too; a parser would need each language's
toolchain in every gate.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

NOTE = "timing-independent:"
DEBT = re.compile(r"timing-dependent \(#\d+\):")
CODE = {".go", ".py", ".sh", ".bash", ".zsh", ".swift", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
        ".rb", ".kt", ".java", ".rs"}
TEST_NAME = re.compile(r"(_test\.go|^test_.*\.py|_test\.py|\.(test|spec)\.[^.]+|Tests?\.swift)$")
TEST_DIRS = {"tests", "Tests", "test", "__tests__"}
SKIP_DIRS = {"node_modules", "vendor", "third_party", ".build"}
SLEEP = re.compile(
    r"(\b(time\.Sleep|sleep|usleep|waitForTimeout)\s*\("
    r"|(^|[\s;&|({`])sleep\s+[\d$.])"
)
ASSERT = re.compile(r"\b(assert\w*|expect|XCTAssert\w*|require\.\w+)\b")
ELAPSED = re.compile(
    r"(\belapsed\w*\b|time\.Since\(|\b(monotonic|perf_counter|time|now|Now)\(\)\s*-\s*[A-Za-z_])"
    # a time budget held in a constant: `assert.ok(firstCard <= WARM_FIRST_CARD_MS)` (#1858)
    r"|[<>]=?\s*[A-Z][A-Z0-9_]*_(MS|SECONDS)\b"
)
SWITCH = re.compile(r"\b[A-Z][A-Z0-9]*_PERF_TESTS\b")
COMMENT = ("#", "//", "/*")


def is_test(path: Path, root: Path) -> bool:
    if path.suffix not in CODE:
        return False
    return bool(TEST_NAME.search(path.name)) or any(
        part in TEST_DIRS for part in path.relative_to(root).parts[:-1]
    )


def problems(root: Path) -> list[str]:
    found = []
    for folder, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(files):
            path = Path(folder, name)
            if not is_test(path, root):
                continue
            try:
                lines = path.read_text(encoding="utf-8").split("\n")
            except (OSError, UnicodeError):
                continue
            switched = bool(SWITCH.search("\n".join(lines)))
            for index, line in enumerate(lines):
                if line.lstrip().startswith(COMMENT):
                    continue
                sleep = SLEEP.search(line)
                bound = not switched and ASSERT.search(line) and ELAPSED.search(line)
                if not (sleep or bound):
                    continue
                near = line + (lines[index - 1] if index else "")
                if NOTE in near or DEBT.search(near):
                    continue
                where = f"{path.relative_to(root).as_posix()}:{index + 1}:"
                if sleep:
                    found.append(
                        f"{where} a sleep in a test without a «{NOTE}» note; wait on the condition, "
                        "or name the open issue with «timing-dependent (#N):» (#740)"
                    )
                else:
                    found.append(
                        f"{where} an elapsed-time bound in a test without a «{NOTE}» note; it is a "
                        "measurement: say why load cannot fail it, or run it only under a "
                        "<PREFIX>_PERF_TESTS switch (#1712)"
                    )
    return found


def main(argv: list[str]) -> int:
    if len(argv) > 1 or (argv and not Path(argv[0]).is_dir()):
        print("usage: sleep_guard.py [ROOT]", file=sys.stderr)
        return 2
    found = problems(Path(argv[0] if argv else "."))
    for problem in found:
        print(problem)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
