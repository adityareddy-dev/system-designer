#!/bin/sh
# Builds the static site for Cloudflare Pages: copies only the files the site serves into dist/.
# The repo also holds the sign-in service, tests and tools, which must not be published as pages.
# Run from the repo root: sh scripts/pages-build.sh
set -eu
cd "$(dirname "$0")/.."

SITE="404.html LICENSE account apple-touch-icon.png assets catalog compete content core d favicon.ico guides index.html learn llms-full.txt llms.txt main.js manifest.webmanifest media p privacy.html problems render robots.txt sim sitemap.xml ui"

missing=""
for p in $SITE _headers; do
  [ -e "$p" ] || missing="$missing $p"
done
if [ -n "$missing" ]; then
  echo "pages-build: missing:$missing" >&2
  exit 1
fi

rm -rf dist
mkdir dist
for p in $SITE; do
  cp -R "$p" dist/
done
cp _headers dist/_headers

echo "pages-build: copied $(find dist -type f | wc -l | tr -d ' ') files into dist/"
