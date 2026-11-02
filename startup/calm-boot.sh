#!/bin/sh
# TV Home: just after a full start, run LG's background services at low priority so TV Home
# and the remote stay responsive while LG finishes starting up. Nothing is stopped: each
# service goes back to its own priority BOOT_CALM seconds after power-on.
#
# Run (as root) by TV Home's service as soon as it starts (~35 s after power-on) and by
# autostart.sh (~55 s, LG runs boot scripts late). Only the first run in each boot does anything.
#
# Settings:
BOOT_CALM=120      # seconds after power-on. 0 = off.
CALM_PROCS="sdx iepg iot-client ss.gateway pbs iconnectivity"
LOG=/tmp/tvhome-autostart.log

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

read up _ < /proc/uptime; up=${up%.*}
left=$((BOOT_CALM - up))
[ "$BOOT_CALM" -gt 0 ] && [ "$left" -gt 0 ] || exit 0
mkdir /tmp/tvhome-calm 2>/dev/null || exit 0   # already done this boot (/tmp is emptied at start-up)

undo=
for name in $CALM_PROCS; do
  for pid in $(pgrep -x "$name"); do
    was=$(awk '{ print $19 }' "/proc/$pid/stat" 2>/dev/null) || continue
    renice 10 -p "$pid" >/dev/null 2>&1 && undo="$undo $pid:$was"
  done
done
log "boot: $CALM_PROCS at low priority for ${left}s (from ${up}s)"
sleep "$left"
for x in $undo; do renice "${x#*:}" -p "${x%%:*}" >/dev/null 2>&1; done
log "boot: priorities back to normal"
