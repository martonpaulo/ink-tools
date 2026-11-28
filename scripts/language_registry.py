#!/usr/bin/env python3
"""Generate the language registry from a pinned Unicode CLDR release (#500).

    language_registry.py [--root DIR] [--cache DIR] [--write]

`registry/languages/sources.json` pins three CLDR npm packages by URL and SHA-256;
`registry/languages/exceptions.json` holds the facts no CLDR file gives, each with its source. The
script downloads the packages (or reads them from `--cache`), checks each SHA-256, and builds
`registry/languages/languages.json`, and its copy for the TypeScript reader,
`packages/ink-core/src/languages.generated.ts`:

- `languages`: one entry per language CLDR's `coverageLevels.json` lists (a base code, no region),
  with its ISO 639-3 code (CLDR's `overlong` language aliases), its likely script and region
  (`likelySubtags.json`), its grid letters (the `index` exemplar set of `characters.json`) and,
  when CLDR has a `<code>-ASCII` transform, the letters that transform folds first;
- `latinAscii`: CLDR's `Latin-ASCII` transform as one upper-case letter → replacement table;
- `exceptions`: `exceptions.json` as written.

Without `--write` it compares the generation with the committed file and fails on a difference, so
the file is never edited by hand. Every reader (`packages/ink-core/src/languages.ts`,
`scripts/languages.py`, the Java reader in `packages/sn-adapter/native/`) folds through this one
table, and `registry/languages/cases.json` is the case table each of them runs.

Exit 0 when the file is current or written, 1 when it is stale, 2 on a bad pin or a failed download.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import pathlib
import re
import sys
import tarfile
import unicodedata
import urllib.request

FOLDER = "registry/languages"
SOURCES = f"{FOLDER}/sources.json"
EXCEPTIONS = f"{FOLDER}/exceptions.json"
OUTPUT = f"{FOLDER}/languages.json"
# The TypeScript reader's data: Metro bundles TypeScript, not a JSON file outside the package.
TS_OUTPUT = "packages/ink-core/src/languages.generated.ts"
DOWNLOAD_SECONDS = 60  # the largest package, cldr-misc-full, is about 1 MB compressed
PREFIX = "package/"
OVERLONG = "overlong"
ALPHA3_LENGTH = 3  # an ISO 639-3 code


# ---------- CLDR's own formats ----------


def unicode_set(text: str) -> list[str]:
    """The items of a CLDR exemplar set such as `[a b c {ch}]`, each a letter or a `{…}` string."""
    body = text.strip()
    if body.startswith("[") and body.endswith("]"):
        body = body[1:-1]
    items: list[str] = []
    for part in body.split():
        if part.startswith("{") and part.endswith("}"):
            items.append(part[1:-1])
        else:
            items.extend(ch for ch in part if ch != "\\")
    return items


RULE = re.compile(r"^(?P<source>.+?)\s*→\s*(?P<target>[^;]*?)\s*;")
VARIABLE = re.compile(r"^\$(?P<name>\w+)\s*=\s*(?P<value>.+?)\s*;")


def _unescape(text: str) -> str:
    text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
    return text.replace("\\'", "'").replace("'", "")


def _sources(text: str, variables: dict[str, list[str]]) -> list[str] | None:
    """The literal strings a rule's left side matches, or None for a rule with context or a class."""
    text = text.strip()
    if text.startswith("$") and text[1:] in variables:
        return variables[text[1:]]
    if text.startswith("[") and text.endswith("]") and "[:" not in text:
        return [unicodedata.normalize("NFC", _unescape(item)) for item in unicode_set(text)]
    if any(ch in text for ch in "{}[]$:"):
        return None
    return [unicodedata.normalize("NFC", _unescape(text))]


def transform_rules(text: str) -> dict[str, str]:
    """The plain one-to-one rules of a CLDR transform file (`Æ → AE ;`, `[ä {a\\u0308}] → ae;`).
    Rules with a context, a class or a filter are skipped: folding upper-cases first, so the
    title-case context rules give the same letters as their plain ones."""
    variables: dict[str, list[str]] = {}
    rules: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("::"):
            continue
        variable = VARIABLE.match(line)
        if variable:
            sources = _sources(variable.group("value"), variables)
            if sources is not None:
                variables[variable.group("name")] = sources
            continue
        rule = RULE.match(line)
        if not rule:
            continue
        sources = _sources(rule.group("source"), variables)
        if sources is None:
            continue
        target = _unescape(rule.group("target"))
        for source in sources:
            rules.setdefault(source, target)
    return rules


def upper_table(rules: dict[str, str]) -> dict[str, str]:
    """The rules for single letters, upper case, as a grid reads them; a letter whose upper case
    is more than one letter (ß) is already folded by upper-casing."""
    table: dict[str, str] = {}
    for source, target in rules.items():
        upper = source.upper()
        if len(upper) == 1 and upper != target.upper():
            table.setdefault(upper, target.upper())
    return dict(sorted(table.items()))


# ---------- the packages ----------


