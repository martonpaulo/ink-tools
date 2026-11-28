"""The Python reader of the language registry (#500): `registry/languages/languages.json`, generated
from Unicode CLDR by `language_registry.py`. One folding rule and one code format for every Python
tool; `registry/languages/cases.json` is the case table it shares with the other readers.

Inside, a language is its BCP 47 tag (`pt-BR`); each outside form is made only here: `pt_BR` on the
tablet, `pt` for Wikipedia, `por` for Apertium, `PT` in a label, `es-ES>pt-BR` for a pair.
"""
from __future__ import annotations

import functools
import json
import pathlib
import unicodedata

REGISTRY = pathlib.Path(__file__).resolve().parent.parent / "registry" / "languages" / "languages.json"


@functools.lru_cache(maxsize=None)
def load(path: pathlib.Path = REGISTRY) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _entry(language: str, registry: dict) -> dict:
    code = language.split("-")[0]
    if code not in registry["languages"]:
        raise KeyError(f"{language}: not in the language registry")
    return registry["languages"][code]


def grid_letters(language: str, registry: dict | None = None) -> list[str]:
    """The letters a grid of the language shows: CLDR's index set."""
    return _entry(language, registry or load())["letters"]


def _strip_marks(ch: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c))


def fold(text: str, language: str, registry: dict | None = None) -> str | None:
    """The text in the language's grid letters, upper case, or None when a letter has no place in
    the grid: a grid letter stays, any other goes through the language's own CLDR transform, then
    Latin-ASCII, then loses its marks."""
    registry = registry or load()
    entry = _entry(language, registry)
    letters = set(entry["letters"])
    own = entry.get("fold", {})
    out = []
    for ch in unicodedata.normalize("NFC", text).upper():
        if ch in letters:
            out.append(ch)
        else:
            out.append(own.get(ch) or registry["latinAscii"].get(ch) or _strip_marks(ch))
    folded = "".join(out)
    return folded if folded and all(ch in letters for ch in folded) else None


def without_accents(text: str, registry: dict | None = None) -> str:
    """The text with each Latin letter in ASCII, its case kept: «Limão» reads «Limao», «Æ» «AE»."""
    table = (registry or load())["latinAscii"]
    out = []
    for ch in unicodedata.normalize("NFC", text):
        upper = ch.upper()
        replaced = table.get(upper) if len(upper) == 1 else None
        if replaced is None:
            out.append(_strip_marks(ch))
        else:
            out.append(replaced if ch == upper else replaced.lower())
    return "".join(out)


def tag(language: str, registry: dict | None = None) -> str:
    """The BCP 47 tag with CLDR's likely region: `pt` → `pt-BR`; a tag with a region stays."""
    if "-" in language:
        return language
    region = _entry(language, registry or load())["region"]
    return f"{language}-{region}" if region else language


def tablet(language: str, registry: dict | None = None) -> str:
    return tag(language, registry).replace("-", "_")


def wikipedia(language: str, registry: dict | None = None) -> str:
    registry = registry or load()
    code = language.split("-")[0]
    exception = registry["exceptions"].get("wikipedia", {}).get(code)
    return exception["value"] if exception else code


def apertium(language: str, registry: dict | None = None) -> str:
    return _entry(language, registry or load())["alpha3"]


def label(language: str) -> str:
    return language.split("-")[0].upper()


def pair(source: str, target: str, registry: dict | None = None) -> str:
    return f"{tag(source, registry)}>{tag(target, registry)}"
