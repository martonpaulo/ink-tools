#!/usr/bin/env bash
# Renders design/social-card/social-card.html to design/social-card/social-card.jpg (1200x630, JPEG
# q92, 4:4:4, progressive, metadata stripped) and copies it to site/social-card.jpg, the og:image and
# twitter:image of every page (#462). site_media.py check fails when the two differ.
# Needs Node and ImageMagick (7's `magick`, else 6's `convert`). SOCIAL_CARD_CHANNEL=chrome renders
# with the installed Google Chrome instead of Playwright's own Chromium, as a cloud session must.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
im=magick
command -v magick >/dev/null || im=convert
channel=()
if [ -n "${SOCIAL_CARD_CHANNEL:-}" ]; then channel=(--channel "$SOCIAL_CARD_CHANNEL"); fi
npx --yes playwright@1.63.0 screenshot ${channel[@]+"${channel[@]}"} --viewport-size="1200,630" \
  "file://$PWD/design/social-card/social-card.html" "$tmp/card.png" >/dev/null
"$im" "$tmp/card.png" -strip -colorspace sRGB -quality 92 -sampling-factor 4:4:4 -interlace Plane \
  design/social-card/social-card.jpg
cp design/social-card/social-card.jpg site/social-card.jpg
