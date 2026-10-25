# Plugins

Every tile around the dock is a plugin: the clock, the greeting, the weather, the
calendar, the bins reminder and now playing. Each one is a folder in `plugins/` that holds
everything that tile needs: its code, its styling, its part of the TV Home service and its
settings card in the web editor.

**To remove a tile**, delete (or move away) its folder. **To add one**, put its folder
back, or add a new one. Nothing else needs editing: the TV Home service looks in this
folder every 30 seconds, and TV Home and the web editor rearrange themselves to match.
The right-hand column closes up the gap, the clock bar shrinks to what's left in it, and
the editor's Settings tab gains or loses that plugin's card. A plugin's settings are kept
when it's removed, so putting it back brings them back too.

On the TV the folder is `/media/developer/apps/usr/palm/applications/net.local.tvhome/plugins/`.
Reinstalling the app with `ares-install` replaces it with the one in your copy of `web-osome/`.

For a small starting point, see `example-plugins/hello` (a "Hello, world!" tile for the
right-hand column). Copy it into `plugins/` to try it.

## What's in a plugin folder

```
plugins/calendar/
  plugin.json   name, description, version, order        (optional)
  tile.js       the tile on the home screen               (optional)
  tile.css      its styling                               (optional)
  service.js    its part of the TV Home service           (optional, needs the service)
  editor.js     its card in the web editor's Settings     (optional)
  editor.css    styling for that card                     (optional)
  ...           anything else it uses (ics.js here)
```

The folder name is the plugin's id: lower-case letters, digits, `-` and `_`.

### plugin.json

```json
{
  "name": "Calendar",
  "description": "The next few events from a shared calendar.",
  "version": "1.0.0",
  "order": 20
}
```

`order` sets the position within the tile's area (lower comes first). Today's plugins:

| Area | Plugins, in order |
|---|---|
| The capsule at the top right | weather (10), clock (20) |
| The right-hand column | bins (10), calendar (20), now playing (30) |
| Placed by its own CSS | greeting |

## tile.js: the tile on the home screen

Plain ES5 (the TV runs Chromium 94). It calls `TVHOME.plugin({...})` once:

```js
TVHOME.plugin({
  id: 'calendar',              // the folder name
  region: 'right',             // 'status' (the capsule), 'right' (the column) or 'stage' (its CSS places it)
  tag: 'aside',                // the tile's element (default section)
  attrs: { id: 'agenda' },     // attributes for it
  glass: true,                 // the blurred-glass background, like the other panels
  tone: 'agenda',              // dark text (.ink) where the picture behind is light: greet, status, agenda or music
  busy: true,                  // also .busy over busy pictures
  html: '<ol id="events"></ol>',

  start: function (api) { },   // it's on screen
  stop: function () { },       // it's being removed: clear timers
  onSecond: function (date) { },
  onMinute: function (date) { },
  onShow: function () { },     // TV Home came back to the front
  onReady: function () { },    // the service has connected
  onSettings: function () { }, // the settings changed (web editor)
  shrink: function () { return false; },   // 'right' only: the column is too full, take less room (true if it did)
  unshrink: function () { },
  migrate: function (oldSettings) { return null; }   // settings from before plugins, if any
});
```

What `api` gives it:

| | |
|---|---|
| `api.root` | the tile's element; `api.$('id')` finds an element inside it |
| `api.region` | the capsule (status) or the screen it's in |
| `api.show(on)` | show or hide it (class `show`); the column re-flows |
| `api.layout()` | its size changed: re-flow and repaint the glass |
| `api.settings()` | its settings, from the web editor (`settings.plugins.<id>`) |
| `api.service.subscribe(topic, cb)` | data its service.js publishes; follows changes |
| `api.service.call(method, params, cb)` | a one-off request to its service.js |
| `api.service.url(path)` | its service.js's HTTP routes, from the TV (e.g. pictures) |
| `api.util` | `pad`, `esc`, `el`, `svg` |
| `api.luna`, `api.toast`, `api.asset` | the same helpers TV Home uses |

If a plugin's code throws, the error goes to the console and the rest of TV Home carries on.

## service.js: its part of the TV Home service

Runs inside the TV Home service (Node, plain ES5) when the service is installed:

```js
module.exports = {
  settings: {
    clean: function (s) { return { url: String(s.url || '') }; },   // check what the editor saves
    migrate: function (old) { return null; },                       // settings from before plugins
    legacy: []                                                      // ...and their old names
  },
  start: function (api) {
    api.topic('events', function () { return { returnValue: true, events: [] }; });
    api.every(15 * 60 * 1000, refresh);      // paused while the TV is off or another app is in front
    api.after(1000, refresh);
    function refresh() { /* ... */ api.publish('events'); }
    return {
      settingsChanged: function () { },     // the settings, Home Assistant address or token changed
      powerOn: function () { },             // TV Home is back in front: catch up
      stop: function () { }                 // removed or changed: tidy up
    };
  }
};
```

`api` also has `settings()`, `log(...)`, `method(name, fn(params, reply))`,
`route(verb, path, fn(req, res, query, rest), { local: true })` for the editor (at
`/api/p/<id>/<path>`; `local` also lets the TV itself use it at `/p/<id>/<path>`),
`haBase()`, `haToken()`, `readJson`, `sendJson` and `send`. Timers made with `every` and
`after` stop by themselves when the plugin is removed. A changed `service.js` is loaded
again within 30 seconds.

## editor.js: its card in the web editor

```js
TVHOME_EDITOR.plugin({
  id: 'calendar',
  card: function (ctx) {
    var h = ctx.h, s = ctx.settings;   // s is this plugin's settings: change it, then ctx.markDirty()
    return h('div', { class: 'card' }, h('h3', { text: 'Calendar' }) /* ... */);
  }
});
```

`ctx.api(path, opts)` calls the plugin's own routes, `ctx.toast`, `ctx.rerender`,
`ctx.hasHaToken()` and the editor's icons (`ctx.UI`, `ctx.SYM`) are there too.

## How the list of plugins is found

The TV app can't list a folder on its own, so:

1. At start it uses the list from last time, so the tiles appear straight away.
2. The TV Home service then sends the current list, and again whenever it changes.
3. Without the service (the desktop preview, or a TV without root), TV Home reads the
   folder listing (`python3 -m http.server` shows one). If that isn't available either,
   it reads `plugins/index.json`, a list of folder names: `["clock", "greeting"]`.
