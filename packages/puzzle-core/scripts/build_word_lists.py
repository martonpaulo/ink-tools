#!/usr/bin/env python3
"""Build the Puzzles word lists, one per language, from allowed sources only (#381).

    build_word_lists.py [--cache DIR] [--check] [--refresh]

Writes `words/<lang>.json` for EN, PT, ES, DE and FR: the words in the language's grid letters,
most frequent first, a fill score per word, and the word-search themes. Writes `words/avoid.json`
too: each language's offensive words of three letters or more, folded the same way, which a word
search's filler letters must never spell (#385). Every source is pinned in
`words/sources.json` with its URL, SHA-256 and licence; a download whose SHA-256 differs stops the
build and names the source. `--cache` keeps the downloads in DIR and reads them from there next
time. `--check` builds and fails when a committed list differs. `--refresh` takes the current
download of each source whose upstream publishes a new snapshot (Tatoeba, weekly) and records its
new SHA-256 and date in `words/sources.json`.

Sources (licences in `NOTICE.md`): Tatoeba sentences (CC BY 2.0 FR) give the word frequencies of
every language, and only word counts are kept, never a sentence; SCOWL (its own permissive
licence) confirms the English words; the LDNOOBW lists (CC BY 4.0) remove offensive words, and their
folded single words are bundled in `words/avoid.json`; SuperFun's word banks (MIT) give the EN, DE, FR and ES themes, and
`words/themes-pt.source.json`, written for this package, the Portuguese ones. Not used: CC BY-SA
data (Wiktionary, kaikki.org, wordfreq, Lexique, OdeNet) and the Hunspell dictionaries, whose
GPL, LGPL or MPL terms are outside the licences the repository allows.

The tablet never runs this: it reads the committed JSON only.
"""
from __future__ import annotations

import argparse
import bz2
import collections
import datetime
import hashlib
import io
import json
import math
import pathlib
import re
import sys
import tarfile
import tempfile
import unicodedata
import urllib.request

PACKAGE = pathlib.Path(__file__).resolve().parent.parent
WORDS = PACKAGE / "words"
MANIFEST = WORDS / "sources.json"
PT_THEMES = WORDS / "themes-pt.source.json"

