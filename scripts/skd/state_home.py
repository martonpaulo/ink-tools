#!/usr/bin/env python3
"""Where a hook keeps Skill Deck's own state: the development checkout's `.scratch` (#704, #1214).

`skd sync` runs the hooks from a read-only installed worktree, `<install>/<sha>`, that the next
sync removes. State written there would fail or be lost, so a hook resolves its checkout through
the worktree's `.git` file (`gitdir: <checkout>/.git/worktrees/<name>`) and writes under that
checkout. A script run from the checkout itself, or from a copy with no `.git` file, keeps its own
folder.
"""

from __future__ import annotations

from pathlib import Path


def checkout(root: Path) -> Path:
    """The development checkout that owns ROOT, or ROOT itself."""
    marker = root / ".git"
    try:
        text = marker.read_text(encoding="utf-8") if marker.is_file() else ""
    except OSError:
        return root
    if not text.startswith("gitdir:"):
        return root
    gitdir = Path(text.split(":", 1)[1].strip())
    if not gitdir.is_absolute():
        gitdir = (root / gitdir).resolve()
    if gitdir.parent.name == "worktrees" and gitdir.parent.parent.name == ".git":
        return gitdir.parent.parent.parent
    return root


def scratch(root: Path) -> Path:
    """The `.scratch` folder a hook under ROOT writes its state in."""
    return checkout(root) / ".scratch"
