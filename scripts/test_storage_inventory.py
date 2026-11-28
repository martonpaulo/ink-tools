"""Tests of storage_inventory.py over fixture trees (#485)."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import storage_inventory  # noqa: E402


class StorageInventory(unittest.TestCase):
    def tree(self, files):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for rel, text in files.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8")
            return storage_inventory.findings(root)

    def test_a_listed_store_passes(self):
        self.assertEqual(self.tree({
            "docs/storage.md": "| Puzzles pages | `plugins/a/src/pages.ts` |\n",
            "plugins/a/src/pages.ts": "export const PAGES = `${pluginDataFolder('inktools-a')}/pages`;\n",
            "plugins/a/src/view.ts": "export const view = 1;\n",
            "plugins/a/__tests__/pages.test.ts": "writeText('/tmp/x', 'y');\n",
            "plugins/a/src/note.ts": "// writeText( in a comment stores nothing\n",
        }), [])

    def test_a_new_store_fails_until_listed(self):
        self.assertEqual(self.tree({
            "docs/storage.md": "| none |\n",
            "plugins/a/native/Cache.java": "OutputStream out = new FileOutputStream(file);\n",
            "apps/b/Sources/B/Folders.swift": "let url = files.url(for: .applicationSupportDirectory, in: .userDomainMask)\n",
            "cli/c/src/c": "#!/usr/bin/env python3\nHISTORY = Path.home() / '.cache/inkctl/history.jsonl'\n",
        }), [
            ("apps/b/Sources/B/Folders.swift", "stores data but docs/storage.md does not list it; add its row (#485)"),
            ("cli/c/src/c", "stores data but docs/storage.md does not list it; add its row (#485)"),
            ("plugins/a/native/Cache.java", "stores data but docs/storage.md does not list it; add its row (#485)"),
        ])

    def test_no_inventory_fails(self):
        self.assertEqual(self.tree({}), [("docs/storage.md", "the storage inventory is missing")])


if __name__ == "__main__":
    unittest.main()
