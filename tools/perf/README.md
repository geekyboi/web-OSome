# Perf tools

Measure TV Home's RAM, CPU and start-up times on a rooted TV over days, so you can see the
best, worst and typical cases and pick what to work on. Nothing here runs unless you start it.

| File | Runs on | What |
|---|---|---|
| `tvperf.sh` | TV | Background logger. Every 30 s (5 min with the TV off): RAM, CPU, load, the app in front, and TV Home's app and service, LG's home and WebAppMgr on their own. Logs power changes and app launches for start-up times, samples every 2 s for 20 s after a launch, and saves the 20 biggest processes every 5 minutes. About 0.5 MB a day, in `/home/root/tvperf/`. |
| `tvperf-bench.sh` | TV | Opens apps by itself, cold and warm, several times each, and times them: until in front, until TV Home's screen is ready, until the TV is quiet again. |
| `pull.sh` | computer | Copies the files from the TV over SSH and prints the report. |
| `report.js` | computer | The report: RAM and CPU for each situation (min, average, p95, max), the worst moments, start-up times, the biggest processes and benchmark results. |

TV Home's app tells its service when its screen is ready, and the service adds that to
`events.csv`, but only if `/home/root/tvperf/` exists.

## Use

On the TV, as root (the scripts come with the app):

```
cd /media/developer/apps/usr/palm/applications/net.local.tvhome/tools/perf
sh tvperf.sh start          # or: install (also starts at every boot), stop, status, uninstall
sh tvperf-bench.sh -n 5     # optional, takes a few minutes: leave the remote alone
```

Then on your computer, from the repo:

```
tools/perf/pull.sh root@192.168.1.50
```

CPU % in the samples is of the whole TV (all cores together). In the process list it's of
one core. RAM used is total minus `MemAvailable`. App figures are the app's own web page
process: WebAppMgr's main process is shared by every web app and listed separately.
