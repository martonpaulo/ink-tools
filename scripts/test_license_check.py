"""Tests of license_check.py (#276): the project licence is CC BY-NC-SA 4.0 everywhere."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import license_check  # noqa: E402

GOOD = "Copyright (c) 2026 A\n\nThis work is licensed under CC BY-NC-SA 4.0:\n" + license_check.LINK + "\n"


def tree(files):
    root = Path(tempfile.mkdtemp())
    for name, text in files.items():
        (root / name).write_text(text, encoding="utf-8")
    return root


class LicenseCheck(unittest.TestCase):
    def test_good_tree_passes(self):
        root = tree({"LICENSE": GOOD, "AGENTS.md": "- License: `CC BY-NC-SA 4.0`\n", "README.md": "[CC BY-NC-SA 4.0](LICENSE)\n"})
        self.assertEqual(license_check.check(root), [])

    def test_mit_licence_text_fails(self):
        self.assertEqual(len(license_check.check(tree({"LICENSE": "MIT License\n"}))), 1)

    def test_mit_agents_line_fails(self):
        self.assertEqual(len(license_check.check(tree({"AGENTS.md": "- License: `MIT`\n"}))), 1)

    def test_ignored_scratch_clone_is_not_read(self):
        # A lane cloned third-party code into an ignored scratch folder (2026-11-25).
        root = tree({"LICENSE": GOOD, ".gitignore": ".scratch/\n"})
        (root / ".scratch" / "clone").mkdir(parents=True)
        (root / ".scratch" / "clone" / "LICENSE").write_text("MIT License\n", encoding="utf-8")
        subprocess.run(["git", "init", "-q", str(root)], check=True)
        self.assertEqual(license_check.check(root), [])

    def test_mit_readme_link_fails(self):
        self.assertEqual(len(license_check.check(tree({"README.md": "[MIT](LICENSE) (c)\n"}))), 1)


if __name__ == "__main__":
    unittest.main()
