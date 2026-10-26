#!/bin/sh
# TV Home: a long-term RAM and CPU logger for the TV (rooted TVs only).
#
# Runs in the background on the TV and keeps adding to a few CSV files, so you can see
# the best, worst and typical cases over days, not just one moment:
#   samples.csv  every 30 s (5 min while the TV is off): RAM, CPU, load, the app in front,
#                and TV Home's app and service, LG's home and WebAppMgr on their own
#   events.csv   power changes, apps launching / coming to the front / closing (for start-up
#                times), and TV Home's own "ready" time (sent by its service)
#   top.csv      every 5 minutes: the 20 biggest processes (RAM, and CPU ticks to compare)
# Just after an app launches it samples every 2 s for 20 s, to catch the start-up peak.
# CPU % is of the whole TV (all cores together), so 100 = every core busy.
#
# Usage (as root on the TV):
#   sh tvperf.sh start | stop | status
#   sh tvperf.sh install      also start it at every boot (Homebrew Channel init.d hook)
#   sh tvperf.sh uninstall    remove that hook and stop it
# Then on your computer: tools/perf/pull.sh root@<tv-ip>   (copies the files and prints a report)
#
# Settings (or set them in the environment):
INTERVAL=${TVPERF_INTERVAL:-30}       # seconds between samples while the TV is on
OFF_INTERVAL=${TVPERF_OFF_INTERVAL:-300}   # ... and while it's off or in standby
TOP_EVERY=${TVPERF_TOP_EVERY:-300}    # seconds between top-20 snapshots
MAX_KB=${TVPERF_MAX_KB:-4096}         # each file is rotated (to .1) at this size: ~2 weeks each
DIR=${TVPERF_DIR:-/home/root/tvperf}  # the CSV files (kept across restarts)
RUN=/tmp/tvperf                       # pid files and counters (cleared at restart)
LUNA=${LUNA_SEND:-luna-send}
APP=net.local.tvhome
HOOK=/var/lib/webosbrew/init.d/60-tvperf
SELF=$(realpath "$0" 2>/dev/null || echo "$0")

# The time now, as text and as seconds since boot (with hundredths).
now() { TS=$(date '+%Y-%m-%dT%H:%M:%S'); read UP _ < /proc/uptime; }
# A value from a line of JSON: json "$line" key
json() { echo "$1" | sed -n 's/.*"'"$2"'" *: *"\{0,1\}\([^",}]*\).*/\1/p' | head -n 1; }
# Add a line to a CSV file, writing its header first if it's new, and rotate it when big.
csv() {
  f="$DIR/$1.csv"
  [ -s "$f" ] || echo "$2" > "$f"
  echo "$3" >> "$f"
  sz=$(($(wc -c < "$f") / 1024))
  [ "$sz" -lt "$MAX_KB" ] || { mv -f "$f" "$DIR/$1.1.csv"; echo "$2" > "$f"; }
}
EVHEAD='time,uptime,kind,app,detail'
# Log an event: event kind app detail
event() { now; csv events "$EVHEAD" "$TS,$UP,$1,$2,$3"; }

# Is a power state one of the "off" ones (the same list as startup/autostart.sh)?
is_off() {
  case "$1" in "Active Standby"|"Suspend"|"Power Off"|"Off"|"Standby") return 0 ;; *) return 1 ;; esac
}
# Handle a line from the power-state subscription.
on_power() {
  st=$(json "$1" state); [ -n "$st" ] || return
  last=; read last < "$RUN/power" 2>/dev/null; [ "$st" = "$last" ] && return
  echo "$st" > "$RUN/power"
  event power "" "$st"
}
# Handle a line from the app life-cycle subscription (launching, foreground, background, close...).
on_life() {
  app=$(json "$1" appId); st=$(json "$1" status); [ -n "$st" ] || st=$(json "$1" event)
  [ -n "$app" ] && [ -n "$st" ] || return
  event life "$app" "$st"
  case "$st" in
    foreground) echo "$app" > "$RUN/front" ;;
    launch|launching) read up _ < /proc/uptime; echo "${up%.*}" > "$RUN/burst" ;;
  esac
}
# Keep a luna subscription open (re-opening it if it drops) and pass each line to on_<kind>.
listen() {
  kind=$1; uri=$2; fifo=$RUN/$kind.fifo
  while :; do
    rm -f "$fifo"; mkfifo "$fifo"
    $LUNA -i "$uri" '{"subscribe":true}' > "$fifo" 2>/dev/null < /dev/null &
    echo $! > "$RUN/$kind.lpid"
    while read -r line; do "on_$kind" "$line"; done < "$fifo"
    sleep 5
  done
}

