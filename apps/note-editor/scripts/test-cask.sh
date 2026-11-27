#!/usr/bin/env bash
# Checks scripts/cask.sh (#445): the cask carries the release's version, sha256 and asset, the
# bundle values of Support/Info.plist, and refuses a bad version or sha256; `brew style` reads it
# when Homebrew is installed.
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "test-cask: $1" >&2; exit 1; }
SHA=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/Casks"
cask="$work/Casks/note-editor.rb"
scripts/cask.sh --version 1.2.3 --sha256 "$SHA" > "$cask"

identifier=$(python3 -c 'import plistlib,sys; print(plistlib.load(open(sys.argv[1],"rb"))["CFBundleIdentifier"])' Support/Info.plist)
for line in \
  'cask "note-editor" do' \
  '  version "1.2.3"' \
  "  sha256 \"$SHA\"" \
  '  url "https://github.com/martonpaulo/ink-tools/releases/download/note-editor-v#{version}/Note-Editor-#{version}.zip"' \
  '  app "Note Editor.app"' \
  "  uninstall quit: \"$identifier\"" \
  "    \"~/Library/Preferences/$identifier.plist\"," \
  '    regex(/^note-editor-v(\d+(?:\.\d+)+(?:-beta\.\d+)?)$/i)'; do
  grep -qxF -- "$line" "$cask" || fail "missing line: $line"
done

scripts/cask.sh --version 1.2 --sha256 "$SHA" > /dev/null 2>&1 && fail "a two-part version was accepted"
scripts/cask.sh --version 1.2.3 --sha256 ABC > /dev/null 2>&1 && fail "a short sha256 was accepted"
scripts/cask.sh --version 1.2.3-beta.4 --sha256 "$SHA" | grep -qxF '  version "1.2.3-beta.4"' || fail "a beta version was refused"

if command -v brew > /dev/null 2>&1; then
  brew style "$cask" > "$work/style.log" 2>&1 || { cat "$work/style.log" >&2; fail "brew style found offenses"; }
fi
echo "test-cask: ok"
