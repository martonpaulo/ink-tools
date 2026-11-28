"""The Python reader of the language registry runs the shared case table (#500)."""
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import languages  # noqa: E402

CASES = json.loads((pathlib.Path(__file__).resolve().parent.parent / "registry" / "languages" / "cases.json")
                   .read_text(encoding="utf-8"))


class Cases(unittest.TestCase):
    def test_folding(self):
        for case in CASES["fold"]:
            with self.subTest(**case):
                self.assertEqual(languages.fold(case["text"], case["language"]), case["grid"])

    def test_accents(self):
        for case in CASES["accents"]:
            with self.subTest(**case):
                self.assertEqual(languages.without_accents(case["text"]), case["plain"])

    def test_codes(self):
        for case in CASES["codes"]:
            with self.subTest(**case):
                code = case["language"]
                self.assertEqual(languages.tag(code), case["tag"])
                self.assertEqual(languages.tablet(code), case["tablet"])
                self.assertEqual(languages.wikipedia(code), case["wikipedia"])
                self.assertEqual(languages.apertium(code), case["apertium"])
                self.assertEqual(languages.label(code), case["label"])

    def test_pairs(self):
        for case in CASES["pairs"]:
            with self.subTest(**case):
                self.assertEqual(languages.pair(case["from"], case["to"]), case["id"])

    def test_a_language_outside_the_registry_is_named(self):
        with self.assertRaises(KeyError):
            languages.fold("x", "zz")


if __name__ == "__main__":
    unittest.main()
