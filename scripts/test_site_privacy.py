"""Tests for site_privacy.py over fixture repositories (#371)."""
from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import site_privacy  # noqa: E402

PRIVACY_PAGE = '<h1>Privacy policy</h1>\n<h2 id="sync">Sync Tool</h2>\n<p>Sends to a service.</p>\n'


class SitePrivacyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.plugin("sync", "Sync Tool", ["plugin.permission.INTERNET", "plugin.permission.FILE:READ"])
        self.plugin("pen", "Pen Tool", ["plugin.permission.FILE:READ"])
        self.write(site_privacy.PERMISSIONS, "export const PERMISSION_INTERNET = 'plugin.permission.INTERNET';\n")
        self.write("site/index.html", "<h1>Home</h1>")
        self.write("site/privacy/index.html", PRIVACY_PAGE)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write(self, path: str, text: str) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def plugin(self, folder: str, name: str, permissions: list[str]) -> None:
        self.write(f"plugins/{folder}/PluginConfig.json", json.dumps({"name": name, "uses-permissions": permissions}))

    def test_complete_site_passes(self) -> None:
        self.assertEqual(site_privacy.check(self.root), [])

    def test_missing_privacy_page_fails(self) -> None:
        (self.root / "site/privacy/index.html").unlink()
        self.assertEqual(site_privacy.check(self.root), ["site/privacy/index.html"])
        self.assertEqual(site_privacy.main(["--root", str(self.root)]), 1)

    def test_missing_home_page_fails(self) -> None:
        (self.root / "site/index.html").unlink()
        self.assertEqual(site_privacy.check(self.root), ["site/index.html"])

    def test_networked_plugin_without_section_fails(self) -> None:
        self.plugin("transfer", "Transfer Tool", ["plugin.permission.INTERNET"])
        self.assertEqual(site_privacy.check(self.root), ['site/privacy/index.html: <h2 id="transfer">Transfer Tool</h2>'])

    def test_section_with_another_name_fails(self) -> None:
        self.write("site/privacy/index.html", PRIVACY_PAGE.replace("Sync Tool", "Old Name"))
        self.assertEqual(len(site_privacy.check(self.root)), 1)

    def test_plugin_without_network_needs_no_section(self) -> None:
        self.assertNotIn("pen", "".join(site_privacy.check(self.root)))

    def test_unreadable_permission_name_fails_loudly(self) -> None:
        self.write(site_privacy.PERMISSIONS, "export {};\n")
        with self.assertRaises(ValueError):
            site_privacy.check(self.root)

    def test_repository_site_passes(self) -> None:
        root = pathlib.Path(__file__).resolve().parent.parent
        self.assertEqual(site_privacy.check(root), [])


if __name__ == "__main__":
    unittest.main()
