"""Path selection of scripts/quick_check.py (#180)."""
import pathlib
import unittest

import quick_check

ROOT = pathlib.Path(__file__).resolve().parent.parent


class QuickCheckSelection(unittest.TestCase):
    def test_one_plugin_path_checks_that_plugin_and_the_renders_that_draw_it(self):
        # Account Sync's typecheck holds packages/ui-kit/renders/screens.tsx, which imports each
        # drawn plugin: a Lasso Actions host change once broke it unchecked (#249).
        self.assertEqual(
            quick_check.typecheck_dirs(ROOT, ["plugins/lasso-actions/src/a.ts"]),
            ["plugins/account-sync", "plugins/lasso-actions"])
        self.assertEqual(quick_check.typecheck_dirs(ROOT, ["plugins/account-sync/src/a.ts"]), ["plugins/account-sync"])

    def test_packages_path_checks_packages_and_the_plugins_gates_map_it_to(self):
        folders = quick_check.typecheck_dirs(ROOT, ["packages/ink-core/src/a.ts"])
        self.assertIn("packages", folders)
        self.assertIn("plugins/device-link", folders)
        # Lookup and Bridge import ink-core, so they are checked (#161, #301); Probe does not.
        self.assertIn("plugins/lasso-actions", folders)
        self.assertIn("plugins/account-sync", folders)
        self.assertNotIn("plugins/ink-tools-probe", folders)

    def test_docs_only_change_checks_nothing(self):
        self.assertEqual(quick_check.typecheck_dirs(ROOT, ["docs/product.md"]), [])
        self.assertEqual(quick_check.lint_dirs(ROOT, ["docs/product.md"]), [])

    def test_note_editor_path_runs_its_lint(self):
        # A line too long for SwiftLint passed the quick check and failed only the full gate (#460).
        self.assertEqual(
            quick_check.lint_dirs(ROOT, ["apps/note-editor/Sources/NoteEditor/ViewerToolbar.swift"]),
            ["apps/note-editor"])
        self.assertEqual(quick_check.lint_dirs(ROOT, ["plugins/lasso-actions/src/a.ts"]), [])


if __name__ == "__main__":
    unittest.main()
