#!/bin/sh
# TV Home: time how long apps take to open, cold (closed first) and warm (already running).
#
# It drives the TV by itself, so leave the remote alone while it runs (a few minutes).
# For each run it goes back to TV Home, waits for the TV to calm down, then opens the app
# and measures:
#   front_ms   until the app is in front (webOS says "foreground")
#   ready_ms   TV Home only, cold: until TV Home says its screen is ready (needs its service)
#   settle_ms  until the TV is quiet again (CPU under SETTLE_PCT for a second)
#   peak_cpu   the busiest half second while it opened (% of the whole TV)
#   avail      free RAM (MemAvailable) before, and after it settled
# Results go to bench.csv next to the logger's files, and a summary is printed at the end.
#
# Usage (as root on the TV):
#   sh tvperf-bench.sh [-n runs] [-m cold|warm|both] [app id...]
# With no app ids it tries TV Home, LG's home, YouTube, Netflix, Prime Video and Disney+
# (the ones that are installed).
DIR=${TVPERF_DIR:-/home/root/tvperf}
RUN=/tmp/tvperf
LUNA=${LUNA_SEND:-luna-send}
APP=net.local.tvhome
LG=com.webos.app.home
RUNS=5
MODE=both
SETTLE=${TVPERF_SETTLE:-8}            # seconds to wait on the starting screen before each run
SETTLE_PCT=${TVPERF_SETTLE_PCT:-25}   # "quiet" = CPU under this %
MAX_WAIT=30                           # give up on a run after this many seconds
DEFAULT_APPS="$APP $LG youtube.leanback.v4 netflix amazon com.disney.disneyplus-prod"

while getopts n:m: o; do
  case "$o" in n) RUNS=$OPTARG ;; m) MODE=$OPTARG ;; *) echo "Usage: sh $0 [-n runs] [-m cold|warm|both] [app id...]"; exit 1 ;; esac
done
shift $((OPTIND - 1))

