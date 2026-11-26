#!/usr/bin/env python3
"""Write docs/tool-facts.json: the GitHub facts the README and the site read about each tool (#436).

    tool_facts.py [--root DIR] [--repo OWNER/NAME]

docs/tool-facts.json is generated, never edited by hand. It holds `regressions`: every open issue
labelled `regression` whose title names a tool of docs/tools.json, as {number, title, tool}, which
turns that released tool Broken in the README (readme_figures.py). The GitHub API is read with the
token in $GITHUB_TOKEN when one is set, else without one, which is enough for a public repository.
The file is committed, so readme_figures.py --check reads it offline and stays deterministic.

shortcut: the file is refreshed when an agent runs this script, not on a schedule; add a scheduled
workflow when a regression must reach the page without an agent.
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True  # no __pycache__ beside the root scripts, which no gate rule names

FACTS = "docs/tool-facts.json"
REPOSITORY = "martonpaulo/ink-tools"
REGRESSION_LABEL = "regression"
API = "https://api.github.com/"
TIMEOUT_SECONDS = 30
ABOUT = ("Written by scripts/tool_facts.py from GitHub; never edit it by hand. regressions: each open issue "
         "labelled regression whose title names a tool, which turns that released tool Broken (#436).")


def get(path):
    """One GitHub REST call's JSON."""
    request = urllib.request.Request(API + path,
                                     headers={"Accept": "application/vnd.github+json"})
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.load(response)


def regressions(issues, names):
    """{number, title, tool} for each issue (never a pull request) whose title names one of `names`,
    the longest name first, so «Ink Tools Helper» never reads as a shorter name inside it."""
    out = []
    for issue in issues:
        if "pull_request" in issue:
            continue
        tool = next((n for n in sorted(names, key=len, reverse=True) if n.lower() in issue["title"].lower()), None)
        if tool:
            out.append({"number": issue["number"], "title": issue["title"], "tool": tool})
    return sorted(out, key=lambda r: r["number"])


def fetch(repo, names):
    issues, page = [], 1
    while True:
        batch = get(f"repos/{repo}/issues?state=open&labels={REGRESSION_LABEL}&per_page=100&page={page}")
        issues += batch
        if len(batch) < 100:
            break
        page += 1
    return {"about": ABOUT, "regressions": regressions(issues, names)}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=".")
    parser.add_argument("--repo", default=REPOSITORY)
    args = parser.parse_args()
    root = Path(args.root)
    names = [t["name"] for t in json.loads((root / "docs/tools.json").read_text(encoding="utf-8"))["tools"]]
    facts = fetch(args.repo, names)
    (root / FACTS).write_text(json.dumps(facts, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{FACTS}: {len(facts['regressions'])} regression(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
