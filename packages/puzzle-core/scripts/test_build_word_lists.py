"""Tests of the word-list pipeline's rules (#381): grid letters, tokens, names, cut-offs, pins."""
import collections
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import build_word_lists as b  # noqa: E402


class Fold(unittest.TestCase):
    def test_each_language_writes_its_grid_letters(self):
        cases = [
            ("pt", "coração", "CORACAO"), ("pt", "pêssego", "PESSEGO"), ("pt", "maçã", "MACA"),
            ("fr", "été", "ETE"), ("fr", "cœur", "COEUR"), ("fr", "noël", "NOEL"),
            ("de", "müssen", "MUESSEN"), ("de", "Straße", "STRASSE"), ("de", "GROẞ", "GROSS"), ("de", "Öl", "OEL"),
            ("es", "niño", "NIÑO"), ("es", "canción", "CANCION"), ("es", "pingüino", "PINGUINO"),
            ("en", "naïve", "NAIVE"), ("en", "cat", "CAT"),
        ]
        for lang, word, folded in cases:
            with self.subTest(lang=lang, word=word):
                self.assertEqual(b.fold(word, lang), folded)

    def test_a_letter_outside_the_grid_drops_the_word(self):
        for lang, word in [("en", "co-op"), ("pt", "x1"), ("de", "a"), ("en", "日本")]:
            with self.subTest(word=word):
                self.assertIsNone(b.fold(word, lang))

    def test_n_with_tilde_folds_outside_spanish(self):
        self.assertEqual(b.fold("niño", "pt"), "NINO")


class Tokens(unittest.TestCase):
    def test_contractions_are_left_out_and_french_elisions_split(self):
        self.assertEqual(b.tokens("Don't stop, Tom!", "en"), ["stop", "Tom"])
        self.assertEqual(b.tokens("L'homme qu'il aime.", "fr"), ["homme", "il", "aime"])
        self.assertEqual(b.tokens("Qu’ est-ce", "fr"), ["est", "ce"])


class Counting(unittest.TestCase):
    def test_a_name_is_capitalised_inside_sentences(self):
        sentences = ["I saw Tom.", "Tom is here.", "Is Tom there?", "The rose is red.", "A rose grows.", "Rose is a name too, Rose said."]
        counts = b.count_words(sentences, "en")
        names = b.proper_nouns(counts[1], counts[2])
        self.assertIn("tom", names)
        self.assertNotIn("rose", names, "most of its inner uses are lower case, so it stays a word")

    def test_rare_words_names_and_bad_words_are_dropped_and_ties_keep_letter_order(self):
        counts = (collections.Counter({"casa": 9, "água": 9, "agua": 1, "xyz": 2, "tom": 50, "merda": 9}), None, None)
        ranked = b.word_list("pt", counts, {"tom"}, {"MERDA"}, None)
        self.assertEqual(ranked, [("AGUA", 10), ("CASA", 9)])

    def test_the_cap_never_splits_a_tie(self):
        saved = b.MAX_WORDS
        b.MAX_WORDS = 2
        try:
            counts = (collections.Counter({"aa": 9, "bb": 5, "cc": 5, "dd": 5}), None, None)
            self.assertEqual(b.word_list("en", counts, set(), set(), None), [("AA", 9)])
        finally:
            b.MAX_WORDS = saved

    def test_scores_fall_with_rank(self):
        scores = [b.score(rank, 1000) for rank in (1, 10, 100, 1000)]
        self.assertEqual(scores[0], 100)
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertGreaterEqual(scores[-1], 1)


class Themes(unittest.TestCase):
    def test_spanish_gets_its_enye_back_only_where_the_list_knows_it(self):
        known = {"NIÑO", "AÑO", "MANO"}
        self.assertEqual(b.restore_enye("NINO", known), "NIÑO")
        self.assertEqual(b.restore_enye("MANO", known), "MANO")
        self.assertEqual(b.restore_enye("LEON", known), "LEON")

    def test_superfun_banks_read_per_tier(self):
        source = b"""var THEMES = {
  easy: [
    T(['Animals', 'Tiere', 'Animaux', 'Animales', 'Animali'],
      ['CAT', 'DOG'], ['KATZE'], ['CHAT'], ['GATO'], ['GATTO']),
  ],
  hard: [
    T(['Space', 'Weltraum', 'Espace', 'Espacio', 'Spazio'], ['STAR'], ['STERN'], ['ETOILE'], ['ESTRELLA'], ['STELLA']),
  ],
};"""
        themes = b.superfun_themes(source)
        self.assertEqual([(t["tier"], t["names"]["en"], t["words"]["de"]) for t in themes],
                         [("easy", "Animals", ["KATZE"]), ("hard", "Space", ["STERN"])])


class Pins(unittest.TestCase):
    def test_a_changed_download_stops_the_build_and_names_it(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = pathlib.Path(folder)
            (cache / "demo").write_bytes(b"new bytes")
            source = {"url": "https://example.invalid/demo", "sha256": "0" * 64}
            with self.assertRaises(SystemExit) as raised:
                b.fetch("demo", source, cache, refresh=False)
            self.assertIn("demo", str(raised.exception))

    def test_a_refresh_records_a_new_snapshot(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = pathlib.Path(folder)
            (cache / "demo").write_bytes(b"new bytes")
            source = {"url": "https://example.invalid/demo", "sha256": "0" * 64, "snapshot": True}
            # A refresh downloads again; this test serves the cached bytes in its place.
            original = b.urllib.request.urlopen
            b.urllib.request.urlopen = lambda *a, **k: _Bytes(b"new bytes")
            try:
                b.fetch("demo", source, cache, refresh=True)
            finally:
                b.urllib.request.urlopen = original
            self.assertEqual(source["sha256"], b.sha256(b"new bytes"))

    def test_every_list_names_only_recorded_sources(self):
        manifest = json.loads(b.MANIFEST.read_text(encoding="utf-8"))
        for lang in b.LANGUAGES:
            data = json.loads((b.WORDS / f"{lang}.json").read_text(encoding="utf-8"))
            with self.subTest(lang=lang):
                self.assertTrue(set(data["sources"]) <= set(manifest["sources"]))


class _Bytes:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.data


if __name__ == "__main__":
    unittest.main()