# Seconds since boot, with hundredths.
up() { read u _ < /proc/uptime; echo "$u"; }
# Sleep a tenth of a second.
nap() { usleep 100000 2>/dev/null || sleep 0.1; }
# Call a luna method once.
call() { $LUNA -n 1 "$1" "$2" < /dev/null 2>/dev/null; }
# Open an app.
launch() { call luna://com.webos.applicationManager/launch "{\"id\":\"$1\"}" > /dev/null; }
# The app in front.
front() { call luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p'; }
# Is an app running (in front or in the background)?
is_running() { call luna://com.webos.applicationManager/running '{}' | grep -q "\"id\" *: *\"$1\""; }
# Free RAM in kB.
avail() { awk '/^MemAvailable:/ { print $2 }' /proc/meminfo; }
# Total and idle CPU ticks.
ticks() { awk '/^cpu / { t = 0; for (i = 2; i <= NF; i++) t += $i; print t, $5 + $6 }' /proc/stat; }
# Open an app and wait (up to MAX_WAIT) until it's in front.
show() {
  launch "$1"; i=0
  while [ "$(front)" != "$1" ] && [ $i -lt "$MAX_WAIT" ]; do sleep 1; i=$((i + 1)); done
}
# Wait until the life-cycle log has "<app> foreground" after uptime t0; print that uptime.
wait_front() {
  i=0
  while [ $i -lt $((MAX_WAIT * 10)) ]; do
    t=$(awk -v t0="$2" -v app="$1" '$1 > t0 && index($0, "\"" app "\"") && /"(status|event)" *: *"foreground"/ { print $1; exit }' "$RUN/bench-life")
    [ -n "$t" ] && { echo "$t"; return; }
    nap; i=$((i + 1))
  done
}
# Wait (up to 15 s) until TV Home's service logs its "ready" mark after uptime t0; print that uptime.
wait_ready() {
  i=0
  while [ $i -lt 150 ]; do
    t=$(awk -F, -v t0="$1" '$3 == "mark" && $5 ~ /^ready / && $2 > t0 { print $2; exit }' "$DIR/events.csv" 2>/dev/null)
    [ -n "$t" ] && { echo "$t"; return; }
    nap; i=$((i + 1))
  done
}
# Watch the CPU in half seconds until it's quiet for a second; sets SETTLED (uptime) and PEAK (%).
wait_quiet() {
  end=$(( ${1%.*} + MAX_WAIT )); PEAK=0; quiet=0; set -- $(ticks); pt=$1; pi=$2
  while :; do
    nap; nap; nap; nap; nap
    set -- $(ticks); dt=$(($1 - pt)); di=$(($2 - pi)); pt=$1; pi=$2
    [ "$dt" -gt 0 ] || continue
    busy=$(( (dt - di) * 100 / dt ))
    [ "$busy" -gt "$PEAK" ] && PEAK=$busy
    if [ "$busy" -lt "$SETTLE_PCT" ]; then quiet=$((quiet + 1)); else quiet=0; fi
    SETTLED=$(up)
    [ "$quiet" -ge 2 ] && return
    [ "${SETTLED%.*}" -ge "$end" ] && return
  done
}
# Milliseconds between two uptimes (empty if the second is missing).
ms() { [ -n "$2" ] && awk -v a="$1" -v b="$2" 'BEGIN { printf "%d", (b - a) * 1000 }'; }

mkdir -p "$DIR" "$RUN"
if [ $# -eq 0 ]; then
  for a in $DEFAULT_APPS; do
    call luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$a\"}" | grep -q '"returnValue" *: *true' && set -- "$@" "$a"
  done
fi
case "$MODE" in both) MODES="cold warm" ;; cold|warm) MODES=$MODE ;; *) echo "Mode must be cold, warm or both."; exit 1 ;; esac

# record every app life-cycle message with the uptime it arrived
: > "$RUN/bench-life"
rm -f "$RUN/bench.fifo"; mkfifo "$RUN/bench.fifo"
$LUNA -i luna://com.webos.applicationManager/getAppLifeStatus '{"subscribe":true}' < /dev/null > "$RUN/bench.fifo" 2>/dev/null &
LUNAPID=$!
while read -r l; do read u _ < /proc/uptime; echo "$u $l"; done < "$RUN/bench.fifo" >> "$RUN/bench-life" &
READPID=$!
trap 'kill $LUNAPID $READPID 2>/dev/null; rm -f /tmp/tvperf/bench.fifo' EXIT
trap 'exit 1' INT TERM
sleep 1

HEAD='time,app,mode,run,front_ms,ready_ms,settle_ms,peak_cpu_pct,avail_before_kb,avail_after_kb,note'
[ -s "$DIR/bench.csv" ] || echo "$HEAD" > "$DIR/bench.csv"
START=$(date '+%Y-%m-%dT%H:%M:%S')
echo "Timing: $* ($MODES, $RUNS runs each). Leave the remote alone."

for app in "$@"; do
  for mode in $MODES; do
    r=1
    while [ $r -le "$RUNS" ]; do
      note=
      # start from TV Home (or LG's home, opened from TV Home, when timing TV Home itself)
      show "$APP"
      [ "$app" = "$APP" ] && show "$LG"
      sleep "$SETTLE"
      if [ "$mode" = cold ]; then
        call luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$app\"}" > /dev/null
        sleep 3
        is_running "$app" && note="still running after close"
      else
        # warm: make sure it has been opened once since the last close
        is_running "$app" || { show "$app"; show "$APP"; [ "$app" = "$APP" ] && show "$LG"; sleep "$SETTLE"; }
      fi
      a0=$(avail); t0=$(up)
      launch "$app"
      tf=$(wait_front "$app" "$t0")
      wait_quiet "$t0"
      tr=; [ "$app" = "$APP" ] && [ "$mode" = cold ] && tr=$(wait_ready "$t0")
      [ -n "$tf" ] || note="${note:+$note; }never came to the front"
      line="$(date '+%Y-%m-%dT%H:%M:%S'),$app,$mode,$r,$(ms "$t0" "$tf"),$(ms "$t0" "$tr"),$(ms "$t0" "$SETTLED"),$PEAK,$a0,$(avail),$note"
      echo "$line" >> "$DIR/bench.csv"
      echo "  $line"
      r=$((r + 1))
    done
  done
done
show "$APP"

# summary of this run
echo
echo "app                              mode  runs  front ms (min/avg/max)   settle ms (min/avg/max)   ready ms (avg)"
awk -F, -v since="$START" '
  NR > 1 && $1 >= since {
    k = $2 " " $3; if (!(k in N)) { K[++nk] = k }
    N[k]++
    if ($5 != "") { F[k] += $5; FN[k]++; if (!(k in FMIN) || $5 < FMIN[k]) FMIN[k] = $5; if ($5 > FMAX[k]) FMAX[k] = $5 }
    if ($7 != "") { S[k] += $7; SN[k]++; if (!(k in SMIN) || $7 < SMIN[k]) SMIN[k] = $7; if ($7 > SMAX[k]) SMAX[k] = $7 }
    if ($6 != "") { R[k] += $6; RN[k]++ }
  }
  END {
    for (i = 1; i <= nk; i++) { k = K[i]; split(k, p, " ")
      printf "%-32s %-5s %4d  %6s/%6s/%6s     %6s/%6s/%6s      %s\n", p[1], p[2], N[k],
        FMIN[k], FN[k] ? int(F[k] / FN[k]) : "", FMAX[k], SMIN[k], SN[k] ? int(S[k] / SN[k]) : "", SMAX[k], RN[k] ? int(R[k] / RN[k]) : "-" }
  }' "$DIR/bench.csv"
echo
echo "Saved to $DIR/bench.csv"
