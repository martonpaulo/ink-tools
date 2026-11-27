"""Tests of agents_length.py: the route map's caps are read, each file fails over its own."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names
sys.path.insert(0, str(Path(__file__).resolve().parent))
import agents_length  # noqa: E402

ROUTE_MAP = "keeps them in its own `AGENTS.md` of at most 3 lines, and this file stays at most 5 lines.\n"


def lines(count):
    return "line\n" * count


class Caps(unittest.TestCase):
    def test_the_caps_come_from_the_route_map(self):
        self.assertEqual(agents_length.caps(ROUTE_MAP), (5, 3))
        self.assertIsNone(agents_length.caps("no caps here"))

    def test_this_repositorys_route_map_states_both_caps(self):
        root = Path(__file__).resolve().parent.parent
        self.assertIsNotNone(agents_length.caps((root / "AGENTS.md").read_text(encoding="utf-8")))

    def test_files_at_their_caps_pass(self):
        self.assertEqual(agents_length.over({"AGENTS.md": lines(5), "apps/a/AGENTS.md": lines(3)}, 5, 3), [])

    def test_a_module_and_the_root_over_their_caps_fail(self):
        """apps/note-editor/AGENTS.md reached 175 lines with no gate seeing it."""
        self.assertEqual(
            agents_length.over({"AGENTS.md": lines(6), "apps/a/AGENTS.md": lines(4)}, 5, 3),
            [("AGENTS.md", 6, 5), ("apps/a/AGENTS.md", 4, 3)])

    def test_a_fixture_and_other_files_never_count(self):
        self.assertEqual(agents_length.over({
            "apps/a/Tests/Fixtures/AGENTS.md": lines(9), "apps/a/README.md": lines(9),
        }, 5, 3), [])

    def test_reads_only_tracked_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "AGENTS.md").write_text(ROUTE_MAP, encoding="utf-8")
            (root / "tool").mkdir()
            (root / "tool" / "AGENTS.md").write_text(lines(4), encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "AGENTS.md"], check=True)
            self.assertEqual(agents_length.main(["--root", str(root)]), 0)
            subprocess.run(["git", "-C", str(root), "add", "tool/AGENTS.md"], check=True)
            self.assertEqual(agents_length.main(["--root", str(root)]), 1)


if __name__ == "__main__":
    unittest.main()
