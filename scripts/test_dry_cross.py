"""Tests of dry_cross.py over fixture trees (#295): each guard fails once and passes once."""
import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import dry_check  # noqa: E402
import dry_cross  # noqa: E402


class Tree(unittest.TestCase):
    def run_on(self, files, data, *mode):
        """Runs dry_cross over a plain fixture tree (no `.git`, so it walks); returns (exit, output, data)."""
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for rel, text in {**files, "dry-check.json": json.dumps(data)}.items():
                (root / rel).parent.mkdir(parents=True, exist_ok=True)
                (root / rel).write_text(text, encoding="utf-8")
            out, err = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                status = dry_cross.main(["--root", str(root), *mode])
            return status, out.getvalue() + err.getvalue(), json.loads((root / "dry-check.json").read_text())


JAVA = 'class A {\n  static final int LIMIT = 4096;\n  void f() { wait(1500); open("/opt/x/y"); }\n}\n'
SWIFT = 'struct B {\n  static let limit = 4096\n  func f() { wait(1500) }\n}\n'


class Languages(Tree):
    def test_java_and_swift_values_with_no_name_are_found(self):
        dry_cross.register()
        found = dry_check.magic_findings({"a/A.java": ("java", JAVA), "b/B.swift": ("swift", SWIFT)})
        self.assertEqual(sorted((f.path, f.line, f.kind, f.value) for f in found), [
            ("a/A.java", 3, "number", "1500"), ("a/A.java", 3, "path", "/opt/x/y"), ("b/B.swift", 3, "number", "1500"),
        ])

    def test_a_new_java_value_fails_the_ratchet_and_a_recorded_one_passes(self):
        data = {"crossTool": {"languages": {}}}
        status, out, _ = self.run_on({"a/A.java": JAVA}, data)
        self.assertEqual(status, 1, out)
        self.assertIn("a/A.java:3: number 1500", out)
        status, out, recorded = self.run_on({"a/A.java": JAVA}, data, "--init")
        self.assertEqual(recorded["crossTool"]["languages"]["counts"], {"a/A.java": {"number": 1, "path": 1}})
        self.assertEqual(self.run_on({"a/A.java": JAVA}, recorded)[0], 0)

    def test_a_listed_suffix_with_no_reader_warns(self):
        self.assertEqual(dry_cross.unreadable_suffixes({".swift": "swift", ".py": "python"}, {"python": None}),
                         [(".swift", "swift")])
        dry_cross.register()
        self.assertEqual(dry_cross.unreadable_suffixes(), [])


class Constants(Tree):
    FILES = {
        "plugins/a/src/size.ts": "export const PAGE_WIDTH = 1920;\n",
        "cli/b/src/b.py": "PAGE_WIDTH = 1920  # the page\n",
        "plugins/a/src/other.ts": "export const SAME_TOOL = 4096;\n",
        "plugins/a/src/again.ts": "export const ALSO_SAME_TOOL = 4096;\n",
    }

    def test_one_value_named_in_two_tools_fails(self):
        status, out, _ = self.run_on(self.FILES, {"crossTool": {"constants": {}}})
        self.assertEqual(status, 1, out)
        self.assertIn("cli/b/src/b.py:1: PAGE_WIDTH = 1920", out)
        self.assertIn("plugins/a/src/size.ts:1:", out)
        self.assertNotIn("4096", out)  # one tool may name its own value twice; the copy's checks own that

    def test_a_twins_row_naming_its_owner_passes(self):
        row = {"rule": "page width", "owner": "plugins/a/src/size.ts", "other": "cli/b/src/b.py",
               "pattern": r"PAGE_WIDTH = 1920", "golden": "", "open": 295}
        status, out, _ = self.run_on(self.FILES, {"crossTool": {"constants": {}}, "twins": {"rules": [row]}})
        self.assertEqual(status, 0, out)

    def test_java_swift_and_shell_constants_are_read(self):
        found = dry_cross.cross_tool([
            *self.parse("apps/x/C.java", "java", "  public static final String ROOT = \"/storage/emulated/0\";"),
            *self.parse("apps/y/D.swift", "swift", "  public static let root = \"/storage/emulated/0\""),
            *self.parse("plugins/z/run.sh", "shell", "readonly ROOT='/storage/emulated/0'"),
        ], [])
        self.assertEqual([c.tool for c in found], ["apps/x", "apps/y", "plugins/z"])

    def parse(self, path, lang, line):
        match = dry_cross.CONSTANT_LINE[lang].match(line)
        self.assertTrue(match, f"{lang} line not read: {line}")
        return [dry_cross.Constant(path, 1, dry_cross.tool(path), dry_cross.literal_value(match.group("value")), line.strip())]

    def test_plain_values_are_not_contracts(self):
        for token in ("3", "60", "1000", "0.5", "'ok'"):
            self.assertIsNone(dry_cross.literal_value(token), token)
        for token in ("1920", "0.55", "'settings.json'", "6400L"):
            self.assertIsNotNone(dry_cross.literal_value(token), token)


if __name__ == "__main__":
    unittest.main()
