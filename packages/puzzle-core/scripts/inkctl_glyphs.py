#!/usr/bin/env python3
"""Write the ink check's test glyphs from `inkctl ink write`'s own font (#382).

    inkctl_glyphs.py [--check]

Loads `cli/inkctl/src/inkctl` by path and asks its `text_strokes` for each digit and letter, one
character at a time, with its top-left corner at 0, 0 and an x-height of 50 px. It writes
`__tests__/fixtures/inkctl-glyphs.json`, so the ink check's tests place the same strokes in grid
cells that `inkctl ink write` draws on the tablet. `--check` fails when the committed file differs.
"""
from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
INKCTL = ROOT / "cli" / "inkctl" / "src" / "inkctl"
OUT = pathlib.Path(__file__).resolve().parents[1] / "__tests__" / "fixtures" / "inkctl-glyphs.json"
CHARACTERS = "0123456789abcdefghijklmnopqrstuvwxyz"
X_HEIGHT = 50


def load_inkctl():
    loader = importlib.machinery.SourceFileLoader("inkctl", str(INKCTL))
    spec = importlib.util.spec_from_loader("inkctl", loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


def build() -> str:
    inkctl = load_inkctl()
    glyphs = {ch: inkctl.text_strokes(ch, 0, 0, X_HEIGHT) for ch in CHARACTERS}
    data = {"source": "cli/inkctl/src/inkctl text_strokes", "xHeight": X_HEIGHT, "glyphs": glyphs}
    return json.dumps(data, separators=(",", ":")) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail when the committed file differs")
    args = parser.parse_args()
    text = build()
    if args.check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT.relative_to(ROOT)} differs from inkctl's font; run {pathlib.Path(__file__).name}", file=sys.stderr)
            return 1
        print(f"{OUT.relative_to(ROOT)}: matches inkctl's font")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(CHARACTERS)} glyphs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
