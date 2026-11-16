"""scripts/npm_audit.py over synthetic `npm audit --json` reports (#154)."""

import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import npm_audit  # noqa: E402


def report(*sources):
    vulnerabilities = {}
    for advisory, package, severity in sources:
        entry = vulnerabilities.setdefault(package, {"via": []})
        entry["via"].append({"url": f"https://github.com/advisories/{advisory}", "name": package, "severity": severity})
    # A package that only depends on a vulnerable one names it as a string.
    vulnerabilities["parent"] = {"via": ["deepmerge"]}
    return {"vulnerabilities": vulnerabilities}


class NpmAuditTest(unittest.TestCase):
    def test_excepted_advisory_passes_and_another_fails(self):
        blocked, excepted = npm_audit.check(
            report(("GHSA-aaaa", "deepmerge", "low"), ("GHSA-bbbb", "left-pad", "critical")),
            {("GHSA-aaaa", "deepmerge")},
        )
        self.assertEqual(blocked, [("GHSA-bbbb", "left-pad", "critical")])
        self.assertEqual(excepted, [("GHSA-aaaa", "deepmerge", "low")])

    def test_exception_for_another_package_does_not_cover(self):
        blocked, _ = npm_audit.check(report(("GHSA-aaaa", "deepmerge", "low")), {("GHSA-aaaa", "other")})
        self.assertEqual(len(blocked), 1)

    def test_clean_report_passes(self):
        self.assertEqual(npm_audit.check({"vulnerabilities": {}}, set()), ([], []))

    def test_npm_error_is_not_a_clean_report(self):
        with self.assertRaises(ValueError):
            npm_audit.check({"error": {"code": "ENOLOCK"}}, set())

    def test_exception_needs_a_reason(self):
        with tempfile.TemporaryDirectory() as temp:
            file = pathlib.Path(temp) / "exceptions.json"
            file.write_text(json.dumps({"exceptions": [{"advisory": "GHSA-aaaa", "package": "deepmerge"}]}))
            with self.assertRaises(ValueError):
                npm_audit.load_exceptions(file)

    def test_repository_exceptions_load(self):
        self.assertTrue(npm_audit.load_exceptions(npm_audit.ROOT / "audit-exceptions.json"))


if __name__ == "__main__":
    unittest.main()
