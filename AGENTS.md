# AGENTS.md: handover for AI coding assistants

Read this before changing anything. It's for AI assistants (Claude Code, Codex, Copilot,
Cursor...) and for the people using them. The user-facing docs are [README.md](README.md),
[docs/GUIDE.md](docs/GUIDE.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [plugins/README.md](plugins/README.md); this file is the
short version of how the code fits together and what not to break.

## What this is

web-OSome is a replacement home screen for LG webOS TVs (built on an OLED55A2, webOS 23).
It's a plain web app: HTML, CSS and **ES5** JavaScript, no build step, no npm, no framework.
On the TV it's the app `net.local.tvhome`, titled **TV Home** (its old name, still used in
code, ids and paths).

The point of the project is to be lighter than LG's own home screen: less RAM, less CPU,
no ads or tracking. Every change should keep it that way.

## How it fits together

There are three parts:

1. **The TV app** (`index.html`, `css/`, `js/`): the home screen itself.
2. **The service** (`service/`): a small Node service that runs on the TV, rooted TVs
   only. It stores the layout, runs the plugins' background parts, and serves the phone
   editor over HTTP on port 8419. The TV app talks to it over luna (`luna://net.local.tvhome.service/...`).
3. **The phone editor** (`service/web/`): a web page the service serves, for editing the
   layout from a phone or laptop. You sign in with a QR code shown on the TV.

Everything works without the service, with fewer features: the app falls back to
`js/config.js` and the TV's local storage.

