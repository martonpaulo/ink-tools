"""Tests of site_figures.py (#437, #439, #443): the home page follows docs/tools.json, the releases and the install guide,
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
INPUTS = ("AGENTS.md", "README.md", "docs/tools.json", "docs/tool-facts.json", "docs/releases.json", "docs/install.md",
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
        shutil.copytree(ROOT / "registry/items", self.tmp / "registry/items")

    def test_the_committed_page_is_a_fresh_generation(self):
        self.assertEqual(site_figures.generate(self.tmp), (ROOT / "site/index.html").read_text(encoding="utf-8"))

    def test_a_status_change_reaches_the_page(self):
        data = json.loads((self.tmp / "docs/tools.json").read_text(encoding="utf-8"))
        data["tools"][0]["status"] = "Planned"
        (self.tmp / "docs/tools.json").write_text(json.dumps(data), encoding="utf-8")
        page = site_figures.generate(self.tmp)
        self.assertIn('<span class="badge status-planned">Planned</span>', page)

    def test_a_regression_issue_turns_a_released_tool_broken_with_its_reason(self):
        # #436: the README showed Broken with its reason and issue; the page kept the typed status.
        facts = self.tmp / "docs/tool-facts.json"
        data = json.loads(facts.read_text(encoding="utf-8"))
        data["regressions"] = [{"tool": "Smart Pen", "title": "Pen draws nothing", "number": 901}]
        facts.write_text(json.dumps(data), encoding="utf-8")
        page = site_figures.generate(self.tmp)
        card = page[page.index("<h3>Smart Pen</h3>") - 400:page.index("<h3>Smart Pen</h3>") + 2000]
        self.assertIn('<span class="badge status-broken">Broken</span>', card)
        self.assertIn('Pen draws nothing (<a href="https://github.com/martonpaulo/ink-tools/issues/901"', card)

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


class Layout(unittest.TestCase):
    """#443: a lone last card spans its row, boxes keep one padding and no title margin, the hero counts."""

    def test_a_lone_last_card_is_marked_for_each_column_count(self):
        expected = {1: {0: "lone-3 lone-2"}, 2: {}, 3: {2: "lone-2"}, 4: {3: "lone-3"}}
        for count, marks in expected.items():
            with self.subTest(count=count):
                self.assertEqual(site_figures.lone_classes(count), marks)

    def test_the_install_guide_counts_after_its_full_width_first_box(self):
        expected = {1: {}, 2: {1: "lone-3 lone-2"}, 3: {}, 4: {3: "lone-2"}}
        for count, marks in expected.items():
            with self.subTest(count=count):
                self.assertEqual(site_figures.lone_classes(count, first_spans=True), marks)

    def test_box_rules(self):
        good = (".card { padding: var(--box-padding); } .install { padding: var(--box-padding); }"
                ".card h3 { margin: 0 0 1rem; } @media (min-width: 1px) { .grid-3 > .lone-3 { grid-column: 1 / -1; } }"
                ".grid-3 > .lone-2 { grid-column: 1 / -1; }")
        self.assertEqual(site_figures.box_problems(good), [])
        for bad in (good + ".section h3 { margin: 2rem 0 0.5rem; }",
                    good.replace(".install { padding: var(--box-padding); }", ".install { padding: 2rem; }"),
                    good.replace(".card { padding: var(--box-padding); }", ".card { padding: 2rem 1rem 1rem; }"),
                    good.replace(".grid-3 > .lone-2 { grid-column: 1 / -1; }", "")):
            with self.subTest(bad):
                self.assertTrue(site_figures.box_problems(bad))

    def test_the_hero_counts(self):
        line = "".join(site_figures.stats_block({"downloads": 1234, "stars": 1}))
        self.assertIn("1,234 downloads · ★ 1 star on GitHub</a>", line)
        self.assertIn('href="https://github.com/martonpaulo/ink-tools/stargazers"', line)
        self.assertIn('rel="noopener">5 downloads</a>', "".join(site_figures.stats_block({"downloads": 5, "stars": 0})))
        self.assertEqual(site_figures.stats_block({}), [""])

    def test_downloads_sum_every_published_file(self):
        rows = [{"assets": [{"download_count": 3}, {"download_count": 4}]}, {"draft": True, "assets": [{"download_count": 9}]}]
        self.assertEqual(site_figures.total_downloads(rows), 7)

    def test_the_plugin_guide_is_short_and_plain(self):
        text = (ROOT / "docs/install.md").read_text(encoding="utf-8")
        body = text.split("## Install a plugin", 1)[1].split("\n## ", 1)[0]
        steps = [line for line in body.splitlines() if line[:1].isdigit()]
        self.assertLessEqual(len(steps), 4)
        self.assertIn("**Settings** › **Apps** › **Plugins**", body)
        self.assertIn("`MyStyle`", body)
        self.assertNotIn("10 plugins", text)

    def test_interface_names_are_bold_and_render_as_strong(self):
        self.assertEqual(site_figures.install_problems((ROOT / "docs/install.md").read_text(encoding="utf-8")), [])
        good = "## Install a plugin\n\n1. Open **Settings** › **Apps** › **Plugins**, choose `MyStyle` and tap **Install**.\n"
        self.assertEqual(site_figures.install_problems(good), [])
        for bad in (good.replace("**Settings**", "Settings"), good.replace("**Apps**", "Apps"),
                    good.replace("**Plugins**", "Plugins"), good.replace("tap **Install**", "tap Install"),
                    good.replace("Install a plugin", "Remove a plugin").replace("**Apps**", "Apps")):
            with self.subTest(bad):
                self.assertTrue(site_figures.install_problems(bad))
        self.assertEqual(site_figures.install_problems("## How each step is checked\n\nSettings › Apps\n"), [])
        self.assertEqual(site_figures.inline("tap **Install** in `MyStyle`"), "tap <strong>Install</strong> in <code>MyStyle</code>")
        self.assertEqual(site_figures.inline("**Settings** › **Apps**"), "<strong>Settings</strong>&nbsp;› <strong>Apps</strong>")


class Subtitle(unittest.TestCase):
    """Owner, on #444: the centered hero subtitle is the one text that may keep a width cap."""

    def test_only_the_hero_summary_takes_the_subtitle_width(self):
        self.assertEqual(site_figures.width_problems(".hero-summary { max-width: var(--width-subtitle); }"), [])
        for bad in (".hero-summary { max-width: 40rem; }", ".hero-summary { max-width: 60ch; }",
                    ".lead { max-width: var(--width-subtitle); }", ".hero p { max-width: var(--width-subtitle); }",
                    ".hero-summary, .lead { max-width: var(--width-subtitle); }",
                    ".hero-summary { width: var(--width-subtitle); }"):
            with self.subTest(bad):
                self.assertTrue(site_figures.width_problems(bad))

    def test_the_class_marks_only_the_paragraph_under_the_title(self):
        good = '<h1 id="t">Title</h1>\n  <p class="hero-summary">Short line.</p><p>Body text.</p>'
        self.assertEqual(site_figures.subtitle_problems("x.html", good), [])
        self.assertEqual(site_figures.subtitle_problems("x.html", "<h1>T</h1><p>x</p>"), [])
        for bad in (good.replace("<p>Body", '<p class="hero-summary">Body'),
                    '<h1>T</h1><p>x</p><p class="hero-summary">late</p>',
                    '<h1>T</h1><ul class="hero-summary"><li>x</li></ul>'):
            with self.subTest(bad):
                self.assertTrue(site_figures.subtitle_problems("x.html", bad))


if __name__ == "__main__":
    unittest.main()
