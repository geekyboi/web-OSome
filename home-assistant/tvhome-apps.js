/* TV Home: extra apps and buttons offered in Settings > Add apps > Home Assistant.

   Copy this file to Home Assistant's www folder:  /config/www/tvhome-apps.js
   (create the www folder if it doesn't exist, then restart Home Assistant once so it
   starts serving /local/). The TV loads it from
   http://<your-home-assistant>:8123/local/tvhome-apps.js each time you open that tab.

   Each entry is a tile, in the same format as js/config.js:
     name     the label (you can rename it on the TV)
     app      a TV app or input to launch, e.g. "com.webos.app.hdmi2"
     webhook  a Home Assistant webhook id to call
     actions  several steps in order: [{ webhook: "..." }, { app: "..." }]
     color    fill when selected (6-digit hex), optional
     symbol   a built-in icon: play, tv, film, note, power, house, speaker, input (optional)
     glyph    short text instead of an icon, e.g. "PS" (optional)

   Keep the "window.TVHOME_APPS =" line: loading the list as a script is what lets
   the TV read it without any CORS settings in Home Assistant.
*/
window.TVHOME_APPS = [
  { name: "Lights dim",   symbol: "film",  webhook: "lights_dim" },
  { name: "Night mode",   symbol: "note",  webhook: "amp_night" },
  { name: "Steam Deck",   glyph: "SD", fs: 44, color: "#1a9fff",
    actions: [ { webhook: "tv_steamdeck_on" }, { app: "com.webos.app.hdmi3" } ] }
];
