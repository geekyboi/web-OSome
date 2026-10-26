#!/bin/sh
# TV Home: copy the perf logger's files from the TV and print the report.
# Usage (on your computer): tools/perf/pull.sh root@<tv-ip> [folder]   (default folder: ./tvperf-data)
# SSH options, e.g. a key: TVPERF_SSH="ssh -i ~/.ssh/tv_key" tools/perf/pull.sh root@<tv-ip>
# Each pull replaces the copy in that folder; the TV keeps its own until the files rotate.
set -e
[ -n "$1" ] || { echo "Usage: $0 root@<tv-ip> [folder]"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${2:-tvperf-data}
mkdir -p "$OUT"
# tar over ssh: the TV may not have scp or sftp
${TVPERF_SSH:-ssh} "$1" 'cd /home/root/tvperf && tar cf - *.csv' | tar xf - -C "$OUT"
node "$HERE/report.js" "$OUT" | tee "$OUT/report.txt"
echo "Saved to $OUT (report.txt and the CSV files)."
