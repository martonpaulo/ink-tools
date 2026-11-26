"""Tests of public_wording.py (#408): a forbidden term in a tracked file fails, neutral text,
untracked files and the allowlisted files pass."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import public_wording  # noqa: E402


class Hits(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)

    def tearDown(self):
        self.folder.cleanup()

    def track(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        subprocess.run(["git", "-C", str(self.root), "add", path], check=True)

    def test_neutral_text_passes(self):
        self.track("docs/device.md", "The row hides when `deleted` is NULL [observed device behaviour, 2026-11-17].\n")
        self.assertEqual(public_wording.hits(self.root), [])
        self.assertEqual(public_wording.main(["--root", str(self.root)]), 0)

    def test_each_term_fails_in_a_tracked_file(self):
        samples = ["read in the Decompiled app", "jadx output", "found by reverse engineering",
                   "reverse-engineered", "a smali patch", "apktool d", "dex2jar", "Ghidra",
                   "a sandbox bypass", "it bypasses the sandbox"]
        self.track("notes.md", "\n".join(samples) + "\n")
        found = public_wording.hits(self.root)
        self.assertEqual([line for _path, line, _text in found], list(range(1, len(samples) + 1)))
        self.assertEqual(public_wording.main(["--root", str(self.root)]), 1)

    def test_untracked_and_allowlisted_files_pass(self):
        (self.root / "scratch.md").write_text("decompiled\n", encoding="utf-8")
        for path in public_wording.ALLOWED:
            self.track(path, "TERMS = ('decompil',)\n")
        self.assertEqual(public_wording.hits(self.root), [])

    def test_a_folder_outside_git_is_a_usage_error(self):
        with tempfile.TemporaryDirectory() as plain:
            self.assertEqual(public_wording.main(["--root", plain]), 2)


if __name__ == "__main__":
    unittest.main()