# One sample: everything in one awk run, reading /proc. Counters from the last sample are
# kept in $RUN/prev, so CPU is the average since then.
SAMPLE_AWK='
function getv(s, k,   v) {
  if (!match(s, "\"" k "\" *: *\"?[^\",}]*")) { return "" }
  v = substr(s, RSTART, RLENGTH); sub(/^[^:]*: *"?/, "", v); return v
}
function proc(k, pid,   l, f, key) {
  RSS[k] = ""; CPU[k] = ""
  if (pid == "" || (getline l < ("/proc/" pid "/stat")) <= 0) { return }
  close("/proc/" pid "/stat")
  sub(/^.*\) /, "", l); split(l, f, " ")
  RSS[k] = f[22] * 4; key = k ":" pid; NEW[key] = f[12] + f[13]
  if ((key in P) && dt > 0) { CPU[k] = sprintf("%.1f", 100 * (NEW[key] - P[key]) / dt) }
}
BEGIN {
  while ((getline l < prev) > 0) { split(l, a, " "); P[a[1]] = a[2] }
  close(prev)
  while ((getline l < "/proc/stat") > 0) {
    n = split(l, f, " ")
    if (f[1] == "cpu") { tot = 0; for (i = 2; i <= n; i++) { tot += f[i] } idle = f[5] + f[6]; iow = f[6] }
  }
  dt = ("tot" in P) ? tot - P["tot"] : 0
  busy = dt > 0 ? sprintf("%.1f", 100 * (dt - (idle - P["idle"])) / dt) : ""
  iowp = dt > 0 ? sprintf("%.1f", 100 * (iow - P["iow"]) / dt) : ""
  while ((getline l < "/proc/meminfo") > 0) { split(l, f, " "); sub(":", "", f[1]); M[f[1]] = f[2] }
  avail = ("MemAvailable" in M) ? M["MemAvailable"] : M["MemFree"] + M["Cached"]
  getline l < "/proc/loadavg"; split(l, f, " "); load = f[1]
  # the running apps and their processes (webprocessid = the web app renderer)
  getline s < running; nrun = split(s, parts, "}"); apps = 0
  for (i = 1; i <= nrun; i++) {
    id = getv(parts[i], "id"); if (id == "") { continue }
    apps++; p = getv(parts[i], "webprocessid"); if (p == "" || p == "0") { p = getv(parts[i], "processid") }
    APID[id] = p
  }
  proc("tv", APID[app]); proc("svc", svcpid); proc("lg", APID["com.webos.app.home"]); proc("wam", wampid)
  print ts "," up "," power "," front "," M["MemTotal"] "," avail "," M["MemFree"] "," M["Cached"] "," \
    (M["SwapTotal"] - M["SwapFree"]) "," busy "," iowp "," load "," apps "," \
    RSS["tv"] "," CPU["tv"] "," RSS["svc"] "," CPU["svc"] "," RSS["lg"] "," CPU["lg"] "," RSS["wam"] "," CPU["wam"]
  printf "tot %s\nidle %s\niow %s\n", tot, idle, iow > prev
  for (k in NEW) { printf "%s %s\n", k, NEW[k] > prev }
}'
SAMPLEHEAD='time,uptime,power,front,mem_total_kb,mem_avail_kb,mem_free_kb,cached_kb,swap_used_kb,cpu_busy_pct,iowait_pct,load1,apps_running,tvhome_rss_kb,tvhome_cpu_pct,svc_rss_kb,svc_cpu_pct,lghome_rss_kb,lghome_cpu_pct,wam_rss_kb,wam_cpu_pct'
# Take a sample and add it to samples.csv.
sample() {
  [ -n "$SVCPID" ] && [ -d "/proc/$SVCPID" ] || SVCPID=$(pgrep -f '^net\.local\.tvhome\.service' | head -n 1)
  [ -n "$WAMPID" ] && [ -d "/proc/$WAMPID" ] || WAMPID=$(pgrep -o WebAppMgr 2>/dev/null)
  $LUNA -n 1 luna://com.webos.applicationManager/running '{}' < /dev/null > "$RUN/running" 2>/dev/null
  power=; front=
  read power < "$RUN/power" 2>/dev/null; read front < "$RUN/front" 2>/dev/null
  now
  line=$(awk -v prev="$RUN/prev" -v running="$RUN/running" -v app="$APP" -v svcpid="$SVCPID" -v wampid="$WAMPID" \
    -v ts="$TS" -v up="$UP" -v power="$power" -v front="$front" "$SAMPLE_AWK")
  csv samples "$SAMPLEHEAD" "$line"
}
# The 20 biggest processes by RAM, with their CPU ticks (web apps named by their app id).
top20() {
  now
  cat /proc/[0-9]*/stat 2>/dev/null | awk -v ts="$TS" -v up="$UP" -v running="$RUN/running" '
    function getv(s, k,   v) {
      if (!match(s, "\"" k "\" *: *\"?[^\",}]*")) { return "" }
      v = substr(s, RSTART, RLENGTH); sub(/^[^:]*: *"?/, "", v); return v
    }
    BEGIN {
      getline s < running; n = split(s, parts, "}")
      for (i = 1; i <= n; i++) {
        id = getv(parts[i], "id"); if (id == "") { continue }
        p = getv(parts[i], "webprocessid"); if (p != "" && p != "0") { APP[p] = id }
        p = getv(parts[i], "processid"); if (p != "" && p != "0" && !(p in APP)) { APP[p] = id }
      }
    }
    {
      pid = $1; c = $0; sub(/^[^(]*\(/, "", c); comm = c; sub(/\) .*$/, "", comm); sub(/^.*\) /, "", c)
      split(c, f, " "); if (f[22] <= 0) { next }
      if (pid in APP) { comm = comm "[" APP[pid] "]" }
      gsub(/,/, " ", comm); N++; PID[N] = pid; NAME[N] = comm; RSS[N] = f[22] * 4; TK[N] = f[12] + f[13]
    }
    END {
      for (k = 1; k <= 20 && k <= N; k++) {
        b = 0; for (i = 1; i <= N; i++) { if (!(i in DONE) && (b == 0 || RSS[i] > RSS[b])) { b = i } }
        DONE[b] = 1; print ts "," up "," PID[b] "," NAME[b] "," RSS[b] "," TK[b]
      }
    }' | while read -r l; do csv top 'time,uptime,pid,name,rss_kb,cpu_ticks' "$l"; done
}

# The main loop: start the listeners, then sample forever.
run() {
  mkdir -p "$DIR" "$RUN"
  echo $$ > "$RUN/main.pid"
  $LUNA -n 1 luna://com.webos.service.tvpower/power/getPowerState '{}' < /dev/null 2>/dev/null |
    sed -n 's/.*"state" *: *"\([^"]*\)".*/\1/p' > "$RUN/power"
  $LUNA -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' < /dev/null 2>/dev/null |
    sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p' > "$RUN/front"
  p=; f=; read p < "$RUN/power"; read f < "$RUN/front"
  event start "$f" "$p"
  listen power luna://com.webos.service.tvpower/power/getPowerState &
  echo $! > "$RUN/power.pid"
  listen life luna://com.webos.applicationManager/getAppLifeStatus &
  echo $! > "$RUN/life.pid"
  lasttop=-999999
  while :; do
    sample
    read up _ < /proc/uptime; up=${up%.*}
    [ $((up - lasttop)) -ge "$TOP_EVERY" ] && { top20; lasttop=$up; }
    waited=0
    while :; do
      sleep 2; waited=$((waited + 2))
      read up _ < /proc/uptime; up=${up%.*}
      burst=-999; read burst < "$RUN/burst" 2>/dev/null
      [ $((up - burst)) -lt 22 ] && break          # an app is starting: sample every 2 s
      power=; read power < "$RUN/power" 2>/dev/null
      if is_off "$power"; then [ "$waited" -ge "$OFF_INTERVAL" ] && break
      else [ "$waited" -ge "$INTERVAL" ] && break; fi
    done
  done
}

# Is it running?
running() { [ -f "$RUN/main.pid" ] && kill -0 "$(cat "$RUN/main.pid")" 2>/dev/null; }
# Stop it and its listeners.
stop() {
  for k in main power life power.l life.l; do
    f="/tmp/tvperf/$k.pid"; [ "${k%.l}" != "$k" ] && f="/tmp/tvperf/${k%.l}.lpid"
    [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; rm -f "$f"
  done
  rm -f /tmp/tvperf/power.fifo /tmp/tvperf/life.fifo
}

case "$1" in
  run) run ;;
  start)
    if running; then echo "Already running (pid $(cat "$RUN/main.pid"))."; exit 0; fi
    mkdir -p "$RUN"
    nohup sh "$SELF" run > "$RUN/log" 2>&1 &
    echo "Started. Logging to $DIR" ;;
  stop) stop; echo "Stopped." ;;
  status)
    if running; then echo "Running (pid $(cat "$RUN/main.pid")), logging to $DIR"; else echo "Not running."; fi
    ls -l "$DIR" 2>/dev/null ;;
  install)
    [ -d /var/lib/webosbrew ] || { echo "The Homebrew Channel doesn't seem to be installed."; exit 1; }
    mkdir -p /var/lib/webosbrew/init.d
    # must exit straight away (see startup/install.sh), so it only backgrounds the logger
    printf '#!/bin/sh\n# TV Home perf logger (remove with: sh %s uninstall)\n[ -f "%s" ] && (sh "%s" start >/dev/null 2>&1 &)\nexit 0\n' \
      "$SELF" "$SELF" "$SELF" > "$HOOK"
    chmod 755 "$HOOK"
    sh "$SELF" start
    echo "It will also start at every boot ($HOOK)." ;;
  uninstall) rm -f "$HOOK"; stop; echo "Removed $HOOK and stopped. The data is still in $DIR." ;;
  *) echo "Usage: sh $0 start|stop|status|install|uninstall"; exit 1 ;;
esac
