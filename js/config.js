/* ------------------------------------------------------------------
   TV Home: your settings.
   Edit this file, then re-package and re-install (see README.md).

   CATEGORIES
   Up/Down on the remote moves between categories. Only the selected
   category shows its icons; the others show just their heading.
   The one marked  primary: true  is open when the app starts.

   TILE ACTIONS
   Each tile can do one or several things when you press OK:
     { app: "netflix" }                 launch a TV app / input by its webOS id
     { webhook: "my_webhook_id" }       POST to  <homeAssistant.url>/api/webhook/<id>
     { url: "http://..." }              POST to a full URL instead (no HA base needed)
     { delay: 500 }                     wait (ms) before the next step
   Shorthand: a tile may carry  app:  and/or  webhook:  directly.
   Longer sequences go in  actions: [ ... ]  and run in order.
   Webhooks are fired immediately and do not hold up the app launch.

   TILE ICONS (pick one per tile)
     symbol: "film"            a built-in line icon:
                               play, tv, film, note, power, house, speaker
     glyph: "PS", fs: 44       short text (fs = font size, optional)
     icon: "assets/icons/x.png"  your own logo. It is turned white to match the
                               theme, so use a transparent-background image
                               (add colorIcon: true to keep its own colours).
   With none of these you get the first letter of the name.

   SELECTED COLOUR
     color: "#e50914"          the tile fills with this colour when selected
                               (6-digit hex). Without it, a violet-pink gradient.

   TILES AROUND THE DOCK
   The clock, greeting, weather, calendar, bins and now playing are plugins:
   one folder each in plugins/. Delete a folder to remove that tile, put it
   back to add it again (see plugins/README.md). Their settings are made in
   the web editor.

   FINDING APP IDS
   On your computer, with the TV set up in ares-cli:
       ares-launch --device tv --listApp
   If an id is wrong, the TV answers with an error and the app shows
   "Couldn't launch <name>", so a bad id is easy to spot.
------------------------------------------------------------------- */
window.TVHOME_CONFIG = {

  maxVisible: 5,

  idleDimMinutes: 5,

  background: "assets/background2.jpg",

  homeAssistant: {
    url: "http://homeassistant.local:8123",   // or its IP address, e.g. http://192.168.1.10:8123
    timeoutMs: 4000
  },

  categories: [
    {
      id: "streaming",
      label: "Streaming",
      primary: true,
      tiles: [
        { 
          name: "Netflix",     
          glyph: "N",  
          fs: 60, 
          app: "netflix", 
          color: "#e50914" 
        },
        { 
          name: "iPlayer",     
          glyph: "bbc",  
          fs: 42, 
          app: "bbc.iplayer.3.0", 
          color: "#3b3b43"
        },
        { 
          name: "YouTube",     
          symbol: "play",      
          app: "youtube.leanback.v4", 
          color: "#ff1f3d" 
        },
        { 
          name: "Channel 4",     
          glyph: "4", 
          fs: 46, 
          app: "com.fvp.ch4", 
          color: "#ADFB8D" 
        },
        { 
          name: "Prime Video", 
          glyph: "P",  
          fs: 56, 
          app: "amazon", 
          color: "#0a9fd8" 
        },
        { 
          name: "Apple TV",    
          icon: "assets/icons/Apple_TV.png", 
          colorIcon: true, 
          color: "#3b3b43", 
          actions: [ 
            { webhook: "amp_tv" }, 
            { app: "com.apple.appletv"} 
          ] 
        },
        { 
          name: "Disney+",     
          glyph: "D+", 
          fs: 46, 
          app: "com.disney.disneyplus-prod", 
          color: "#1b3fd0" 
        },
        { 
          name: "ITVX",     
          glyph: "X", 
          fs: 46, 
          app: "com.fvp.itv", 
          color: "#0F2323" 
        },
        { 
          name: "U",     
          glyph: "U", 
          fs: 46, 
          app: "com.fvp.uktv", 
          color: "#FF6F59" 
        },
        { 
          name: "Five",     
          glyph: "5", 
          fs: 46, 
          app: "demand5", 
          color: "#002D62" 
        },
        { 
          name: "Now TV",     
          glyph: "Now", 
          fs: 46, 
          app: "now.tv", 
          color: "#001211" 
        },
        { 
          name: "Discovery+",     
          glyph: "D+", 
          fs: 46, 
          app: "com.discovery.dplus.emea", 
          color: "#0D183B" 
        }
        
      ]
    },

    {
      id: "gaming",
      label: "Gaming",
      tiles: [
        { name: "PlayStation 2", glyph: "PS", fs: 46, color: "#0070d1",
          actions: [ { webhook: "tv_ps5_on" },  { app: "com.webos.app.hdmi2" } ] },
        { name: "Xbox 360",        glyph: "360",  fs: 46, color: "#107c10",
          actions: [ { webhook: "tv_xbox_on" }, { app: "com.webos.app.hdmi3" } ] },
        { name: "Switch",      glyph: "NS", fs: 44, color: "#e60012",
          actions: [ { webhook: "tv_switch_on" }, { app: "com.webos.app.hdmi3" } ] },
        { name: "Wii U",      glyph: "Wii", fs: 44, color: "#e60012",
          actions: [ { webhook: "tv_switch_on" }, { app: "com.webos.app.hdmi3" } ] }
      ]
    },

    {
      id: "other",
      label: "Other",
      tiles: [
        { name: "Live TV",    symbol: "tv",    app: "com.webos.app.livetv" },
        { name: "HDMI In",    glyph: "In", app: "com.webos.app.hdmi1" },
        { name: "Spotify",    symbol: "speaker", app: "spotify-beehive", color: "#1DB954"},
        { name: "BBC Sounds",    symbol: "house", app: "bbc.sounds.1.0", color: "#E1CB5E"},
        { name: "LG Home",    symbol: "house", app: "com.webos.app.home" }
      ]
    }
  ]
};