| Where | What |
|---|---|
| `index.html` | The page. Its `<script>` tags set the load order. |
| `js/config.js` | Default apps, categories and settings. Heavily commented. |
| `js/core/` | The launcher, one job per file: `util`, `layout` (saved layout), `luna` (TV API calls), `actions` (launch apps, webhooks), `tv-icons`, `service-link`, `plugins` (tile loader), `dock` (the rows of tiles), `glass` (background and frosted panels), `tone` (light or dark text), `main` (start-up, remote input, idle dim). |
| `js/settings.js`, `js/settings-sources.js` | The Settings screen on the TV (red button), and where it finds apps to add. |
| `js/bgdraw.js`, `js/qr.js` | Background drawing, and a QR code generator. |
| `plugins/<id>/` | The tiles around the dock: clock, greeting, weather, calendar, bins, nowplaying. |
| `example-plugins/hello/` | The smallest working plugin. Not loaded; copy it into `plugins/` to try it. |
| `service/service.js`, `service/lib/` | The service: `http` (editor and API), `auth` (password, cookies), `layout`, `plugins`, `luna`, `power` (pauses while the TV is off or another app is in front), `homeassistant`. |
| `service/web/editor/` | The phone editor, one file per part. |
| `startup/` | Rooted TVs, run from a Homebrew Channel `init.d` hook: `install.sh`/`uninstall.sh` (the hook), `autostart.sh` (power watcher: opens TV Home at power-on and wake, preloads it in standby), `calm-boot.sh` (LG's background services at low priority for 2 minutes after a full start). |
| `tools/perf/` | RAM, CPU and start-up time logging on the TV, a launch benchmark and a report (see its README). |
| `.github/workflows/release.yml` | The only workflow: a `v*` tag builds and publishes a release and the Homebrew Channel repo. |
| `tools/lean/` | `build.sh`: a lean copy and package with the diagnostics left out (code between `diag:start` and `diag:end`, and lines ending in `// diag`), and no tools or docs. |
| `tools/hbrepo/` | `make-repo.js`: the Homebrew Channel repository (`apps.json` + manifest) for a release. The release workflow publishes it to GitHub Pages. |
| `home-assistant/` | Example automations, and an optional extra-apps list kept in Home Assistant. |

**The browser files share one global scope.** There are no modules: each file is a plain
`<script>`, and a function in one file can call one in another as long as it's loaded
first (see the order in `index.html`). The public surface for plugins and settings is
`window.TVHOME`, set at the bottom of `js/core/main.js`. Add a new file by adding a
`<script>` tag in the right place.

**Where settings live.** `js/config.js` holds the defaults. Changes made on the TV are
saved in local storage. On a rooted TV the service's copy, in `/home/root/.config/tvhome/`,
wins over both. Secrets (Home Assistant token, calendar links, the editor password) live
**only** on the TV, in that folder, and never go in the repo.

## Plugins

Each tile is a folder in `plugins/`. The folder name is its id (lower case, digits, `-`, `_`).
All files are optional:

- `plugin.json`: name, description, version, `order` (its position in its area).
- `tile.js` and `tile.css`: the tile on the home screen. It calls `TVHOME.plugin({ id, region, html, start, onMinute, ... })`.
  `region` is `'status'` (the clock capsule), `'right'` (the right-hand column) or `'stage'` (placed by its own CSS).
  A `'right'` tile can be selectable with `onOk`, `canFocus`, `onFocus` and `onKey` (the now-playing bar uses them for its buttons).
- `service.js`: runs inside the service (Node). It publishes data with `api.topic` and `api.publish`,
  and uses `api.every` and `api.after` for timers, which pause while the TV is off or another app is in front.
- `editor.js` and `editor.css`: its settings card in the phone editor (`TVHOME_EDITOR.plugin({ id, card })`).

Style tiles with the shared CSS variables at the top of `css/style.css` (glass, focus glow, text
colours, spacing, motion), not with their own colours, so everything stays in step.

The "now playing" tile reads the Yamaha amp over MusicCast (`plugins/nowplaying/musiccast.js`),
so Spotify, AirPlay and radio all show up through the amp; there's no Spotify API.

The service rescans `plugins/` every 30 seconds. Adding or deleting a folder is all it
takes, and the layout reflows by itself. A plugin that throws is caught and logged, and
the rest of the screen carries on. The full API is in [plugins/README.md](plugins/README.md).

### Adding a plugin

1. Copy `example-plugins/hello` to `plugins/<your-id>/` and rename the id in `tile.js`.
2. Set `order` in `plugin.json`, and `region` in `tile.js`.
3. Anything that fetches from the network belongs in `service.js` (fetch rarely, publish
   the result), not in `tile.js`. The TV app only shows what the service publishes.
4. If it has settings, add an `editor.js` card, and a `settings.clean` in `service.js`
   that checks what the editor saves.
5. Preview it on your computer, then test it on the TV (see below).

## Run and test

There are no automated tests, no linter and no CI checks (the only workflow is the release,
below). Testing means looking at it, and the TV is the test that counts.

**On your computer** (a quick look only):

```
python3 -m http.server 8000      # from the repo root, then open http://localhost:8000
```

Arrow keys, Enter and the mouse work. Launches show "Preview: would launch ..." instead.
Webhooks really are sent if Home Assistant is reachable. Without the service, plugins
are found from the folder listing. To try the service and editor too, run
`node service/service.js` in another terminal (HTTP only, no luna), and open
http://localhost:8419. Its data and password file go in your temp folder
(`tvhome-data/`) unless you set `TVHOME_DATA`. Its log goes to `/tmp/tvhome-service.log`,
or to `TVHOME_LOG`.

A quick syntax check before you commit:

```
for f in $(git ls-files '*.js'); do node --check "$f" || echo "FAIL $f"; done
```

This doesn't catch ES2015+ syntax that Node accepts but the TV doesn't (see Gotchas).

**On the TV** (what counts). You need Developer Mode and LG's `ares` CLI
(`npm install -g @webos-tools/cli`, device set up as `tv`). The setup is in
[docs/GUIDE.md section 3](docs/GUIDE.md#3-install-on-the-tv) and the
[webOS Brew Developer Mode guide](https://www.webosbrew.org/devmode/). For rooting, use the
[webOS Brew rooting guide](https://www.webosbrew.org/rooting/). This repo doesn't cover it.

From the folder **above** the repo:

```
ares-package web-osome                                  # makes net.local.tvhome_1.0.0_all.ipk
ares-install --device tv net.local.tvhome_1.0.0_all.ipk
ares-launch  --device tv net.local.tvhome
ares-inspect --device tv --app net.local.tvhome --open  # Chrome DevTools for the app on the TV
```

If the editor says the service isn't installed, package it explicitly:
`ares-package web-osome web-osome/service`. On the TV, the service logs to
`/tmp/tvhome-service.log` and the autostart watcher to `/tmp/tvhome-autostart.log`.
For an everyday install without the diagnostics, use `tools/lean/build.sh` instead of `ares-package` (it packages too). If you add timing or logging code that's only for measuring, mark it `diag` so the lean build drops it.
To see what a change does to RAM, CPU or start-up time, use `tools/perf/` (see its
README): a logger that runs on the TV for days, a launch benchmark, and a report. The report
also lists button-to-screen times (`key-*` marks), when the screen was shown after a full
start (`shown`), and wakes where the standby preload had TV Home ready. It needs the normal
build (the lean one drops the marks). Measure before and after, on the TV: desktop numbers
don't carry over. Write-ups of results are kept outside the repo.
Before you call a change done, check:

- the remote works: Up, Down, Left, Right, OK, Back and the red button, plus the Magic Remote pointer;
- nothing new keeps running while another app is in front or the TV is off;
- the app still works with no service running (a TV that isn't rooted).

Reinstalling replaces the app folder on the TV, so files added there by hand (like
`launchpoints.json`) are lost. Settings saved by the service survive.

**After a factory reset.** Root (the Homebrew Channel) can survive a reset, but SSH keys are
wiped and root SSH falls back to the default password `alpine` (put your key back, then restart), and
`/home/root/.config/tvhome/` (layout and secrets) is gone, so keep a backup of it. To put
everything back: turn LG's auto update off (a firmware update can remove root for good),
reinstall the app, copy back `launchpoints.json` and the settings folder, run
`startup/install.sh`, `sh tools/perf/tvperf.sh install` if you want the logger, then restart
the TV and check `/tmp/tvhome-autostart.log`. The amp volume overlay patch is a separate
project ([MusicCast_WebOS](https://github.com/geekyboi/MusicCast_WebOS)), not this repo.

## Releases

Bump `version` in `appinfo.json`, then push a tag like `v1.0.1`. The release workflow makes
a GitHub release with the normal `.ipk`, the lean `-lean.ipk` and a zip of the scripts and
config, then rebuilds the Homebrew Channel repo on GitHub Pages (`tools/hbrepo/make-repo.js`:
lean at `/apps.json`, normal at `/full/apps.json`). Force-pushing a tag that already has a
release replaces its files. Pages URLs are case-sensitive (`geekyboi.github.io/web-OSome/`). Pages needs **Settings → Pages →
Source: GitHub Actions** set once on the GitHub repo.

## Start-up and standby

This is the fiddliest part: read it before touching `startup/` or the start-up code in `main.js`.

- With LG's *Quick Start+*, switching on is usually a wake from standby, not a boot.
  `autostart.sh` watches the power state. On a wake it gives *Last source* up to `WAKE_WAIT`
  seconds to open TV Home itself (opening it twice strands LG's loading cover), but steps in
  at once if a resumed app such as Netflix is in front. At a full start it doesn't launch
  again if TV Home is already in front. A new watcher stops leftover copies of itself, and one started by hand on a TV that's
  been up over 10 minutes leaves the screen alone.
- **Standby preload:** LG closes TV Home on standby, so the watcher loads it again hidden
  (switching on is then ~0.4 s, not 2-5 s). LG sometimes closes it a second time, so it
  re-checks every 10 s, up to 3 loads. `touch /home/root/tvhome-no-preload` turns it off.
- **Last app:** on a wake LG's cover (`com.webos.app.cpcover`, bootd "Cover App" action) starts
  the app that was in front before standby (newest in surface-manager's recents) ~1-2 s before
  power reports Active, so it can show briefly before the watcher steps in. Tried and dropped:
  closing that app at standby (cold launch behind LG's white cover, looks worse; TV also
  suspended sooner, before the preload ran) and rewriting
  `/var/luna/preferences/last_foreground_app_id.json` (the cover doesn't read it).
- **First two minutes after a full start** the TV is flat out with LG's own services.
  `calm-boot.sh` runs a fixed list of them at low priority until 120 s after power-on (never
  anything that draws, plays, reads the remote or the luna bus). The loading screen stays up
  until the tiles' data is in and the service's `busy` method says the TV has calmed down.
  Held-arrow repeats that arrive before the last move was drawn are dropped, and extras
  (Home Assistant check, icon sync) wait until frames are smooth. Don't add work to this window.
- **Pixel shift** counts steps (one per 5 minutes on screen), not the clock, so returning
  from another app doesn't make the screen jump.

## Conventions

- **ES5 only, everywhere.** That covers the TV app, plugins, the editor and the service.
  Use `var`, `function` and string concatenation (most files start with `'use strict';`). No `let`/`const`,
  arrow functions, template literals, classes, `async`/`await`, spread or ES modules. The service also runs on whatever old Node the TV ships.
- **No dependencies and no build step.** Don't add npm packages, bundlers, transpilers or
  CDN scripts. The service uses only Node's built-in modules (and `webos-service`, which
  the TV provides).
- **Comments:** every function gets a one-line comment saying what it does, in plain English.
  Keep to that style.
- **Text, not HTML:** build DOM with `el()` and `esc()` from `js/core/util.js`. Anything that came from
  a user, Home Assistant or the network is set as text, never as `innerHTML`.
- **Plain, British English** in the UI and docs. Keep it short and friendly, like the existing text.
- Keep the TV app id `net.local.tvhome`, the service id `net.local.tvhome.service` and port
  8419. Users' installs, startup hooks and Input Hook keybinds depend on them.

## Gotchas

- **Old Chromium.** webOS 23 runs Chromium 94, and older TVs run older versions. Check new CSS
  and DOM APIs against that version. The frosted glass panels don't use `backdrop-filter`:
  they're cut from a small blurred copy of the background on a `<canvas>` (`js/core/glass.js`). Keep it that way. The screen is a fixed 1920x1080 viewport.
- **Keep CPU and RAM low.** That's the reason the project exists.
  - Hook into the existing once-a-second tick (`onSecond`/`onMinute`) rather than adding `setInterval`s.
  - Stop timers in `stop()`, and pause work while TV Home isn't in front (`onShow` tells you it's back).
  - In the service, use `api.every` so polling stops while the TV is off or another app is in front.
  - Avoid always-running CSS animations, large images and re-rendering the whole dock.
  - On a key press, don't force layout (reading `offsetWidth` and the like after a change).
    Reuse rows and skip rebuilding the dock or Settings when nothing changed. Each forced
    layout costs tens of ms on the TV.
- **No private data in commits.** Don't commit IP addresses, Home Assistant URLs or tokens,
  webhook ids, calendar links, passwords, `launchpoints.json`, `.ipk` files or personal
  photos. Secrets belong in the phone editor, which saves them on the TV. `.gitignore`
  already covers `*.local.js`, `.env`, `*.ipk` and `launchpoints.json`. Use made-up
  values like `192.168.1.50` in examples.
- **LG Home must stay reachable.** The `com.webos.app.home` tile can't be removed, so
  people always have a way back to LG's home screen. Don't weaken that.
- **Root-only features must fail gracefully.** The phone editor, the TV's real app icons,
  the Home button and autostart all need root. Without root, the app has to keep working
  quietly.
- **Running things as root.** The Homebrew Channel calls (`js/core/tv-icons.js`,
  `js/settings-sources.js`) run fixed commands. Never build a shell command from user
  input or app data.
- **Don't restart or poke LG's system processes.** `closeAllSystemUI` restarted the TV, and
  restarting the surface manager or WebAppMgr broke the Magic Remote pointer or rebooted the
  TV (seen with the amp volume patch). If something can't be done through luna, leave it.
- **Startup scripts must exit straight away.** `startup/install.sh` writes an `init.d`
  hook that backgrounds the watcher and exits. A hook that blocks puts the Homebrew
  Channel into failsafe mode at the next boot.
- **The TV can't list folders.** The plugin list comes from the service. Without it,
  the app reads the http.server folder listing, then `plugins/index.json`.
- **The press that wakes the dimmed screen does nothing else.** `wake()` returns true when it
  undimmed, and the key and click handlers in `js/core/main.js` swallow that press (and its
  repeats), so OK on a dark screen can't open an app. Keep any new input path doing the same.
- **Webhook results are blind.** The TV can't read Home Assistant's status codes (no CORS),
  so a wrong webhook id still says "Sent".
- **Don't make HA log failed logins.** Every 401 from Home Assistant raises an "invalid
  authentication" alert in HA (and can ban the TV's IP, which breaks webhooks too). The
  reachability dot asks for `/manifest.json` (no login), never `/api/`. A plugin that polls
  HA must stop after a 401 until the token or address changes, like the bins do.

## Changing docs

If you change behaviour, update the doc that describes it: README.md for the short
version, docs/GUIDE.md for the details, plugins/README.md for the plugin API, and this
file if the layout or the rules change.
