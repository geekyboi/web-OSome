#!/bin/sh
# TV Home: open TV Home when the TV starts up, and every time it's switched on from standby.
#
# Started at boot by the Homebrew Channel (see install.sh). It keeps running in the
# background, listening to the TV's power state, because with LG's "Quick Start+" on,
# switching the TV on is a wake from standby rather than a fresh boot.
#
# Settings (edit here, then run install.sh again or restart the TV):
APP=net.local.tvhome
WAKE_DELAY=0       # seconds after the TV wakes before opening TV Home
BOOT_DELAY=0       # same, after a full start
GUARD=10           # for this many seconds after opening, re-open TV Home if the TV's
                   # own home screen or live TV takes over the screen (instead of waiting)
SKIP_IF_HDMI=0     # 1 = don't open TV Home if the TV woke up on an HDMI input
                   #     (e.g. a console turned the TV on over HDMI-CEC)

LOG=/tmp/tvhome-autostart.log      # cleared when the TV restarts
PIDF=/tmp/tvhome-autostart.pid
STATEF=/tmp/tvhome-autostart.state
LUNA=${LUNA_SEND:-luna-send}

exec >>"$LOG" 2>&1
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# only one copy
if [ -f "$PIDF" ] && kill -0 "$(cat "$PIDF" 2>/dev/null)" 2>/dev/null; then
  log "already running (pid $(cat "$PIDF")), exiting"
  exit 0
fi
echo $$ > "$PIDF"
: > "$STATEF"            # empty = just started, so the first "Active" counts as a power-on
log "started (pid $$)"

open_home() {
  if [ "$SKIP_IF_HDMI" = 1 ]; then
    fg=$(foreground)
    case "$fg" in
      com.webos.app.hdmi*) log "woke on $fg, leaving it"; return ;;
    esac
  fi
  launch
  # Rather than waiting a fixed time for the TV's own start-up to finish, open straight
  # away and take the screen back if the TV's home screen or live TV covers TV Home.
  # Anything else (an app you picked, an HDMI input) is left alone.
  i=0
  while [ $i -lt "$GUARD" ]; do
    sleep 1; i=$((i+1))
    [ "$(cat "$STATEF" 2>/dev/null)" = Active ] || return   # switched off again
    fg=$(foreground)
    case "$fg" in
      "$APP") ;;
      ""|com.webos.app.home|com.webos.app.livetv|com.webos.app.discovery|com.webos.app.lgchannels)
        log "${fg:-nothing} in front after ${i}s, opening again"; launch ;;
      *) log "$fg in front after ${i}s, leaving it"; return ;;
    esac
  done
}

foreground() {
  $LUNA -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' </dev/null 2>/dev/null |
    sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p'
}

launch() {
  log "opening $APP"
  $LUNA -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$APP\"}" </dev/null >/dev/null 2>&1 ||
    log "launch failed"
}

# Power states that mean "the TV was off". Coming back to Active from these opens TV Home.
# (Not from "Screen Off" or "Screen Saver": the TV was on, e.g. playing music with the screen off.)
was_off() {
  case "$1" in
    ""|"Active Standby"|"Suspend"|"Power Off"|"Off"|"Standby") return 0 ;;
    *) return 1 ;;
  esac
}

while true; do
  # Stream power-state changes. If the subscription drops (e.g. during start-up, before the
  # service is ready, or if it restarts), wait and subscribe again.
  $LUNA -i luna://com.webos.service.tvpower/power/getPowerState '{"subscribe":true}' 2>/dev/null |
  while read -r line; do
    st=$(echo "$line" | sed -n 's/.*"state" *: *"\([^"]*\)".*/\1/p')
    [ -z "$st" ] && continue
    last=$(cat "$STATEF" 2>/dev/null)
    [ "$st" = "$last" ] && continue
    echo "$st" > "$STATEF"
    log "power: ${last:-start} -> $st"
    if [ "$st" = "Active" ] && was_off "$last"; then
      if [ -z "$last" ]; then sleep "$BOOT_DELAY"; else sleep "$WAKE_DELAY"; fi
      open_home &     # in the background, so power changes keep being read meanwhile
    fi
  done
  sleep 5
done
