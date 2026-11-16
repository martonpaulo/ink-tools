#!/usr/bin/env bash
# Install the light native toolchain (#142, copied from ../ink2pic as ../probe did) into .toolchain/, each archive checked
# against a pinned SHA-1. Reuses ANDROID_HOME when it already holds build-tools 35.0.0 and
# platform 35 (a GitHub runner). Prints the three paths native-build.cjs reads.
#
#   bash scripts/native-toolchain.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/.toolchain"
mkdir -p "$dir"

fetch() { # url sha1 file
  local url="$1" sha="$2" file="$dir/$3"
  if [[ ! -f "$file" ]] || ! echo "$sha  $file" | shasum -a 1 -c --status; then
    curl -fsSL --retry 2 -o "$file.part" "$url"
    echo "$sha  $file.part" | shasum -a 1 -c --status || { echo "native-toolchain: SHA-1 mismatch for $url" >&2; rm -f "$file.part"; exit 1; }
    mv "$file.part" "$file"
  fi
}

sdk="${ANDROID_HOME:-}"
if [[ -n "$sdk" && -f "$sdk/build-tools/35.0.0/lib/d8.jar" && -f "$sdk/platforms/android-35/android.jar" ]]; then
  build_tools="$sdk/build-tools/35.0.0"
  platform="$sdk/platforms/android-35"
else
  # The build-tools archive for the host: its aapt2 is a native binary (#153). The macOS one is
  # universal (x86_64 and arm64), so it runs on Apple silicon without Rosetta. SHA-1 values from
  # Google's repository2-3.xml.
  case "$(uname -s)" in
    Darwin) host=macosx sha=93ab8ce91230e067b5add4bfa79919c52b27f072 ;;
    Linux) host=linux sha=2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc ;;
    *) echo "native-toolchain: no build-tools archive for $(uname -s)" >&2; exit 1 ;;
  esac
  fetch "https://dl.google.com/android/repository/build-tools_r35_$host.zip" "$sha" "build-tools-$host.zip"
  fetch https://dl.google.com/android/repository/platform-35_r02.zip 0bb560a90a7a2cbd0dd8348224d518b638fe7949 platform.zip
  [[ -d "$dir/build-tools-$host" ]] || { unzip -q "$dir/build-tools-$host.zip" -d "$dir/bt.tmp" && mv "$dir/bt.tmp/"* "$dir/build-tools-$host" && rmdir "$dir/bt.tmp"; }
  [[ -d "$dir/platform" ]] || { unzip -q "$dir/platform.zip" -d "$dir/pf.tmp" && mv "$dir/pf.tmp/"* "$dir/platform" && rmdir "$dir/pf.tmp"; }
  build_tools="$dir/build-tools-$host"
  platform="$dir/platform"
fi

# Google's mirror of Maven Central: repo1.maven.org rate-limits shared cloud IPs (HTTP 429).
fetch https://maven-central.storage-download.googleapis.com/maven2/com/facebook/react/react-android/0.79.2/react-android-0.79.2-release.aar \
  731432c6e8b55133710e3dd982933f59fc3f9048 react-android.aar
[[ -f "$dir/react-android.jar" ]] || unzip -p "$dir/react-android.aar" classes.jar > "$dir/react-android.jar"
# Compile-only: React Android's classes carry Kotlin annotations; without the Kotlin standard
# library javac warns «unknown enum constant AnnotationRetention.RUNTIME» (#32). PluginHost
# provides it at run time, so it is never packaged.
fetch https://maven-central.storage-download.googleapis.com/maven2/org/jetbrains/kotlin/kotlin-stdlib/2.0.21/kotlin-stdlib-2.0.21.jar \
  618b539767b4899b4660a83006e052b63f1db551 kotlin-stdlib.jar

echo "LOOKUP_BUILD_TOOLS=$build_tools"
echo "LOOKUP_ANDROID_JAR=$platform/android.jar"
echo "LOOKUP_REACT_JAR=$dir/react-android.jar"
echo "LOOKUP_KOTLIN_JAR=$dir/kotlin-stdlib.jar"
