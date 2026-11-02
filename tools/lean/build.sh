#!/bin/sh
# Make a lean copy of TV Home with no diagnostics: no timing marks sent from the app, no
# perfMark in the service, and no tools, docs or examples in the package. Then package it.
#   tools/lean/build.sh [out-dir]      default out-dir: ../web-osome-lean (next to the repo)
# Code between "diag:start" and "diag:end" lines, and lines ending in "// diag" or "(diag)",
# is left out. The normal build (ares-package on the repo) still has everything.
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${1:-"$REPO/../web-osome-lean"}
case "$OUT" in "$REPO"|"$REPO"/*) echo "out-dir must be outside the repo" >&2; exit 1;; esac

rm -rf "$OUT"
mkdir -p "$OUT"
# only what the TV needs: tracked files, minus tools, docs and examples
cd "$REPO"
git ls-files | grep -vE '^(tools|docs|example-plugins|home-assistant)/|(^|/)[^/]*\.md$|^LICENSE$' | while IFS= read -r f; do
  mkdir -p "$OUT/$(dirname "$f")"
  case "$f" in
    *.js|*.html|*.css)
      awk '/diag:start/ { skip = 1; next } /diag:end/ { skip = 0; next }
           skip { next } /(\/\/ diag|\(diag\))[ \t]*$/ { next } { print }' "$f" > "$OUT/$f" ;;
    *) cp -p "$f" "$OUT/$f" ;;
  esac
done

# check: nothing diagnostic left, and every script still parses
if grep -rnE 'perfMark|PERF_DIR|tvperf|diag:(start|end)' "$OUT"; then echo "diagnostics left in the lean build" >&2; exit 1; fi
if command -v node >/dev/null 2>&1; then
  find "$OUT" -name '*.js' | while IFS= read -r f; do node --check "$f" || { echo "FAIL $f" >&2; exit 1; }; done
fi
echo "Lean copy in $OUT"

if command -v ares-package >/dev/null 2>&1; then
  (cd "$(dirname "$OUT")" && ares-package "$(basename "$OUT")" "$(basename "$OUT")/service")
else
  echo "ares-package not found: package it with  ares-package $OUT $OUT/service"
fi
