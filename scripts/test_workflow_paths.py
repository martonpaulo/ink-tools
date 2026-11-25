"""Tests of workflow_paths.py over small fixture repositories, and over this one (#301)."""

import contextlib
import io
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import workflow_paths  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent

WORKFLOW = """name: Validate {gate}
on:
  push:
    branches: [main]
    paths: [{paths}]
  pull_request:
    paths: [{paths}]
"""


def repository(rules, workflows):
    """A fixture repository: `rules` as (path, [gates]), `workflows` as {gate: [paths]}."""
    folder = tempfile.TemporaryDirectory()
    root = pathlib.Path(folder.name)
    gates = sorted({gate for _, names in rules for gate in names})
    data = {"gates": [{"name": gate, "command": "true"} for gate in gates],
            "rules": [{"path": path, "gates": names} for path, names in rules]}
    (root / "gates.json").write_text(json.dumps(data))
    (root / ".github" / "workflows").mkdir(parents=True)
    for gate, paths in workflows.items():
        text = WORKFLOW.format(gate=gate, paths=", ".join(f"'{path}'" for path in paths))
        (root / ".github" / "workflows" / f"validate-{gate}.yml").write_text(text)
    return folder, root


class WorkflowPathsTest(unittest.TestCase):
    def problems(self, rules, workflows):
        folder, root = repository(rules, workflows)
        with folder:
            return workflow_paths.check(root)[0]

    def test_matching_paths_pass(self):
        rules = [("plugins/a/", ["a"]), ("scripts/version.cjs", ["a", "b"]), (".github/workflows/validate-a.yml", ["a"])]
        workflows = {"a": ["plugins/a/**", "scripts/version.cjs", ".github/workflows/validate-a.yml"]}
        self.assertEqual(self.problems(rules, workflows), [])

    def test_a_rule_path_the_workflow_misses_fails(self):
        rules = [("plugins/a/", ["a"]), ("packages/core/", ["a"])]
        self.assertEqual(self.problems(rules, {"a": ["plugins/a/**"]}),
                         [("missing", "validate-a.yml", "packages/core/")])

    def test_a_workflow_path_no_rule_reaches_fails(self):
        rules = [("plugins/a/", ["a"]), ("packages/core/", ["b"])]
        self.assertEqual(self.problems(rules, {"a": ["plugins/a/**", "packages/core/**"]}),
                         [("extra", "validate-a.yml", "packages/core/**")])

    def test_a_star_rule_is_covered_by_a_wider_double_star_glob(self):
        rules = [("packages/kit/tokens*", ["a"]), ("plugins/*/config.json", ["a"])]
        self.assertEqual(self.problems(rules, {"a": ["packages/kit/**", "plugins/**"]}), [])

    def test_a_star_rule_is_not_covered_by_one_folder_of_it(self):
        rules = [("plugins/*/config.json", ["a"])]
        self.assertEqual(self.problems(rules, {"a": ["plugins/x/**"]}),
                         [("missing", "validate-a.yml", "plugins/*/config.json")])

    def test_the_same_glob_text_covers_a_glob_rule(self):
        rules = [("packages/kit/android-tokens*", ["a"])]
        self.assertEqual(self.problems(rules, {"a": ["packages/kit/android-tokens*"]}), [])

    def test_a_file_rule_is_covered_by_a_glob_that_matches_it(self):
        rules = [("apps/x/Package.swift", ["a"])]
        self.assertEqual(self.problems(rules, {"a": ["apps/x/*.swift"]}), [])

    def test_a_single_star_glob_does_not_cross_folders(self):
        rules = [("apps/x/y/Package.swift", ["a"])]
        self.assertEqual(self.problems(rules, {"a": ["apps/x/*.swift"]}),
                         [("missing", "validate-a.yml", "apps/x/y/Package.swift"),
                          ("extra", "validate-a.yml", "apps/x/*.swift")])

    def test_a_workflow_without_a_gate_fails(self):
        self.assertEqual(self.problems([("a/", ["a"])], {"a": ["a/**"], "ghost": ["x/**"]})[-1:],
                         [("no-gate", "validate-ghost.yml", "ghost")])

    def test_a_gate_without_a_workflow_is_skipped(self):
        folder, root = repository([("a/", ["a"]), ("*.md", ["docs"])], {"a": ["a/**"]})
        with folder:
            self.assertEqual(workflow_paths.check(root), ([], ["docs"]))

    def test_the_main_prints_and_exits_one_on_a_problem(self):
        folder, root = repository([("a/", ["a"]), ("b/", ["a"])], {"a": ["a/**"]})
        with folder, contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(workflow_paths.main(["--root", str(root)]), 1)
        self.assertIn("missing\tvalidate-a.yml\tb/", out.getvalue())

    def test_a_bad_root_exits_two(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(workflow_paths.main(["--root", folder]), 2)

    def test_this_repository_agrees(self):
        self.assertEqual(workflow_paths.check(ROOT)[0], [])


if __name__ == "__main__":
    unittest.main()