LANGUAGES = ("en", "pt", "es", "de", "fr")
ALPHABETS = {lang: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" for lang in LANGUAGES}
ALPHABETS["es"] = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ"
SUPERFUN_COLUMNS = ("en", "de", "fr", "es", "it")  # the order of the word lists in each theme

# A word must stand in at least this many Tatoeba sentences: rarer ones are mostly typos and
# one-off names. Lists keep the most frequent words up to the cap, so a list stays small enough
# to bundle in the plugin.
MIN_SENTENCES = 3
MAX_WORDS = 18000
MIN_LETTERS = 2
# A word written with a capital inside a sentence at least this share of the time is a name.
PROPER_SHARE = 0.5
# Sentences another language needs before its name counts as a name in German.
NAME_EVIDENCE = 10
SCOWL_SIZE = 50  # SCOWL sizes 10 to 50 are the common English words
DOWNLOAD_SECONDS = 90  # the largest file, Tatoeba's English export, is about 25 MB
TATOEBA_FIELDS = 3  # id, language, text
# The filler of a word search avoids offensive words this long or longer: a two-letter one is
# read in almost every grid, and none of them is offensive on its own.
AVOID_MIN_LETTERS = 3

# German writes every noun with a capital, so its names are the words the other languages read as
# names; ß and the capital ẞ fold to SS.
FOLD_DE = {"Ä": "AE", "Ö": "OE", "Ü": "UE", "ẞ": "SS"}
FOLD_LIGATURES = {"Œ": "OE", "Æ": "AE"}
WORD = re.compile(r"[^\W\d_]+(?:['’][^\W\d_]+)*")
# French elides these before a vowel (l'homme, qu'il): the word after the apostrophe still counts.
FRENCH_ELISIONS = {"c", "d", "j", "l", "m", "n", "qu", "s", "t", "jusqu", "lorsqu", "puisqu", "quoiqu"}


def fold(word: str, lang: str) -> str | None:
    """The word in the language's grid letters, or None when a letter has no place in the grid.

    PT drops accents and the cedilla; FR drops accents and splits Œ and Æ; DE writes AE, OE, UE and
    SS; ES keeps Ñ and drops the other accents; EN keeps A to Z.
    """
    text = unicodedata.normalize("NFC", word).upper()  # Python already upper-cases ß to SS
    if lang == "de":
        text = "".join(FOLD_DE.get(ch, ch) for ch in text)
    if lang == "fr":
        text = "".join(FOLD_LIGATURES.get(ch, ch) for ch in text)
    out = []
    for ch in text:
        if lang == "es" and ch == "Ñ":
            out.append(ch)
            continue
        base = unicodedata.normalize("NFD", ch)[0]
        out.append(base)
    folded = "".join(out)
    alphabet = ALPHABETS[lang]
    if len(folded) < MIN_LETTERS or any(ch not in alphabet for ch in folded):
        return None
    return folded


# ---------- sources ----------

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(source_id: str, source: dict, cache: pathlib.Path, refresh: bool) -> bytes:
    """The bytes of one pinned source, from the cache or the network, checked against its SHA-256."""
    path = cache / source_id
    if path.is_file() and not refresh:
        data = path.read_bytes()
    else:
        request = urllib.request.Request(source["url"], headers={"User-Agent": "ink-tools-word-lists"})
        with urllib.request.urlopen(request, timeout=DOWNLOAD_SECONDS) as response:  # noqa: S310 - pinned https URLs
            data = response.read()
        path.write_bytes(data)
    digest = sha256(data)
    if digest != source["sha256"]:
        if refresh and source.get("snapshot"):
            source["sha256"] = digest
            source["retrieved"] = datetime.date.today().isoformat()
        else:
            raise SystemExit(f"{source_id}: SHA-256 {digest} is not the pinned {source['sha256']}; "
                             "re-run with --refresh for a new snapshot, or check the download")
    return data


def tatoeba_sentences(data: bytes) -> list[str]:
    """The sentence texts of a Tatoeba per-language export (id, language, text)."""
    out = []
    for line in bz2.decompress(data).decode("utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) >= TATOEBA_FIELDS:
            out.append(parts[2])
    return out


def scowl_words(data: bytes) -> set[str]:
    """SCOWL's common English words (sizes up to 50), lowercase, without names and abbreviations."""
    words: set[str] = set()
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            name = pathlib.PurePosixPath(member.name)
            if name.parent.name != "final" or not member.isfile():
                continue
            kind, _, size = name.name.rpartition(".")
            if not size.isdigit() or int(size) > SCOWL_SIZE:
                continue
            if not kind.endswith("-words") or kind.split("-")[0] not in ("english", "american", "british"):
                continue
            text = tar.extractfile(member).read().decode("latin-1")
            words.update(w for w in text.split() if w.islower() and w.isalpha())
    return words


def bad_words(data: bytes, lang: str) -> set[str]:
    """The folded single words of one LDNOOBW list."""
    out = set()
    for line in data.decode("utf-8").splitlines():
        line = line.strip()
        if line and " " not in line:
            folded = fold(line, lang)
            if folded:
                out.add(folded)
    return out


def avoid_file(bad: dict[str, set[str]]) -> str:
    """`words/avoid.json`: per language, the offensive words a filler must never spell, sorted."""
    data = {
        "about": "Offensive words a word search's filler letters must never spell (#385), folded to each "
                 "grid's letters by build_word_lists.py from the LDNOOBW lists (CC BY 4.0, NOTICE.md).",
        "sources": [f"ldnoobw-{lang}" for lang in LANGUAGES],
        "minLetters": AVOID_MIN_LETTERS,
        "words": {lang: sorted(w for w in bad[lang] if len(w) >= AVOID_MIN_LETTERS) for lang in LANGUAGES},
    }
    return json.dumps(data, ensure_ascii=False, indent=1) + "\n"


def superfun_themes(data: bytes) -> list[dict]:
    """SuperFun's themes: per tier, `T([names], en, de, fr, es, it)`, each a list of words."""
    text = data.decode("utf-8")
    themes = []
    tier = None
    for line_tier, body in re.findall(r"^\s{2}(easy|medium|hard):\s*\[|T\((\[.*?\]\s*(?:,\s*\[.*?\]\s*){5})\)", text, re.S | re.M):
        if line_tier:
            tier = line_tier
            continue
        lists = [re.findall(r"'([^']*)'", group) for group in re.findall(r"\[(.*?)\]", body, re.S)]
        names, words = lists[0], lists[1:]
        themes.append({
            "tier": tier,
            "names": dict(zip(SUPERFUN_COLUMNS, names)),
            "words": dict(zip(SUPERFUN_COLUMNS, words)),
        })
    return themes


# ---------- frequency ----------

def tokens(sentence: str, lang: str) -> list[str]:
    """The words of a sentence. A word with an apostrophe is a contraction (don't, d'água) and is
    left out, except a French elision, whose second part is the word."""
    out = []
    for match in WORD.finditer(unicodedata.normalize("NFC", sentence)):
        token = match.group()
        parts = re.split(r"['’]", token)
        if len(parts) == 1:
            out.append(token)
        elif lang == "fr" and len(parts) == 2 and parts[0].lower() in FRENCH_ELISIONS:
            out.append(parts[1])
    if lang == "fr":
        out = [token for token in out if token.lower() not in FRENCH_ELISIONS]  # a «qu» left alone
    return out


def count_words(sentences: list[str], lang: str) -> tuple[collections.Counter, collections.Counter, collections.Counter]:
    """Per lowercase word: sentences holding it, uses with a capital inside a sentence, other uses."""
    sentences_with = collections.Counter()
    capital_inside = collections.Counter()
    plain = collections.Counter()
    for sentence in sentences:
        seen = set()
        for index, token in enumerate(tokens(sentence, lang)):
            lower = token.lower()
            seen.add(lower)
            if index > 0 and token[0].isupper():
                capital_inside[lower] += 1
            elif token[0].islower():
                plain[lower] += 1
        sentences_with.update(seen)
    return sentences_with, capital_inside, plain


def proper_nouns(capital_inside: collections.Counter, plain: collections.Counter) -> set[str]:
    """Words written with a capital inside sentences at least PROPER_SHARE of the time."""
    out = set()
    for word, capitals in capital_inside.items():
        if capitals / (capitals + plain[word]) >= PROPER_SHARE:
            out.add(word)
    return out


def score(rank: int, total: int) -> int:
    """A fill score from 1 to 100, a percent: the most frequent word scores highest, on a log scale."""
    if total <= 1:
        return 100
    return max(1, round(100 * (1 - math.log(rank) / math.log(total + 1))))


def word_list(lang: str, counts, names: set[str], bad: set[str], allowed: set[str] | None) -> list[tuple[str, int]]:
    """The folded words of one language, most frequent first, with their sentence counts merged."""
    sentences_with, _, _ = counts
    merged = collections.Counter()
    for word, n in sentences_with.items():
        if word in names or (allowed is not None and word not in allowed):
            continue
        folded = fold(word, lang)
        if folded and folded not in bad:
            merged[folded] += n
    # The cut-off reads the merged count: «água» and «agua» are one grid word.
    merged = collections.Counter({word: n for word, n in merged.items() if n >= MIN_SENTENCES})
    # Most frequent first; equal counts in letter order, so a re-run writes the same file.
    ranked = sorted(merged.items(), key=lambda item: (-item[1], item[0]))
    if len(ranked) > MAX_WORDS:
        # The cap never splits a count: the words tied at the cut are all left out, so no letter
        # of the alphabet is kept over another.
        cut = ranked[MAX_WORDS][1]
        ranked = [item for item in ranked if item[1] > cut]
    return ranked


def restore_enye(word: str, known: set[str]) -> str:
    """A Spanish theme word written without Ñ, given its Ñ back where only that spelling is known."""
    if "N" not in word or word in known:
        return word
    positions = [i for i, ch in enumerate(word) if ch == "N"]
    for mask in range(1, 1 << len(positions)):
        letters = list(word)
        for bit, i in enumerate(positions):
            if mask & (1 << bit):
                letters[i] = "Ñ"
        candidate = "".join(letters)
        if candidate in known:
            return candidate
    return word


def themes_for(lang: str, superfun: list[dict], pt_themes: list[dict], known: set[str], bad: set[str]) -> list[dict]:
    out = []
    source = pt_themes if lang == "pt" else superfun
    for theme in source:
        words = []
        for raw in theme["words"][lang]:
            folded = fold(re.sub(r"[\s-]", "", raw), lang)  # «quebra-cabeça» is one grid word
            if not folded:
                continue
            if lang == "es":
                folded = restore_enye(folded, known)
            if folded not in bad and folded not in words:
                words.append(folded)
        out.append({"tier": theme["tier"], "name": theme["names"][lang], "words": words})
    return out


def build(cache: pathlib.Path, refresh: bool) -> dict[str, str]:
    """Every output file's text, by file name."""
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sources = manifest["sources"]
    get = lambda source_id: fetch(source_id, sources[source_id], cache, refresh)  # noqa: E731

    counts = {lang: count_words(tatoeba_sentences(get(f"tatoeba-{lang}")), lang) for lang in LANGUAGES}
    names = {lang: proper_nouns(c[1], c[2]) for lang, c in counts.items()}
    # German capitalises its nouns, so its names are the other languages' names, each one common
    # there: a German noun quoted once in an English sentence is not a name.
    names["de"] = {
        word for lang in LANGUAGES if lang != "de" for word in names[lang] if counts[lang][0][word] >= NAME_EVIDENCE
    }
    english = scowl_words(get("scowl"))
    superfun = superfun_themes(get("superfun"))
    pt_themes = json.loads(PT_THEMES.read_text(encoding="utf-8"))["themes"]

    files = {}
    bad_by_lang = {lang: bad_words(get(f"ldnoobw-{lang}"), lang) for lang in LANGUAGES}
    for lang in LANGUAGES:
        bad = bad_by_lang[lang]
        ranked = word_list(lang, counts[lang], names[lang], bad, english if lang == "en" else None)
        # Every spelling Tatoeba holds, names included: «España» restores ESPAÑA in a theme.
        known = {fold(word, lang) for word in counts[lang][0]}
        used = [f"tatoeba-{lang}", f"ldnoobw-{lang}"] + (["scowl"] if lang == "en" else [])
        used += ["themes-pt"] if lang == "pt" else ["superfun"]
        data = {
            "language": lang,
            "alphabet": ALPHABETS[lang],
            "sources": used,
            "words": [word for word, _ in ranked],
            "scores": [score(rank, len(ranked)) for rank in range(1, len(ranked) + 1)],
            "themes": themes_for(lang, superfun, pt_themes, known, bad),
        }
        files[f"{lang}.json"] = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    files["avoid.json"] = avoid_file(bad_by_lang)
    if refresh:
        files["sources.json"] = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    return files


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--cache", type=pathlib.Path)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    if args.check and args.refresh:
        parser.error("--check reads the pinned sources; --refresh moves them")
    with tempfile.TemporaryDirectory() as scratch:
        cache = args.cache or pathlib.Path(scratch)
        cache.mkdir(parents=True, exist_ok=True)
        files = build(cache, args.refresh)
    stale = []
    for name, text in files.items():
        path = WORDS / name
        if args.check:
            if not path.is_file() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        else:
            path.write_text(text, encoding="utf-8")
    if stale:
        print("stale: " + ", ".join(stale) + "; run build_word_lists.py", file=sys.stderr)
        return 1
    for name, text in files.items():
        if name.endswith(".json") and name != "sources.json":
            words = json.loads(text)["words"]
            count = sum(map(len, words.values())) if isinstance(words, dict) else len(words)
            print(f"{name}: {count} words")
    return 0


if __name__ == "__main__":
    sys.exit(main())
