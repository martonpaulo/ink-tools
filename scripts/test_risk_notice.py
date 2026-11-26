"""Tests of risk_notice.py (#373): every target carries the one notice, and a dropped one fails."""
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import risk_notice  # noqa: E402

NOTICE = "**Unofficial.** Not made by the vendor.\n\nSee [the watch](https://example.org/w) &\nkeep a backup.\n"
EMPTY = f"{risk_notice.START}\nold\n{risk_notice.END}"


class Notice(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        (self.root / "docs").mkdir()
        (self.root / "site").mkdir()
        (self.root / risk_notice.SOURCE).write_text(NOTICE)
        for name in risk_notice.TARGETS:
            (self.root / name).write_text(f"Before.\n\n{EMPTY}\n\nAfter.\n")

    def run_quietly(self, write=False):
        with redirect_stdout(StringIO()) as out:
            code = risk_notice.run(self.root, write)
        return code, out.getvalue()

    def test_write_then_check_passes(self):
        self.assertEqual(self.run_quietly(write=True)[0], 0)
        self.assertEqual(self.run_quietly(), (0, ""))
        readme = (self.root / "README.md").read_text()
        self.assertTrue(readme.startswith("Before.") and readme.endswith("After.\n"))

    def test_every_target_gets_the_same_paragraphs(self):
        self.run_quietly(write=True)
        for name in risk_notice.TARGETS:
            text = (self.root / name).read_text()
            self.assertIn("<p><strong>Unofficial.</strong> Not made by the vendor.</p>", text)
            self.assertIn('<p>See <a href="https://example.org/w" target="_blank" rel="noopener">the watch</a>'
                          ' &amp; keep a backup.</p>', text)

    def test_a_dropped_block_fails(self):
        self.run_quietly(write=True)
        (self.root / "docs/install.md").write_text("No notice here.\n")
        code, out = self.run_quietly()
        self.assertEqual(code, 1)
        self.assertIn("docs/install.md: needs exactly one risk-notice block, found 0", out)

    def test_an_edited_block_fails(self):
        self.run_quietly(write=True)
        readme = self.root / "README.md"
        readme.write_text(readme.read_text().replace("keep a backup", "relax"))
        code, out = self.run_quietly()
        self.assertEqual(code, 1)
        self.assertIn("README.md: the risk notice differs", out)


if __name__ == "__main__":
    unittest.main()
