"""Tests of site_figures.py (#437, #439): the home page follows docs/tools.json, the releases and the install guide,
says each fact once and keeps one width."""
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


class PageChecks(unittest.TestCase):
    """#439: each fact once, and one width token."""

    def test_the_committed_pages_pass(self):
        self.assertEqual(site_figures.page_problems(ROOT), [])

    def test_a_repeated_sentence_or_link_target_fails_outside_navigation(self):
        page = ('<header><a href="/">Ink Tools</a></header><nav><a href="/#tools">Tools</a></nav><main>'
                '<p>Ink Tools is unofficial. It runs no server.</p><a href="/#tools">See</a>'
                '<footer><p>Ink Tools is unofficial.</p><a href="/">Home</a></footer></main>')
        problems = site_figures.repetition_problems("x.html", page)
        self.assertEqual(len(problems), 1, problems)
        self.assertIn("«Ink Tools is unofficial.»", problems[0])
        twice = page.replace('<a href="/">Home</a>', '<a href="/#tools">Again</a>')
        self.assertTrue(any("«/#tools»" in p for p in site_figures.repetition_problems("x.html", twice)))

    def test_a_short_label_may_repeat(self):
        self.assertEqual(site_figures.repetition_problems("x.html", "<p>Version 0.1.0</p><p>Version 0.1.0</p>"), [])

    def test_only_the_container_sets_the_width_and_no_text_is_capped(self):
        good = ".container { width: var(--page-width); } .dot::before { width: 0.5em; } .shot img { width: 100%; }"
        self.assertEqual(site_figures.width_problems(good), [])
        for bad in (".section p { max-width: var(--measure-prose); }", ".page p { max-width: 70ch; }",  # #444
                    ".hero h1 { max-width: 20ch; }", ".notice { max-width: 46rem; }", ".grid { width: var(--page-width); }",
                    ".lead { width: 60ch; }"):
            with self.subTest(bad):
                self.assertTrue(site_figures.width_problems(bad))

    def test_a_section_without_its_container_fails(self):
        self.assertTrue(site_figures.section_problems("x.html", '<section><div class="narrow"><p>x</p></div></section>'))
        self.assertEqual(site_figures.section_problems("x.html", '<section><div class="container"><div></div></div></section>'), [])

    def test_a_link_to_the_home_page_stays_on_the_page(self):
        self.assertEqual(site_figures.inline("[the tools](https://inktools.martonpaulo.com/#tools)"), '<a href="#tools">the tools</a>')

    def test_every_tool_has_its_page_icon(self):
        data = json.loads((ROOT / "docs/tools.json").read_text(encoding="utf-8"))
        self.assertEqual(site_figures.icon_problems(ROOT, data), [])


if __name__ == "__main__":
    unittest.main()
