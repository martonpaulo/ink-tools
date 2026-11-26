"""Tests of site_figures.py (#437): the home page follows docs/tools.json, the releases and the install guide."""
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_figures  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INPUTS = ("AGENTS.md", "README.md", "docs/tools.json", "docs/releases.json", "docs/install.md",
          "design/site-media/shots.json", "site/index.html")


def release(tag, prerelease=True, files=("X.snplg",), draft=False):
    return {"tag_name": tag, "prerelease": prerelease, "draft": draft, "assets": [{"name": f} for f in files]}


class PickReleases(unittest.TestCase):
    def test_stable_wins_over_a_newer_beta(self):
        rows = [release("a-v0.2.0-beta.1"), release("a-v0.1.0", prerelease=False), release("a-v0.1.0-beta.9")]
        self.assertEqual(site_figures.pick_releases(rows, ["a"])["a"]["tag"], "a-v0.1.0")

    def test_newest_beta_without_a_stable_and_never_a_dev_or_draft(self):
        rows = [release("a-v0.2.0-dev.3"), release("a-v0.2.0-beta.4", draft=True), release("a-v0.2.0-beta.3"),
                release("a-v0.2.0-beta.2")]
        row = site_figures.pick_releases(rows, ["a"])["a"]
        self.assertEqual((row["tag"], row["stable"]), ("a-v0.2.0-beta.3", False))

    def test_no_row_without_a_release_file(self):
        self.assertEqual(site_figures.pick_releases([release("a-v1.0.0", False, ("notes.txt",))], ["a"]), {})


class Page(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        for rel in INPUTS:
            (self.tmp / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(ROOT / rel, self.tmp / rel)

    def test_the_committed_page_is_a_fresh_generation(self):
        self.assertEqual(site_figures.generate(self.tmp), (ROOT / "site/index.html").read_text(encoding="utf-8"))

    def test_a_status_change_reaches_the_page(self):
        data = json.loads((self.tmp / "docs/tools.json").read_text(encoding="utf-8"))
        data["tools"][0]["status"] = "Planned"
        (self.tmp / "docs/tools.json").write_text(json.dumps(data), encoding="utf-8")
        page = site_figures.generate(self.tmp)
        self.assertIn('<span class="badge status-planned">Planned</span>', page)

    def test_media_written_by_site_media_survives_and_is_stable(self):
        page = self.tmp / "site/index.html"
        text = page.read_text(encoding="utf-8")
        marker = "<!-- /media:smart-pen -->"
        indent = text[:text.index(marker)].rsplit("\n", 1)[1]
        page.write_text(text.replace(indent + marker, f"{indent}  <figure>shot</figure>\n{indent}{marker}"), encoding="utf-8")
        once = site_figures.generate(self.tmp)
        self.assertIn(f"{indent}  <figure>shot</figure>\n", once)
        page.write_text(once, encoding="utf-8")
        self.assertEqual(site_figures.generate(self.tmp), once)

    def test_an_internal_tool_offers_no_download(self):
        page = site_figures.generate(self.tmp)
        self.assertNotIn("ink-tools-helper-v", page)
        self.assertIn("releases/download/smart-pen-v0.1.0/SmartPen-0.1.0.snplg", page)


if __name__ == "__main__":
    unittest.main()
