"""Tests of the generic pack pipeline (#484) over small synthetic extracts: CLDR letters and
folding, Tatoeba counts, wiktextract tags, and the hashed pack with its manifest. The language is
a synthetic code, so no test or file names a real language."""
import bz2
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_pack as p  # noqa: E402

CODE = "zz"
CHARACTERS = {"main": {CODE: {"characters": {
    "exemplarCharacters": "[a b c d e f g h i j k l m n ñ o p q r s t u v w x y z]",
    "index": "[A B C D E F G H I J K L M N Ñ O P Q R S T U V W X Y Z]",
}}}}
OWN_TRANSFORM = """
# a language's own rules, in CLDR's form
$AE = [Ä {A\\u0308}];
[ä {a\\u0308}] → ae;
{$AE} [:Lowercase:] → Ae;
$AE → AE;
::Latin-ASCII;
"""
LATIN_ASCII = """
:: [[:Latin:][:Common:][:Inherited:][〇]] ;
:: NFD() ;
[[:Latin:][0-9]] { [:Mn:]+ → ; # maps to nothing
Æ → AE ; # 00C6
ß → ss ; # 00DF
œ → oe ; # 0153
ŉ → \\'n ; # 0149
"""
SENTENCES = [
    "Tavo kesa mira.", "Tavo kesa lumo.", "Tavo mira lumo.", "Kesa tavo.",
    "Rolf ama Tavo.", "Rolf vino.", "Rolf vino kesa.",
    "Bruk tavo.", "Bruk kesa.", "Bruk mira.",
    "L'ömi tavo.", "L'ömi kesa.", "L'ömi lumo.",
    "Niña mira.", "Niña kesa.", "Niña tavo.",
    "Zork9 mira.", "Æble tavo.", "Æble kesa.", "Æble mira.",
]
ENTRIES = [
    {"word": "tavo", "pos": "noun", "senses": [{"glosses": ["a house"]}]},
    {"word": "kesa", "pos": "verb", "senses": [{"glosses": ["to walk"]}]},
    {"word": "mira", "pos": "adj", "senses": [{"glosses": ["bright"]}]},
    {"word": "lumo", "pos": "noun", "senses": [{"glosses": []}, {"glosses": ["light"]}]},
    {"word": "rolf", "pos": "name", "senses": [{"glosses": ["a given name"]}]},
    {"word": "bruk", "pos": "noun", "senses": [{"glosses": ["a rude word"], "tags": ["vulgar"]}]},
    {"word": "ömi", "pos": "noun", "senses": [{"glosses": ["a river"]}]},
    {"word": "niña", "pos": "noun", "senses": [{"glosses": ["a girl"]}]},
    {"word": "æble", "pos": "noun", "senses": [{"glosses": ["an apple"]}]},
]


def tree(root: pathlib.Path, own_transform: bool = True) -> dict[str, pathlib.Path]:
    cldr = root / "cldr"
    (cldr / "main" / CODE).mkdir(parents=True)
    (cldr / "main" / CODE / "characters.json").write_text(json.dumps(CHARACTERS), encoding="utf-8")
    (cldr / "transforms").mkdir()
    if own_transform:
        (cldr / "transforms" / f"{CODE}-ASCII.txt").write_text(OWN_TRANSFORM, encoding="utf-8")
    (cldr / "transforms" / "Latin-ASCII.txt").write_text(LATIN_ASCII, encoding="utf-8")
    tatoeba = root / f"{CODE}_sentences.tsv.bz2"
    lines = "".join(f"{n}\t{CODE}\t{text}\n" for n, text in enumerate(SENTENCES, 1))
    tatoeba.write_bytes(bz2.compress(lines.encode("utf-8")))
    wiktextract = root / f"{CODE}.jsonl"
    wiktextract.write_text("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in ENTRIES) + "\n",
                           encoding="utf-8")
    return {"cldr": cldr, "tatoeba": tatoeba, "wiktextract": wiktextract}


