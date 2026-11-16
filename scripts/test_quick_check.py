"""Path selection of scripts/quick_check.py (#180)."""
import pathlib
import unittest

import quick_check

ROOT = pathlib.Path(__file__).resolve().parent.parent


class QuickCheckSelection(unittest.TestCase):
    def test_one_plugin_path_checks_that_plugin_only(self):
        self.assertEqual(quick_check.typecheck_dirs(ROOT, ["plugins/lookup/src/a.ts"]), ["plugins/lookup"])

    def test_packages_path_checks_packages_and_the_plugins_gates_map_it_to(self):
        folders = quick_check.typecheck_dirs(ROOT, ["packages/ink-core/src/a.ts"])
        self.assertIn("packages", folders)
        self.assertIn("plugins/ink2pic", folders)
        # Lookup imports ink-core, so it is checked (#161); Bridge does not.
        self.assertIn("plugins/lookup", folders)
        self.assertNotIn("plugins/bridge", folders)

    def test_docs_only_change_checks_nothing(self):
        self.assertEqual(quick_check.typecheck_dirs(ROOT, ["docs/product.md"]), [])


if __name__ == "__main__":
    unittest.main()
