#!/usr/bin/env python3
"""Build one language's Puzzles pack from public data, with no code per language (#484).

    build_pack.py --language CODE --cldr DIR --tatoeba FILE --wiktextract FILE --out DIR [--version V]

Every input is a local file: the build host downloads them first (they are large, and the cloud
session's proxy refuses two of the hosts). Each language is read the same way:

- **Alphabet**: CLDR's `index` exemplar characters of the language
  (`<cldr>/main/<code>/characters.json`, from the `cldr-misc-full` package), the letters a grid
  shows.
- **Folding**: a letter of the alphabet stays; any other letter goes through the language's own
  CLDR transform to ASCII when CLDR has one (`<cldr>/transforms/<code>-ASCII.txt`, from the
  `cldr-transforms` package), then `Latin-ASCII.txt`, then loses its combining marks. A word with
  a letter still outside the alphabet is dropped.
- **Words**: the Tatoeba per-language sentence export (`id`, language, text; `.bz2` or plain), the
  number of sentences each folded word stands in, most frequent first. Only the counts are kept.
- **Dictionary**: the wiktextract JSONL of the language (as kaikki.org publishes it). A word stays
  only when Wiktionary has it; a word whose every entry is a proper noun (`pos` `name`) is dropped,
  and a word with a sense tagged `vulgar` or `offensive` is dropped and kept in the pack's `avoid`
  list, which a word search's filler never spells. The first gloss of a word's first other
  sense is its clue. No other filter: the sources' own tags decide (owner, 2026-11-27).

The pack is `<out>/<code>-<version>.json` with `<out>/<code>-<version>.manifest.json` beside it:
the pack's SHA-256 and size, each source with its file's SHA-256 and licence, so the tablet checks
the download and shows its size first (#503).
"""
from __future__ import annotations

import argparse
import bz2
import collections
import datetime
import hashlib
import json
import pathlib
import re
import sys
import unicodedata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_word_lists import AVOID_MIN_LETTERS, MAX_WORDS, MIN_LETTERS, MIN_SENTENCES, TATOEBA_FIELDS, score  # noqa: E402

FORMAT = 1
WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*")
APOSTROPHE = re.compile(r"['’]")
PROPER_POS = "name"  # wiktextract's part of speech for a proper noun
AVOID_TAGS = frozenset({"vulgar", "offensive"})
# The longest clue a pack keeps, in characters; the crossword's own fit check decides what a grid shows.
# shortcut: a guess at two short lines; set it from the clue cell's measured fit (#400) on the Mac run.
CLUE_CHARACTERS = 84

LICENCES = {
    "cldr": "Unicode-3.0",
    "tatoeba": "CC-BY-2.0-FR",
    "wiktextract": "CC-BY-SA-4.0",
}

# ---------- CLDR ----------


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


def alphabet(cldr: pathlib.Path, code: str) -> list[str]:
    """The language's grid letters: CLDR's `index` set, upper case, in its order."""
    path = cldr / "main" / code / "characters.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    index = data["main"][code]["characters"]["index"]
    return [unicodedata.normalize("NFC", item).upper() for item in unicode_set(index)]


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


def folding(cldr: pathlib.Path, code: str) -> dict[str, str]:
    """Upper-case letter → upper-case replacement: the language's own transform first, then Latin-ASCII."""
    table: dict[str, str] = {}
    for name in (f"{code}-ASCII.txt", "Latin-ASCII.txt"):
        path = cldr / "transforms" / name
        if path.is_file():
            for source, target in transform_rules(path.read_text(encoding="utf-8")).items():
                table.setdefault(source.upper(), target.upper())
    return table


def fold(word: str, letters: list[str], table: dict[str, str]) -> str | None:
    """The word in the grid's letters, or None when a letter has no place in the grid."""
    text = unicodedata.normalize("NFC", word).upper()
    keep = set(letters)
    out = []
    for ch in text:
        if ch in keep:
            out.append(ch)
            continue
        replaced = table.get(ch)
        if replaced is None:
            replaced = "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c))
        out.append(replaced)
    folded = "".join(out)
    if len(folded) < MIN_LETTERS or any(ch not in keep for ch in folded):
        return None
    return folded


# ---------- Tatoeba and wiktextract ----------


def read_text(path: pathlib.Path) -> str:
    data = path.read_bytes()
    if path.suffix == ".bz2":
        data = bz2.decompress(data)
    return data.decode("utf-8")


def sentences(path: pathlib.Path) -> list[str]:
    """The texts of a Tatoeba per-language export: one `id`, language, text line each."""
    out = []
    for line in read_text(path).splitlines():
        parts = line.split("\t")
        if len(parts) >= TATOEBA_FIELDS:
            out.append(parts[2])
    return out


