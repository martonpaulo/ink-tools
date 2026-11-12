#!/usr/bin/env bash
# Prepare a Claude Code cloud session for this repository with Workbench's engine (workbench#914).
# The packages and the Mac-only paths are in .github/cloud.json.
#
#   bash scripts/cloud-setup.sh            # set the session up (as root)
#   bash scripts/cloud-setup.sh --dry-run  # print each step's command and change nothing
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
# Workbench was renamed from skill-deck (#116): found by its origin remote under any folder beside
# this checkout, never by its folder name. SKILL_DECK wins when set; the old folder is the fallback.
deck="$(dirname "$root")/skill-deck"
origin_pattern='github\.com[:/]martonpaulo/(workbench|skill-deck)(\.git)?/?$'
for dir in "$(dirname "$root")"/*/; do
  dir="${dir%/}"
  [[ -e "$dir/.git" ]] || continue
  origin="$(git -C "$dir" remote get-url origin 2>/dev/null)" || continue
  if [[ "$origin" =~ $origin_pattern ]]; then deck="$dir"; break; fi
done
deck="${SKILL_DECK:-$deck}"
engine="$deck/skills/project-setup/scripts/cloud_setup.py"
if [[ ! -f "$engine" ]]; then
  echo "cloud-setup: no Workbench at $deck; attach martonpaulo/workbench to the session" >&2
  exit 2
fi
exec python3 "$engine" run --root "$root" "$@"
