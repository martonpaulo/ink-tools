"""Tests of case_check.py (#227): each kind of pair fails once, an ordinary tree passes."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_check  # noqa: E402


class Collisions(unittest.TestCase):
    def test_an_ordinary_tree_passes(self):
        self.assertEqual(case_check.collisions([
            "src/EditorView.tsx", "src/editor.ts", "src/a.ts", "src/a.test.ts", "src/b.ts", "src/c.d.ts", "src/c.json", "README.md",
        ]), [])

    def test_files_equal_once_lowercased_fail(self):
        self.assertEqual(case_check.collisions(["docs/Notes.md", "docs/notes.md"]),
                         [("path", "docs/Notes.md", "docs/notes.md")])

    def test_folders_equal_once_lowercased_fail(self):
        self.assertEqual(case_check.collisions(["Docs/a.md", "docs/b.md"]), [("path", "Docs", "docs")])

    def test_modules_an_import_cannot_tell_apart_fail(self):
        """#226: `./src/Editor` resolved to editor.ts on the owner's Mac."""
        self.assertEqual(case_check.collisions(["src/Editor.tsx", "src/editor.ts"]),
                         [("module", "src/Editor.tsx", "src/editor.ts")])

    def test_a_json_file_beside_a_module_of_its_name_fails(self):
        """#586: Metro took `./protocol` for protocol.json while Jest took protocol.ts."""
        self.assertEqual(case_check.collisions(["plugins/device-link/src/localsend/protocol.json",
                                                 "plugins/device-link/src/localsend/protocol.ts"]),
                         [("module", "plugins/device-link/src/localsend/protocol.json",
                           "plugins/device-link/src/localsend/protocol.ts")])

    def test_modules_of_one_name_and_two_extensions_fail(self):
        self.assertEqual(case_check.collisions(["src/b.ts", "src/b.tsx"]),
                         [("module", "src/b.ts", "src/b.tsx")])

    def test_a_json_file_of_another_case_passes(self):
        self.assertEqual(case_check.collisions(["plugins/x/App.tsx", "plugins/x/app.json"]), [])

    def test_the_same_name_in_two_folders_passes(self):
        self.assertEqual(case_check.collisions(["a/protocol.json", "b/protocol.ts"]), [])

    def test_reads_only_tracked_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "Editor.tsx").write_text("", encoding="utf-8")
            (root / "editor.ts").write_text("", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "Editor.tsx"], check=True)
            self.assertEqual(case_check.main(["--root", str(root)]), 0)
            subprocess.run(["git", "-C", str(root), "add", "editor.ts"], check=True)
            self.assertEqual(case_check.main(["--root", str(root)]), 1)


if __name__ == "__main__":
    unittest.main()