class Dictionary:
    """What the wiktextract JSONL says about each lower-case word."""

    def __init__(self) -> None:
        self.known: set[str] = set()
        self.common: set[str] = set()  # has an entry that is not a proper noun
        self.avoid: set[str] = set()
        self.clues: dict[str, str] = {}

    @classmethod
    def read(cls, path: pathlib.Path) -> "Dictionary":
        words = cls()
        for line in read_text(path).splitlines():
            if not line.strip():
                continue
            entry = json.loads(line)
            word = entry.get("word")
            if not isinstance(word, str) or not word:
                continue
            words.add(word.lower(), entry)
        return words

    def add(self, word: str, entry: dict) -> None:
        self.known.add(word)
        senses = [s for s in entry.get("senses") or [] if isinstance(s, dict)]
        tags = set(entry.get("tags") or [])
        if tags & AVOID_TAGS or any(set(s.get("tags") or []) & AVOID_TAGS for s in senses):
            self.avoid.add(word)
        if entry.get("pos") == PROPER_POS:
            return
        self.common.add(word)
        if word not in self.clues:
            for sense in senses:
                glosses = [g for g in sense.get("glosses") or [] if isinstance(g, str) and g.strip()]
                if glosses:
                    self.clues[word] = glosses[0].strip()[:CLUE_CHARACTERS]
                    break


def tokens(sentence: str, words: Dictionary) -> list[str]:
    """The lower-case words of a sentence. A word with an apostrophe counts whole when Wiktionary
    has it, else each of its parts does (an elision such as l'acqua), so no language needs a rule."""
    out = []
    for match in WORD.finditer(unicodedata.normalize("NFC", sentence)):
        token = match.group().lower()
        if APOSTROPHE.search(token) and token not in words.known:
            out.extend(part for part in APOSTROPHE.split(token) if part)
        else:
            out.append(token)
    return out


# ---------- the pack ----------


def build(code: str, cldr: pathlib.Path, tatoeba: pathlib.Path, wiktextract: pathlib.Path) -> dict:
    letters = alphabet(cldr, code)
    table = folding(cldr, code)
    words = Dictionary.read(wiktextract)
    counts: collections.Counter = collections.Counter()
    for sentence in sentences(tatoeba):
        counts.update(set(tokens(sentence, words)))
    avoid = {f for w in words.avoid if (f := fold(w, letters, table)) and len(f) >= AVOID_MIN_LETTERS}
    merged: collections.Counter = collections.Counter()
    clues: dict[str, str] = {}
    for word, n in counts.items():
        if word not in words.common or word in words.avoid:
            continue
        folded = fold(word, letters, table)
        if folded is None or folded in avoid:
            continue
        merged[folded] += n
        if word in words.clues:
            clues.setdefault(folded, words.clues[word])
    ranked = [w for w, n in sorted(merged.items(), key=lambda item: (-item[1], item[0])) if n >= MIN_SENTENCES]
    ranked = ranked[:MAX_WORDS]
    return {
        "format": FORMAT,
        "language": code,
        "alphabet": "".join(letters),
        "words": ranked,
        "scores": [score(rank, len(ranked)) for rank in range(1, len(ranked) + 1)],
        "clues": {w: clues[w] for w in ranked if w in clues},
        "avoid": sorted(avoid),
    }


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source(kind: str, path: pathlib.Path) -> dict:
    return {"source": kind, "file": path.name, "sha256": sha256(path.read_bytes()), "licence": LICENCES[kind]}


def cldr_files(cldr: pathlib.Path, code: str) -> list[pathlib.Path]:
    names = [cldr / "main" / code / "characters.json", cldr / "transforms" / f"{code}-ASCII.txt",
             cldr / "transforms" / "Latin-ASCII.txt"]
    return [path for path in names if path.is_file()]


def write(out: pathlib.Path, pack: dict, version: str, sources: list[dict]) -> pathlib.Path:
    """Writes the pack and its manifest; answers the manifest's path."""
    out.mkdir(parents=True, exist_ok=True)
    stem = f"{pack['language']}-{version}"
    body = (json.dumps({**pack, "version": version}, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    (out / f"{stem}.json").write_bytes(body)
    manifest = {
        "format": FORMAT,
        "language": pack["language"],
        "version": version,
        "file": f"{stem}.json",
        "bytes": len(body),
        "sha256": sha256(body),
        "words": len(pack["words"]),
        "sources": sources,
        "licences": sorted({s["licence"] for s in sources}),
    }
    path = out / f"{stem}.manifest.json"
    path.write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    return path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--language", required=True, help="the BCP 47 language code, as CLDR names its folder")
    parser.add_argument("--cldr", type=pathlib.Path, required=True)
    parser.add_argument("--tatoeba", type=pathlib.Path, required=True)
    parser.add_argument("--wiktextract", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--version", default=datetime.date.today().isoformat())
    args = parser.parse_args(argv)
    pack = build(args.language, args.cldr, args.tatoeba, args.wiktextract)
    sources = [source("cldr", p) for p in cldr_files(args.cldr, args.language)]
    sources += [source("tatoeba", args.tatoeba), source("wiktextract", args.wiktextract)]
    manifest = write(args.out, pack, args.version, sources)
    print(f"pack\t{args.language}\t{len(pack['words'])} words\t{manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
