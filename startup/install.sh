#!/bin/sh
# TV Home: open TV Home at power-on (rooted TVs with the Homebrew Channel).
# Run once, as root (e.g. webOS Dev Manager > Terminal):
#   sh /media/developer/apps/usr/palm/applications/net.local.tvhome/startup/install.sh
set -e
DIR=$(dirname "$(realpath "$0")")
HOOK=/var/lib/webosbrew/init.d/50-tvhome

if [ ! -d /var/lib/webosbrew ]; then
  echo "The Homebrew Channel doesn't seem to be installed (no /var/lib/webosbrew)."; exit 1
fi
mkdir -p /var/lib/webosbrew/init.d

# The Homebrew Channel runs everything in init.d one after another at start-up and only
# clears its crash flag once they've all finished. So this hook must not wait: it starts
# the watcher in the background and exits straight away. If the app has been removed,
# it does nothing.
cat > "$HOOK" <<HOOKEOF
#!/bin/sh
# TV Home autostart (installed by $DIR/install.sh; remove with uninstall.sh)
S="$DIR/autostart.sh"
[ -f "\$S" ] || exit 0
nohup sh "\$S" >/dev/null 2>&1 &
# start the web editor service (it keeps itself running)
(luna-send -n 1 luna://net.local.tvhome.service/start '{}' >/dev/null 2>&1 &)
exit 0
HOOKEOF
chmod 755 "$HOOK"

# The web editor service needs root: the Homebrew Channel's elevate-service grants it.
# (TV Home also does this itself when it opens, e.g. after a reinstall.)
ELEVATE=/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service
SVCDIR=/media/developer/apps/usr/palm/services/net.local.tvhome.service
if [ ! -d "$SVCDIR" ]; then
  echo "Web editor service: NOT INSTALLED. Package it with the app: ares-package tvhome tvhome/service"
elif [ ! -x "$ELEVATE" ]; then
  echo "Web editor service: the Homebrew Channel's elevate-service wasn't found, so it can't get root."
else
  "$ELEVATE" net.local.tvhome.service >/dev/null 2>&1 || echo "elevate-service reported an error"
  # root only applies to a freshly started service: stop the running one, then start it
  luna-send -n 1 luna://net.local.tvhome.service/restart '{}' >/dev/null 2>&1
  pkill -f 'services/net.local.tvhome.service' 2>/dev/null || true
  sleep 2
  if luna-send -n 1 luna://net.local.tvhome.service/getInfo '{}' 2>/dev/null | grep -q '"root" *: *true'; then
    echo "Web editor service: running as root."
  else
    echo "Web editor service: still NOT root. Check /tmp/tvhome-service.log"
  fi
fi

# restart the watcher now, so it works without restarting the TV
pkill -f 'startup/autostart\.sh$' 2>/dev/null || true   # all of its processes, not just the first
rm -f /tmp/tvhome-autostart.pid
sh "$HOOK"
sleep 1
echo "Installed: $HOOK"
echo "TV Home will open when the TV starts or wakes from standby."
echo "Log: /tmp/tvhome-autostart.log"
echo "Web editor: TV Home > Settings > Phone & laptop shows the address and QR code."