def fetch(name: str, pin: dict, cache: pathlib.Path | None) -> dict[str, bytes]:
    """The files of one pinned npm package, by their path inside `package/`."""
    path = cache / f"{name}.tgz" if cache else None
    if path and path.is_file():
        data = path.read_bytes()
    else:
        request = urllib.request.Request(pin["url"], headers={"User-Agent": "ink-tools-language-registry"})
        with urllib.request.urlopen(request, timeout=DOWNLOAD_SECONDS) as response:  # noqa: S310 - a pinned https URL
            data = response.read()
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if digest != pin["sha256"]:
        raise SystemExit(f"{name}: SHA-256 {digest} is not the pinned {pin['sha256']}")
    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            if member.isfile() and member.name.startswith(PREFIX):
                files[member.name[len(PREFIX):]] = tar.extractfile(member).read()
    return files


def read_json(files: dict[str, bytes], path: str):
    return json.loads(files[path].decode("utf-8"))


def generate(core: dict[str, bytes], misc: dict[str, bytes], transforms: dict[str, bytes],
             cldr: str, exceptions: dict) -> dict:
    """The registry from the three packages' files: no network, so a test runs it over fixtures."""
    levels = read_json(core, "coverageLevels.json")["coverageLevels"]
    likely = read_json(core, "supplemental/likelySubtags.json")["supplemental"]["likelySubtags"]
    aliases = read_json(core, "supplemental/aliases.json")["supplemental"]["metadata"]["alias"]["languageAlias"]
    alpha3 = {}
    for code, alias in sorted(aliases.items()):
        if alias.get("_reason") == OVERLONG and len(code) == ALPHA3_LENGTH:
            alpha3.setdefault(alias["_replacement"], code)
    languages = {}
    for code in sorted(c for c in levels if "-" not in c and c != "root"):
        characters = f"main/{code}/characters.json"
        if characters not in misc:
            continue
        index = read_json(misc, characters)["main"][code]["characters"].get("index")
        tag = likely.get(code, code).split("-")
        entry = {
            "alpha3": alpha3.get(code, code),
            "script": tag[1] if len(tag) > 1 else None,
            "region": tag[2] if len(tag) > 2 else None,
            "letters": [unicodedata.normalize("NFC", item).upper() for item in unicode_set(index)] if index else [],
        }
        own = f"transforms/{code}-ASCII.txt"
        if own in transforms:
            entry["fold"] = upper_table(transform_rules(transforms[own].decode("utf-8")))
        languages[code] = entry
    return {
        "about": "Generated by scripts/language_registry.py from Unicode CLDR (#500); never edit by hand.",
        "cldr": cldr,
        "licence": "Unicode-3.0",
        "latinAscii": upper_table(transform_rules(transforms["transforms/Latin-ASCII.txt"].decode("utf-8"))),
        "languages": languages,
        "exceptions": {k: v for k, v in exceptions.items() if k != "about"},
    }


def visible(text: str) -> str:
    """The JSON text with each invisible character (a format or space character, such as the soft
    hyphen Latin-ASCII maps) written as its escape, which reads back as the same string."""
    return "".join(f"\\u{ord(ch):04x}" if unicodedata.category(ch) in ("Cf", "Zs") and ch != " " else ch
                   for ch in text)


def render(registry: dict) -> str:
    return visible(json.dumps(registry, ensure_ascii=False, indent=1, sort_keys=False)) + "\n"


def render_ts(registry: dict) -> str:
    """The TypeScript reader's copy: the same data, compact, with its type."""
    body = visible(json.dumps(registry, ensure_ascii=False, separators=(",", ":")))
    return ("// Generated by scripts/language_registry.py from registry/languages/languages.json (#500); never edit by hand.\n"
            "import type {LanguageRegistry} from './languageTypes';\n\n"
            f"export const LANGUAGE_REGISTRY: LanguageRegistry = {body};\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--cache", type=pathlib.Path, default=None, help="keep and reuse the downloads here")
    parser.add_argument("--write", action="store_true", help="write the file instead of checking it")
    args = parser.parse_args(argv)
    root = args.root
    sources = json.loads((root / SOURCES).read_text(encoding="utf-8"))
    exceptions = json.loads((root / EXCEPTIONS).read_text(encoding="utf-8"))
    packages = {name: fetch(name, pin, args.cache) for name, pin in sources["packages"].items()}
    registry = generate(packages["cldr-core"], packages["cldr-misc-full"], packages["cldr-transforms"],
                        sources["cldr"], exceptions)
    outputs = {OUTPUT: render(registry), TS_OUTPUT: render_ts(registry)}
    stale = 0
    for name, text in outputs.items():
        output = root / name
        if args.write:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(text, encoding="utf-8")
            print(f"wrote {name}")
        elif not output.is_file() or output.read_text(encoding="utf-8") != text:
            print(f"{name}: stale or edited by hand; run python3 scripts/language_registry.py --write")
            stale = 1
        else:
            print(f"{name}: current, CLDR {sources['cldr']}")
    return stale


if __name__ == "__main__":
    sys.exit(main())