class Cldr(unittest.TestCase):
    def test_folding_keeps_the_alphabet_and_takes_the_own_transform_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            known = p.facts(tree(pathlib.Path(tmp))["cldr"], CODE)
        self.assertIn("Ñ", known["languages"][CODE]["letters"])
        cases = [("niña", "NIÑA"), ("ömi", "OMI"), ("ärl", "AERL"), ("æble", "AEBLE"), ("straße", "STRASSE"),
                 ("cœur", "COEUR"), ("café", "CAFE")]
        for word, folded in cases:
            with self.subTest(word=word):
                self.assertEqual(p.fold(word, CODE, known), folded)
        for word in ["a", "x1", "日本", "co-op"]:
            with self.subTest(word=word):
                self.assertIsNone(p.fold(word, CODE, known))

    def test_without_an_own_transform_latin_ascii_and_the_marks_decide(self):
        with tempfile.TemporaryDirectory() as tmp:
            known = p.facts(tree(pathlib.Path(tmp), own_transform=False)["cldr"], CODE)
        self.assertEqual(p.fold("ärl", CODE, known), "ARL")


class Pack(unittest.TestCase):
    def build(self) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            paths = tree(pathlib.Path(tmp))
            return p.build(CODE, paths["cldr"], paths["tatoeba"], paths["wiktextract"])

    def test_words_come_most_frequent_first_and_only_when_wiktionary_has_them(self):
        pack = self.build()
        self.assertEqual(pack["words"][:3], ["TAVO", "KESA", "MIRA"])
        self.assertNotIn("VINO", pack["words"])  # Tatoeba has it, Wiktionary does not
        self.assertNotIn("ZORK", pack["words"])
        self.assertEqual(len(pack["scores"]), len(pack["words"]))
        self.assertEqual(pack["scores"][0], 100)

    def test_a_proper_noun_and_a_vulgar_word_are_dropped_by_their_tags(self):
        pack = self.build()
        self.assertNotIn("ROLF", pack["words"])
        self.assertNotIn("BRUK", pack["words"])
        self.assertEqual(pack["avoid"], ["BRUK"])

    def test_an_elision_counts_the_word_after_the_apostrophe(self):
        self.assertIn("OMI", self.build()["words"])

    def test_a_word_below_the_sentence_floor_is_left_out(self):
        self.assertNotIn("AMA", self.build()["words"])

    def test_letters_of_the_alphabet_stay_and_others_fold(self):
        words = self.build()["words"]
        self.assertIn("NIÑA", words)
        self.assertIn("AEBLE", words)

    def test_the_clue_is_the_first_gloss_of_the_first_sense_with_one(self):
        clues = self.build()["clues"]
        self.assertEqual(clues["TAVO"], "a house")
        self.assertEqual(clues["LUMO"], "light")
        self.assertNotIn("ROLF", clues)

    def test_the_pack_and_its_manifest_name_each_source_hash_and_licence(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            paths = tree(root)
            out = root / "out"
            p.main(["--language", CODE, "--cldr", str(paths["cldr"]), "--tatoeba", str(paths["tatoeba"]),
                    "--wiktextract", str(paths["wiktextract"]), "--out", str(out), "--version", "2026.11.28"])
            manifest = json.loads((out / f"{CODE}-2026.11.28.manifest.json").read_text(encoding="utf-8"))
            body = (out / manifest["file"]).read_bytes()
        self.assertEqual(manifest["sha256"], hashlib.sha256(body).hexdigest())
        self.assertEqual(manifest["bytes"], len(body))
        self.assertEqual(json.loads(body)["version"], "2026.11.28")
        self.assertEqual(manifest["licences"], ["CC-BY-2.0-FR", "CC-BY-SA-4.0", "Unicode-3.0"])
        self.assertEqual({s["source"] for s in manifest["sources"]}, {"cldr", "tatoeba", "wiktextract"})
        self.assertEqual(len([s for s in manifest["sources"] if s["source"] == "cldr"]), 3)

    def test_the_same_inputs_build_the_same_pack(self):
        self.assertEqual(self.build(), self.build())


if __name__ == "__main__":
    unittest.main()
