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
APP_GUARD=5        # for this many seconds, also take the screen back from an app the TV
                   # reopened by itself (Start-up "Last source" resumes e.g. Netflix). 0 = off.
                   # This also overrides switching on with an app button on the remote.
WAKE_WAIT=3        # on a wake from standby, wait this long for "Last source" to open TV Home
                   # before stepping in. 0 = open straight away (for Home Auto Launch).
STANDBY_PRELOAD=1  # 1 = when the TV goes to standby, load TV Home again hidden a few seconds after
                   # LG's Quick Start+ has closed it, so switching on is a quick relaunch (~0.4 s)
                   # rather than a fresh start (~2-5 s). 0 = off. Also off while
                   # /home/root/tvhome-no-preload exists.
STANDBY_CLOSE=1    # 1 = at standby, also close the apps LG keeps running (e.g. Netflix), so the TV
                   # can't resume them on screen before TV Home at the next switch-on. 0 = off.
# (LG's background services run at low priority just after a full start: see calm-boot.sh.)

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
  # On a wake, Start-up "Last source" usually opens TV Home itself: give it WAKE_WAIT seconds,
  # and only step in if something else is in front. Opening it as well strands LG's loading cover.
  if [ "$1" = wake ] && [ "$WAKE_WAIT" -gt 0 ]; then
    # Check twice a second rather than waiting the whole time: if an app LG resumed (e.g.
    # Netflix) is already in front, Last source isn't opening TV Home, so step in at once.
    w=0
    while :; do
      [ "$(cat "$STATEF" 2>/dev/null)" = Active ] || return   # switched off again
      fg=$(foreground)
      case "$fg" in
        "$APP") log "$APP in front after ${w} checks, nothing to do"; return ;;
        com.webos.app.hdmi*|airplay) log "woke on $fg, leaving it"; return ;;
        ""|com.webos.*|com.lge.*) ;;   # LG's cover or home: Last source may still be opening TV Home
        *) log "$fg resumed, opening $APP now"; break ;;
      esac
      [ $w -ge $((WAKE_WAIT * 2)) ] && { log "${fg:-nothing} in front after ${WAKE_WAIT}s"; break; }
      sleep 0.5 2>/dev/null || sleep 1; w=$((w+1))
    done
  fi
  # at a full start LG usually opens TV Home itself before this script runs: opening it again costs
  # a relaunch just as the TV is at its busiest
  if [ "$1" = boot ] && [ "$(foreground)" = "$APP" ]; then log "boot: $APP already in front"; return; fi
  # watcher restarted by hand (e.g. after an update) while the TV was on: leave the screen alone
  if [ "$1" = boot ] && [ "$(cut -d. -f1 /proc/uptime 2>/dev/null || echo 0)" -gt 600 ]; then
    log "started while the TV was on, leaving the screen alone"; return
  fi
  if [ "$SKIP_IF_HDMI" = 1 ]; then
    fg=$(foreground)
    case "$fg" in
      com.webos.app.hdmi*) log "woke on $fg, leaving it"; return ;;
    esac
  fi
  launch
  # Rather than waiting a fixed time for the TV's own start-up to finish, open straight
  # away and take the screen back if the TV's home screen or live TV covers TV Home.
  # So is an app the TV reopened itself in the first APP_GUARD seconds. HDMI inputs and
  # anything later (an app you picked) are left alone.
  i=0
  while [ $i -lt "$GUARD" ]; do
    sleep 1; i=$((i+1))
    [ "$(cat "$STATEF" 2>/dev/null)" = Active ] || return   # switched off again
    fg=$(foreground)
    case "$fg" in
      "$APP") ;;
      ""|com.webos.app.home|com.webos.app.livetv|com.webos.app.discovery|com.webos.app.lgchannels)
        log "${fg:-nothing} in front after ${i}s, opening again"; launch ;;
      com.webos.app.hdmi*|airplay) log "$fg in front after ${i}s, leaving it"; return ;;   # inputs, and AirPlay waking the TV
      *) if [ $i -le "$APP_GUARD" ]; then log "$fg reopened after ${i}s, opening again"; launch
         else log "$fg in front after ${i}s, leaving it"; return; fi ;;
    esac
  done
}

# After the TV goes to standby, LG's Quick Start+ (qbd) closes TV Home about 1 s later.
# Load it again hidden once that's done, if the TV is still off. LG sometimes closes it a second
# time a moment later (with the other apps), so check again after 10 s, up to 3 loads in all.
preload_hidden() {
  sleep 5
  if [ "$STANDBY_CLOSE" = 1 ] && was_off "$(cat "$STATEF" 2>/dev/null)"; then close_resumable; fi
  n=0
  while :; do
    was_off "$(cat "$STATEF" 2>/dev/null)" || return
    [ -f /home/root/tvhome-no-preload ] && return
    $LUNA -n 1 luna://com.webos.applicationManager/running '{}' </dev/null 2>/dev/null | grep -q "\"id\" *: *\"$APP\"" && return
    if [ $n -ge 3 ]; then log "standby: $APP closed again, giving up"; return; fi
    n=$((n+1))
    log "standby: loading $APP hidden (try $n)"
    $LUNA -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"$APP\",\"preload\":\"full\"}" </dev/null >/dev/null 2>&1 ||
      log "hidden load failed"
    sleep 10
  done
}

# Apps LG keeps running through standby get put back on screen at the next switch-on, before
# TV Home. Close them (not TV Home, LG's own apps, inputs or AirPlay).
close_resumable() {
  for id in $($LUNA -n 1 luna://com.webos.applicationManager/running '{}' </dev/null 2>/dev/null |
              sed 's/"id" *: *"/\n@/g' | sed -n 's/^@\([^"]*\)".*/\1/p'); do
    case "$id" in
      "$APP"|com.webos.*|com.lge.*|com.palm.*|airplay) ;;
      *) log "standby: closing $id so it isn't resumed on switch-on"
         $LUNA -n 1 luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$id\"}" </dev/null >/dev/null 2>&1 ||
           log "close $id failed" ;;
    esac
  done
}

# Copies of this script left over from an earlier start (e.g. the loop's subshell outliving a
# killed watcher) would act on power changes too. Stop any that aren't this one or its children.
stop_leftovers() {
  for d in /proc/[0-9]*; do
    p=${d#/proc/}
    [ "$p" = $$ ] && continue
    case "$(tr '\0' '\n' <"$d/cmdline" 2>/dev/null | sed -n 2p)" in   # "sh .../startup/autostart.sh"
      */startup/autostart.sh|startup/autostart.sh) ;;
      *) continue ;;
    esac
    pp=$(sed 's/.*) . \([0-9]*\).*/\1/' "$d/stat" 2>/dev/null)
    [ "$pp" = $$ ] && continue
    log "stopping leftover watcher (pid $p)"; kill "$p" 2>/dev/null
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

stop_leftovers

# usually already done by TV Home's service, which starts earlier
sh "$(dirname "$0")/calm-boot.sh" &

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
      if [ -z "$last" ]; then open_home boot & else open_home wake & fi   # in the background, so power changes keep being read meanwhile
    fi
    if [ "$STANDBY_PRELOAD" = 1 ] && [ -n "$last" ] && was_off "$st" && ! was_off "$last"; then
      preload_hidden &
    fi
  done
  sleep 5
done
