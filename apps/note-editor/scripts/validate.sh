#!/usr/bin/env bash
# Invariants of the app that need no compiler: the version and build number agree, the property
# lists are valid, the logic target imports only what swift-apps.md allows, and the String Catalog
# gives every entry its English value.
set -euo pipefail
cd "$(dirname "$0")/.."

PLIST_BUDDY=${PLIST_BUDDY:-/usr/libexec/PlistBuddy}
failures=0
fail() { echo "error: $1" >&2; failures=$((failures + 1)); }

version=$("$PLIST_BUDDY" -c "Print :CFBundleShortVersionString" Support/Info.plist)
build=$("$PLIST_BUDDY" -c "Print :CFBundleVersion" Support/Info.plist)
# SemVer with a numbered beta, as docs/product.md › Product versioning says (#445); a beta's build
# number derives from its X.Y.Z, so the beta and the release it leads to share it.
if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)(-beta\.[0-9]+)?$ ]]; then
  derived=$((10#${BASH_REMATCH[1]} * 10000 + 10#${BASH_REMATCH[2]} * 100 + 10#${BASH_REMATCH[3]}))
  [[ $build == "$derived" ]] || fail "CFBundleVersion ($build) is not $derived for version $version"
else
  fail "CFBundleShortVersionString ($version) is not X.Y.Z or X.Y.Z-beta.N"
fi

plutil -lint -s Support/Info.plist Support/PrivacyInfo.xcprivacy || fail "a property list in Support/ is invalid"

[[ -L CLAUDE.md && $(readlink CLAUDE.md) == AGENTS.md ]] || fail "CLAUDE.md must be a symlink to AGENTS.md"

while IFS= read -r module; do
  case $module in
    Foundation | CoreGraphics) ;;
    *) fail "Sources/NoteEditorKit imports $module; it may import only Foundation and CoreGraphics" ;;
  esac
done < <(sed -n 's/^import \([A-Za-z]*\).*/\1/p' Sources/NoteEditorKit/*.swift | sort -u)

python3 - Support/Localizable.xcstrings <<'PY' || fail "Support/Localizable.xcstrings has an entry without its English value, or a stale one"
import json, sys
catalog = json.load(open(sys.argv[1], encoding="utf-8"))
language = catalog["sourceLanguage"]
missing = [key for key, entry in catalog["strings"].items()
           if entry.get("shouldTranslate") is not False
           and "value" not in entry.get("localizations", {}).get(language, {}).get("stringUnit", {})]
stale = [key for key, entry in catalog["strings"].items() if entry.get("extractionState") == "stale"]
for key in missing:
    print(f"no {language} value: {key}", file=sys.stderr)
for key in stale:
    print(f"stale, run make strings: {key}", file=sys.stderr)
sys.exit(1 if missing or stale else 0)
PY

if (( failures > 0 )); then
  echo "validate: $failures failure(s)" >&2
  exit 1
fi
echo "validate: ok" >&2
