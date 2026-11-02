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
# process names as pgrep -x sees them (the first 15 characters); ones missing on a TV are skipped.
# Not here: anything that draws the screen, plays sound or video, reads the remote, or the luna bus.
CALM_PROCS="sdx iepg iot-client ss.gateway pbs iconnectivity
  admanager iotjs run-iot-js-serv nudge tvlinkcmdprocess tvlink-network- user-context-ma
  ocpservice sportsalarm nlpmanager tts voiceinput_hidr dmr ssdp-discovery broadcast-conf
  captureservice performer browser-service com.webos.chrom chromecast"
LOG=/tmp/tvhome-autostart.log

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

read up _ < /proc/uptime; up=${up%.*}
left=$((BOOT_CALM - up))
[ "$BOOT_CALM" -gt 0 ] && [ "$left" -gt 0 ] || exit 0
mkdir /tmp/tvhome-calm 2>/dev/null || exit 0   # already done this boot (/tmp is emptied at start-up)

undo=
# Lower every listed service that's running, including ones that start later, until the time is up.
calm() {
  for name in $CALM_PROCS; do
    for pid in $(pgrep -x "$name"); do
      case " $undo " in *" $pid:"*) continue ;; esac
      was=$(awk '{ print $19 }' "/proc/$pid/stat" 2>/dev/null) || continue
      renice 10 -p "$pid" >/dev/null 2>&1 && undo="$undo $pid:$was"
    done
  done
}
log "boot: LG background services at low priority for ${left}s (from ${up}s)"
end=$((up + left))
while :; do
  calm
  read now _ < /proc/uptime; now=${now%.*}
  [ "$now" -ge "$end" ] && break
  sleep 2
done
for x in $undo; do renice "${x#*:}" -p "${x%%:*}" >/dev/null 2>&1; done
log "boot: priorities back to normal ($(echo $undo | wc -w) processes)"
