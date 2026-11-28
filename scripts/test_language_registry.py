"""The language registry's generator (#500): CLDR's formats, the generation over small fixture
packages, and the check that fails on a committed file that differs from a fresh generation."""
import hashlib
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import language_registry as r  # noqa: E402

OWN = """
$AE = [Ä {A\\u0308}];
[ä {a\\u0308}] → ae;
{$AE} [:Lowercase:] → Ae;
$AE → AE;
::Latin-ASCII;
"""
LATIN = """
:: NFD() ;
[[:Latin:][0-9]] { [:Mn:]+ → ; # maps to nothing
Æ → AE ; # 00C6
æ → ae ; # 00E6
ß → ss ; # 00DF
ŉ → \\'n ; # 0149
"""


def package(files: dict[str, object]) -> bytes:
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode="w:gz") as tar:
        for name, body in files.items():
            data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
            info = tarfile.TarInfo(f"package/{name}")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return out.getvalue()


PACKAGES = {
    "cldr-core": package({
        "coverageLevels.json": {"coverageLevels": {"xa": "modern", "xb": "basic", "xa-XY": "modern", "xc": "basic"}},
        "supplemental/likelySubtags.json": {"supplemental": {"likelySubtags": {"xa": "xa-Latn-XY", "xb": "xb-Cyrl"}}},
        "supplemental/aliases.json": {"supplemental": {"metadata": {"alias": {"languageAlias": {
            "xaa": {"_reason": "overlong", "_replacement": "xa"},
            "xab": {"_reason": "legacy", "_replacement": "xa"}}}}}},
    }),
    "cldr-misc-full": package({
        "main/xa/characters.json": {"main": {"xa": {"characters": {"index": "[A B Ñ]"}}}},
        "main/xb/characters.json": {"main": {"xb": {"characters": {}}}},
    }),
    "cldr-transforms": package({
        "transforms/Latin-ASCII.txt": LATIN.encode("utf-8"),
        "transforms/xa-ASCII.txt": OWN.encode("utf-8"),
    }),
}


def root_with(cache: pathlib.Path) -> pathlib.Path:
    root = cache / "root"
    (root / r.FOLDER).mkdir(parents=True)
    pins = {}
    for name, data in PACKAGES.items():
        (cache / f"{name}.tgz").write_bytes(data)
        pins[name] = {"url": f"https://example.invalid/{name}.tgz", "sha256": hashlib.sha256(data).hexdigest()}
    (root / r.SOURCES).write_text(json.dumps({"cldr": "0.1", "packages": pins}), encoding="utf-8")
    (root / r.EXCEPTIONS).write_text(json.dumps({"about": "x", "wikipedia": {"xa": {"value": "xa-old", "source": "s"}}}),
                                     encoding="utf-8")
    return root


class Formats(unittest.TestCase):
    def test_an_exemplar_set_reads_letters_and_strings(self):
        self.assertEqual(r.unicode_set("[a b {ch} ñ]"), ["a", "b", "ch", "ñ"])

    def test_the_plain_rules_of_a_transform_are_read_and_context_rules_skipped(self):
        rules = r.transform_rules(OWN)
        self.assertEqual(rules["ä"], "ae")
        self.assertEqual(rules["Ä"], "AE")
        self.assertEqual(len(rules), 2)  # ä and Ä, each also written as a base and U+0308; no context rule
        self.assertEqual(r.transform_rules(LATIN)["ŉ"], "n")

    def test_the_table_is_upper_case_single_letters(self):
        self.assertEqual(r.upper_table(r.transform_rules(LATIN)), {"Æ": "AE"})  # ß and ŉ grow when upper-cased, which folds them


class Generation(unittest.TestCase):
    def generated(self) -> dict:
        files = {name: self._files(data) for name, data in PACKAGES.items()}
        return r.generate(files["cldr-core"], files["cldr-misc-full"], files["cldr-transforms"], "0.1",
                          {"about": "x", "apertium": []})

    @staticmethod
    def _files(data: bytes) -> dict[str, bytes]:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            return {m.name[len("package/"):]: tar.extractfile(m).read() for m in tar.getmembers()}

    def test_each_covered_base_language_gets_its_codes_letters_and_own_folding(self):
        languages = self.generated()["languages"]
        self.assertEqual(sorted(languages), ["xa", "xb"])  # no region, and xc has no characters
        self.assertEqual(languages["xa"], {"alpha3": "xaa", "script": "Latn", "region": "XY",
                                           "letters": ["A", "B", "Ñ"], "fold": {"Ä": "AE"}})
        self.assertEqual(languages["xb"], {"alpha3": "xb", "script": "Cyrl", "region": None, "letters": []})

    def test_the_exceptions_are_copied_without_their_note(self):
        self.assertEqual(self.generated()["exceptions"], {"apertium": []})


class Check(unittest.TestCase):
    def test_a_fresh_file_passes_and_a_hand_edit_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = pathlib.Path(tmp)
            root = root_with(cache)
            args = ["--root", str(root), "--cache", str(cache)]
            self.assertEqual(r.main(args), 1)  # nothing committed yet
            self.assertEqual(r.main([*args, "--write"]), 0)
            self.assertEqual(r.main(args), 0)
            output = root / r.OUTPUT
            output.write_text(output.read_text(encoding="utf-8").replace('"XY"', '"XZ"'), encoding="utf-8")
            self.assertEqual(r.main(args), 1)

    def test_a_package_whose_hash_is_not_the_pin_stops_the_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = pathlib.Path(tmp)
            root = root_with(cache)
            (cache / "cldr-core.tgz").write_bytes(b"changed")
            with self.assertRaises(SystemExit):
                r.main(["--root", str(root), "--cache", str(cache)])


if __name__ == "__main__":
    unittest.main()
