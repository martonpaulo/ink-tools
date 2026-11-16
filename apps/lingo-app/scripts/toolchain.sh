#!/usr/bin/env bash
# Install the light Android toolchain into .toolchain/: build-tools 35 (aapt2, D8, zipalign,
# apksigner) and platform 35 (android.jar), each archive checked against a pinned SHA-1. The same
# archives and pins as the plugins' scripts/native-toolchain.sh (#59, #153), without React Native.
# Reuses ANDROID_HOME when it already holds both (a GitHub runner). Prints the two paths
# scripts/build.cjs reads.
#
#   bash scripts/toolchain.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/.toolchain"
mkdir -p "$dir"

fetch() { # url sha1 file
  local url="$1" sha="$2" file="$dir/$3"
  if [[ ! -f "$file" ]] || ! echo "$sha  $file" | shasum -a 1 -c --status; then
    curl -fsSL --retry 2 -o "$file.part" "$url"
    echo "$sha  $file.part" | shasum -a 1 -c --status || { echo "toolchain: SHA-1 mismatch for $url" >&2; rm -f "$file.part"; exit 1; }
    mv "$file.part" "$file"
  fi
}

sdk="${ANDROID_HOME:-}"
if [[ -n "$sdk" && -f "$sdk/build-tools/35.0.0/lib/d8.jar" && -f "$sdk/platforms/android-35/android.jar" ]]; then
  build_tools="$sdk/build-tools/35.0.0"
  platform="$sdk/platforms/android-35"
else
  # The archive for the host: aapt2 and zipalign are native binaries. SHA-1 values from Google's
  # repository2-3.xml.
  case "$(uname -s)" in
    Darwin) host=macosx sha=93ab8ce91230e067b5add4bfa79919c52b27f072 ;;
    Linux) host=linux sha=2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc ;;
    *) echo "toolchain: no build-tools archive for $(uname -s)" >&2; exit 1 ;;
  esac
  fetch "https://dl.google.com/android/repository/build-tools_r35_$host.zip" "$sha" "build-tools-$host.zip"
  fetch https://dl.google.com/android/repository/platform-35_r02.zip 0bb560a90a7a2cbd0dd8348224d518b638fe7949 platform.zip
  [[ -d "$dir/build-tools-$host" ]] || { unzip -q "$dir/build-tools-$host.zip" -d "$dir/bt.tmp" && mv "$dir/bt.tmp/"* "$dir/build-tools-$host" && rmdir "$dir/bt.tmp"; }
  [[ -d "$dir/platform" ]] || { unzip -q "$dir/platform.zip" -d "$dir/pf.tmp" && mv "$dir/pf.tmp/"* "$dir/platform" && rmdir "$dir/pf.tmp"; }
  build_tools="$dir/build-tools-$host"
  platform="$dir/platform"
fi

echo "LINGO_APP_BUILD_TOOLS=$build_tools"
echo "LINGO_APP_ANDROID_JAR=$platform/android.jar"
