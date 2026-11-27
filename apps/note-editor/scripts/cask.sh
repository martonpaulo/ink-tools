#!/usr/bin/env bash
# Prints Note Editor's Homebrew cask for one release (#445): the release workflow writes it to
# Casks/note-editor.rb in martonpaulo/homebrew-tap, and test-cask.sh checks it. The bundle values
# come from Support/Info.plist; the zap list names only the folders the app writes
# (Sources/NoteEditorKit/AppFolders.swift, Sources/NoteEditor/NoteIndexer.swift), plus its
# preferences and saved window state.
#
# Usage: scripts/cask.sh --version <X.Y.Z> --sha256 <hex> [--plist <Info.plist>]
set -euo pipefail

usage() { echo "usage: scripts/cask.sh --version <X.Y.Z> --sha256 <hex> [--plist <Info.plist>]" >&2; exit 2; }

cd "$(dirname "$0")/.."
version=''
sha=''
plist='Support/Info.plist'
while [[ $# -gt 0 ]]; do
  case $1 in
    --version) [[ $# -ge 2 ]] || usage; version=$2; shift 2 ;;
    --sha256) [[ $# -ge 2 ]] || usage; sha=$2; shift 2 ;;
    --plist) [[ $# -ge 2 ]] || usage; plist=$2; shift 2 ;;
    *) usage ;;
  esac
done
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$ ]] || { echo "error: version must be X.Y.Z or X.Y.Z-beta.N: $version" >&2; exit 2; }
[[ $sha =~ ^[0-9a-f]{64}$ ]] || { echo "error: sha256 must be 64 lowercase hex characters" >&2; exit 2; }

read -r identifier name minimum < <(python3 - "$plist" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as f:
    info = plistlib.load(f)
print(info['CFBundleIdentifier'], info['CFBundleName'].replace(' ', '_'), info['LSMinimumSystemVersion'].split('.')[0])
PY
)
name=${name//_/ }
# Homebrew names each macOS major version; these are the ones the app can require.
case $minimum in
  26) macos=':tahoe' ;;
  27) macos=':golden_gate' ;;
  *) echo "error: no Homebrew name for macOS $minimum here: add it" >&2; exit 1 ;;
esac

cat <<CASK
cask "note-editor" do
  version "$version"
  sha256 "$sha"

  url "https://github.com/martonpaulo/ink-tools/releases/download/note-editor-v#{version}/Note-Editor-#{version}.zip"
  name "$name"
  desc "Editor for Supernote notebooks, page by page"
  homepage "https://inktools.martonpaulo.com/"

  livecheck do
    url "https://github.com/martonpaulo/ink-tools"
    regex(/^note-editor-v(\\d+(?:\\.\\d+)+(?:-beta\\.\\d+)?)$/i)
    strategy :github_releases
  end

  depends_on arch: :arm64
  depends_on macos: $macos

  app "$name.app"

  uninstall quit: "$identifier"

  zap trash: [
    "~/Library/Application Support/$identifier",
    "~/Library/Application Support/$name",
    "~/Library/Caches/$identifier",
    "~/Library/Preferences/$identifier.plist",
    "~/Library/Saved Application State/$identifier.savedState",
  ]
end
CASK
