#!/bin/sh
# TV Home: stop opening at power-on.
rm -f /var/lib/webosbrew/init.d/50-tvhome
pkill -f 'startup/autostart\.sh$' 2>/dev/null   # the watcher and its listening loop
rm -f /tmp/tvhome-autostart.pid /tmp/tvhome-autostart.state
echo "Removed. TV Home no longer opens at power-on."
