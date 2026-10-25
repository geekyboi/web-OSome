# web-OSome: the full guide

The long version of the README. (On the TV the app is called **TV Home**, so that name turns up a lot below.)


A custom home screen for an LG webOS TV. Three categories (Streaming, Gaming,
Other): only the selected one shows its icons, the other two show just a faint
heading. Icons are bare glyphs; the selected one becomes a rounded squircle in the
service's brand colour. A row shows at most 4 icons, with an arrow when there are
more. The top left greets you (Good morning / afternoon / evening); the top-right
capsule shows the clock and whether Home Assistant is reachable. Tiles launch TV
apps and inputs, and/or fire Home Assistant webhooks (consoles, amplifier, anything).

It is a plain web app (HTML/CSS/ES5 JS, no build step) written for the Chromium 94
engine in webOS 23. It works with the Magic Remote pointer **and** the arrow keys.

| Remote | Does |
|---|---|
| Up / Down | Switch category (the previous one collapses to its heading) |
| Up from the top category | Selects the gear next to the clock; OK opens Settings |
| Red button | Opens Settings |
| Left / Right | Move along the open category (the row scrolls past 4 icons) |
| OK | Run the tile (launch app, call webhook, or both) |
| Pointer | Hover focuses, click runs, click a heading to open it, click the arrows to page |

## What works, and what needs root

| You asked for | Without root | With root |
|---|---|---|
| A home screen with buttons for native apps | Yes | Yes |
| Buttons that call Home Assistant webhooks | Yes | Yes |
| Opens when the TV turns on | **Yes, via a Home Assistant automation** (`home-assistant/automations.yaml`). LG has no setting or API for this. | **Yes, with a Homebrew Channel startup script** (section 4) |
| Takes over the remote's **Home** button | **No.** LG does not let apps intercept it. | **Yes, with LG Input Hook** (section 5) |
| Edit the home screen from a phone or laptop | Settings on the TV only | **Yes, web editor with a QR sign-in** (section 6) |

## 1. Try it on your computer first

```
cd web-osome
python3 -m http.server 8000
```

Open http://localhost:8000. Arrow keys, Enter and the mouse all work. Tiles show
"Preview: would launch ..." instead of launching; webhooks really are sent if
Home Assistant is reachable from your computer.

## 2. Configure

Everything you change lives in **`js/config.js`**, with comments. In short:

- `categories[].tiles[]`: a tile has a `name` and either `app:` (launch a TV app
  or input), `webhook:` (call Home Assistant), or an `actions:` list that does
  several things in order. Example: the PlayStation tile wakes the console via a
  webhook and then switches the TV to HDMI 2.
- `color:` on a tile is its fill when selected (6-digit hex). Without it you get a
  violet-pink gradient. `maxVisible` (default 4) sets how many icons a row shows.
- Tile icons: `symbol:` (built-in line icon: play, tv, film, note, power, house,
  speaker, input), `glyph:` (short text), or `icon:` (your own image).
- Logos are not bundled. Put your own in `assets/icons/` and use
  `icon: "assets/icons/netflix.png"`. They are turned white to match the theme, so
  use logos with a **transparent background** (a logo on a solid square becomes a
  white block); `colorIcon: true` keeps an image's own colours.
- `background`: one full-page picture, ideally 1920x1080 (JPG or PNG), shown behind
  everything. Keep the left side dark so the headings stay readable.
  `background: null` gives plain black. The bundled `assets/background2.jpg` is
  the mountain lake; replace the file (or point this at your own) to change it.
- **Text on light pictures.** TV Home measures how light the background is behind
  the greeting, the sections and the clock, and uses dark text (and light glass)
  wherever it's light. In the web editor, Settings → Text can force light or dark
  text, and add a soft shade behind the text for busy pictures. (`textStyle:
  "auto" | "light" | "dark"` and `shade: true` in `config.js` do the same.)
- `homeAssistant.url`: use the IP address if the TV can't resolve
  `homeassistant.local`. The dot in the status capsule is green when the TV can
  reach it, red when it can't.
- The screen dims after 5 idle minutes and slowly shifts by up to 2 pixels, to be
  kind to the OLED panel (see "OLED care" at the end).

**App IDs.** The IDs in `config.js` match the app list from this TV (OLED55A2,
webOS 23), including Apple TV (`com.apple.appletv`), Disney+, BBC iPlayer, ITVX,
Channel 4, U (`com.fvp.uktv`), 5 (`demand5`), NOW (`now.tv`), discovery+
(`com.discovery.dplus.emea`), Spotify (`spotify-beehive`), BBC Sounds
(`bbc.sounds.1.0`), LG Home and the inputs `com.webos.app.hdmi1`..`hdmi4`. To list
them again (e.g. after installing an app), use Settings → TV apps, or
`ares-launch --device tv --listApp`. A wrong ID is easy to spot, because the app
shows "Couldn't launch <name>".

**Webhook feedback.** The TV can tell you the request left, or that Home Assistant
was unreachable. It cannot see HTTP status codes (that would need Home Assistant
to send CORS headers), so a wrong webhook id still says "Sent".

## 2b. Settings on the TV

Open Settings with the gear next to the clock (press Up from the top category, then
OK), the red button on the remote, or by clicking the gear with the pointer.

- **Tabs along the top** pick the section you're editing: Streaming, Gaming or Other.
- **The left list** shows that section's apps. Each one has buttons to rename it (the
  TV's on-screen keyboard appears; OK saves, Back cancels), move it earlier or later,
  and remove it.
- **The right list** adds apps to that section, from three places:
  - **TV inputs**: Live TV and the HDMI inputs, with the names set on the TV.
  - **TV apps**: the apps in the TV's launcher (see below).
  - **Home Assistant**: a list file you keep in Home Assistant (see below).
- **LG Home** can't be removed (it shows a lock instead of the remove button),
  because it's your way back to LG's own home screen. If several tiles open LG
  Home (`com.webos.app.home`), any of them can go as long as one is left. You can still rename and move
  it. If it's ever missing, it's put back at the end of the last section.
- **Back** or **Done** closes Settings and rebuilds the home screen.

Changes are saved on the TV as you make them. `js/config.js` holds the defaults:
once you've changed anything in Settings, the TV uses its saved version instead,
until you choose **Reset to defaults** (press it twice). The saved version is kept
in the app's local storage on the TV, so it may be cleared if the app is removed
or Developer Mode expires; add anything you want to keep to `config.js` as well.

### TV apps list

LG doesn't let third-party apps simply read the TV's app list, so the TV apps tab
tries these in order and says under the tabs which one it used:

1. **The TV's launcher**, asked directly. Most TVs refuse ("Denied method call").
2. **The Homebrew Channel** (rooted TVs). If it's installed, the app asks its
   service to run `luna-send … listLaunchPoints` as root and reads the full live list.
   The command is fixed: nothing from the app or from you is put into it. This is
   the method [webos-launcher](https://github.com/partridgeworks/webos-launcher) uses.
3. **`launchpoints.json`** in the app folder, if you've made one. From a root shell
   (webOS Dev Manager → Terminal):
   ```
   luna-send -n 1 luna://com.webos.applicationManager/listLaunchPoints '{}' > /media/developer/apps/usr/palm/applications/net.local.tvhome/launchpoints.json
   ```
   Reinstalling the app replaces its folder, so copy the file into the app folder before
   `ares-package` if you want to keep it.
4. **Known apps**: a built-in list of about 30 common apps (UK channels included),
   checked one by one with the TV, which third-party apps *are* allowed to ask.
   Only the installed ones are shown. App IDs from
   [webos-launcher](https://github.com/partridgeworks/webos-launcher)'s catalogue (MIT).

**The apps' own icons.** On a rooted TV with the Homebrew Channel, the app also
reads each app's icon from the TV (the method [Hearth](https://github.com/rudra-avatar/Hearth)
uses) and shows it instead of the monogram, on the home screen and in Settings. This
includes tiles you already have, such as Netflix or YouTube. The glow when selected
uses the tile's `color`, or a colour taken from the icon. Icons are kept on the TV so
they appear instantly, and refreshed in the background once a day. HDMI inputs,
Live TV and console tiles keep their line icons. A tile that runs a webhook and
then opens an app gets that app's icon. Only icon paths from the TV's own
list are read, anything unusual is skipped, and nothing else is run as root. Set
`useTvIcons: false` in `config.js` to keep the monograms. Without root there's no
permitted way to read another app's icon, so the monograms stay.

The **TV inputs** tab asks the TV for its inputs, so they appear with the names
you've set in the TV's input settings (e.g. "PlayStation 5" for HDMI 2). If the TV
won't say, it shows Live TV and HDMI 1–3.

### Home Assistant list

Use this for extra tiles kept in Home Assistant: webhook buttons, scenes, a console
that needs a webhook and then an HDMI input, and so on.

1. Copy `home-assistant/tvhome-apps.js` to Home Assistant's www folder:
   `/config/www/tvhome-apps.js`. If the www folder is new, restart Home Assistant
   once so it starts serving `/local/`.
2. Edit the list in that file. Each entry is a tile in the same format as
   `config.js` (`name` plus `app`, `webhook` or `actions`; optional `color`,
   `symbol`, `glyph`).
3. On the TV, Settings → Home Assistant shows the list (it's re-read each time you
   pick that tab). Press OK on an entry to add it to the current section.

The file is loaded as a script (`window.TVHOME_APPS = [...]`), which is what lets the
TV read it without any CORS settings in Home Assistant. To use a different path, set
`homeAssistant.appsList` in `config.js`. A `.json` URL works too, but then Home
Assistant has to allow CORS for it.

## 3. Install on the TV

You need a free LG developer account and the TV in Developer Mode. The full steps
are in the [webOS Brew guide](https://www.webosbrew.org/devmode/); in short:

1. Install the **Developer Mode** app from the LG Content Store, sign in, turn
   Dev Mode on (the TV restarts), then turn on **Key Server**.
2. On your computer: `npm install -g @webos-tools/cli`
3. `ares-setup-device` and add the TV (name it `tv`, user `prisoner`, port 9922;
   use the TV's IP), then `ares-novacom --device tv --getkey` and enter the
   passphrase shown in the Developer Mode app.
4. From the folder that contains `web-osome/`:

```
ares-package web-osome
ares-install --device tv net.local.tvhome_1.0.0_all.ipk
ares-launch  --device tv net.local.tvhome
```

After that, **TV Home** appears in the TV's app list.

The package includes the web editor's service (`service/`), which
`ares-package` picks up from the app folder. If TV Home's **Phone & laptop** screen
later says the editor isn't installed, package the service explicitly:
`ares-package web-osome web-osome/service`.

**The catch with Developer Mode:** its session is time-limited, and when it
expires the TV removes apps installed this way. Renew it from the Developer Mode
app (sources I found disagree on the length: 1000 hours on webOS Brew, 50 hours in
an older write-up, so check your own timer). If you'd rather not remember,
[this write-up](https://elis.nu/blog/2022/07/keeping-webos-developer-mode-alive-with-home-assistant/)
automates renewal from Home Assistant.

## 4. Open it when the TV turns on

### Rooted TV: Homebrew Channel startup script (recommended)

Run this once in a root shell (webOS Dev Manager → Terminal):

```
sh /media/developer/apps/usr/palm/applications/net.local.tvhome/startup/install.sh
```

From then on TV Home opens when the TV starts **and** whenever it's switched on from
standby. That matters because with LG's *Quick Start+* setting on, switching the TV on
is a wake from standby rather than a fresh start, so a start-up script alone would
only fire after a full restart.

How it works: `install.sh` puts a tiny hook in `/var/lib/webosbrew/init.d/50-tvhome`.
At start-up the Homebrew Channel runs it, and it starts `startup/autostart.sh` in the
background, then exits immediately. That matters: the Homebrew Channel only clears its
crash-protection flag once every start-up script has finished, so a script that kept
running would put the next start in failsafe mode. The watcher listens to the TV's
power state, and when the TV comes back on from standby it opens TV Home straight
away. For the next 10 seconds it checks what's on screen: if the TV's own start-up
puts LG's home screen or Live TV over TV Home, it opens TV Home again, and the same for an
app the TV reopens by itself in the first 5 seconds (e.g. Netflix with *Last source*). When
you press power off, it opens TV Home at once, so TV Home is the last app and the TV wakes on it.
An HDMI input (e.g. a console that woke the TV over HDMI-CEC) or an app you pick
yourself after that is left alone. It doesn't do this when the screen comes back from *Screen Off* (e.g.
music playing with the screen off) or the screen saver.

- **Settings** are at the top of `startup/autostart.sh`: the delays (0 by default),
  `GUARD` (how long it keeps checking after opening), `APP_GUARD` (how long it takes
  the screen back from apps; this also overrides an app button used to switch on), and
  `SKIP_IF_HDMI=1` if a console that switches the TV on over HDMI-CEC should keep
  its input rather than being covered by TV Home.
- **Check it's working:** `cat /tmp/tvhome-autostart.log` shows each power change
  and when TV Home was opened. It's cleared when the TV restarts.
- **Remove it:** `sh /media/developer/apps/usr/palm/applications/net.local.tvhome/startup/uninstall.sh`
- **After reinstalling the app** nothing needs redoing; the hook points at the
  app's folder and does nothing if the app has been removed.
- If you used the Home Assistant automation below, turn it off so the two don't
  both open the app.

### Faster: TV Home as an input

TV Home adds itself to the TV's list of inputs the first time it opens. Set the TV's
start-up to **Last source** (instead of *Home Auto Launch*) and, if TV Home was in front
when you switched off, the TV opens it directly without LG's home first. Keep the
startup script too: it covers switching off from another app.

Anything else that restarts LG's screen manager (`surface-manager`) at start-up will
crash TV Home, and the TV switches itself off after a crash. Don't restart it from an
`init.d` script.

### Without root: Home Assistant automation

Copy the first automation from `home-assistant/automations.yaml` into Home
Assistant (needs the built-in *LG webOS TV* integration). Change the entity id.
The second part of that file is a starting point for the webhook automations your
tiles call.

## 5. The Home button (needs root)

Without root, the remote's Home button always opens LG's own home screen.

On a rooted TV, **LG Input Hook** (`org.webosbrew.inputhook`, from the Homebrew
Channel) can remap it. This works on the OLED55A2:

1. Open LG Input Hook, press Home once, and find the Home button's ID in its logs.
2. Add a keybind for that ID, choose **Execute**, and enter:
   ```
   luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"net.local.tvhome"}'
   ```
3. Save changes. Input Hook keeps working after a restart once it has been opened.

Pressing Home then brings up TV Home from anywhere, with the focus on the app you
were on (after a restart, the first app of the top section). Pressing Home again while TV Home
is already open returns it to the top section. The **LG Home** tile (which can't be removed) is how
you reach LG's own home screen.

Whether your TV can be rooted depends on its exact firmware: LG has patched the
known exploits in newer releases, and **updating the firmware can close the door**.
Check your model and firmware version at https://canirootmy.tv before changing
anything, and do not accept TV software updates until you know.

## 6. Web editor: edit from a phone or laptop (needs root)

TV Home includes a small service that runs on the TV and serves an editor page on
your network. From it you can:

- add, rename, reorder and delete **sections**;
- add apps (from the TV's apps, its inputs, your Home Assistant list, or a custom
  app ID / webhook / steps), rename them, reorder them and move them between sections;
- change each app's **icon**: the TV's own icon, a built-in symbol, short text, or a
  picture you upload (shown in white, or in its own colours), plus its colour;
- see and delete **uploaded pictures** (ones in use as the background or on an app
  are protected until you change that and save);
- change the **background** (upload a photo; it's cropped to 16:9), apps per row,
  the dim timer, TV icons on/off, and the Home Assistant address and list file.

Press **Save** and the TV updates within a second. Changes made in Settings on the TV
appear in the editor too. If both change at once, the editor asks which to keep.

**Setting it up.** Install the app as usual, then run the install script once (the
same one as in section 4; it also makes the service run as root and starts it at
power-on):

```
sh /media/developer/apps/usr/palm/applications/net.local.tvhome/startup/install.sh
```

**Signing in.** On the TV, open Settings and choose **Phone & laptop**. Scan the QR
code with your phone's camera: it contains the address and the password, so it signs
you in straight away. On a laptop, open the address shown (e.g.
`http://192.168.1.50:8419`) and type the 8-character password. **New password** on
either screen signs out every other device.

**Where things are kept.** The layout, settings and uploaded pictures are saved on the
TV in `/home/root/.config/tvhome/`, so they survive reinstalling the app. They take
priority over `config.js`, which only supplies the starting layout (the first time,
TV Home gives the service its current layout). "Reset to defaults" in the TV's
Settings goes back to the `config.js` sections.

**Notes**

- The service needs root. After reinstalling the app, TV Home asks the Homebrew
  Channel to grant it again by itself the next time it opens.
- The editor is plain HTTP on your home network, protected by the password. Anyone
  on your Wi-Fi who has the password (or the QR code) can change the home screen,
  so use **New password** if you've shown it to someone you'd rather not.
- After 10 wrong passwords from one device, sign-in pauses for 10 minutes.
- If the editor says it's waiting for the TV, open TV Home on the TV once.
- The service's log is `/tmp/tvhome-service.log`.
- While the TV is off or in standby, or another app or input is in front, the service stops
  checking the calendar, weather and bins, and catches up as soon as TV Home is back. TV Home
  itself pauses its clock and Home Assistant checks while another app is in front.


## 6b. Plugins: adding and removing tiles

Every tile around the dock is a plugin, a folder in `plugins/`: `clock`, `greeting`,
`weather`, `calendar`, `bins` and `nowplaying`. Each folder has everything for its tile:
the code and styling on the home screen, its part of the service, and its card in the web
editor. **Delete a folder and that tile is gone; put it back (or add a new one) and it
appears.** The service checks the folder every 30 seconds and TV Home rearranges itself:
the right-hand column closes up, the clock bar fits what's left, and the editor's Settings
show only the installed plugins' cards (Settings → Plugins lists them). A removed plugin's
settings are kept, so putting it back brings them back.

How to write one is in [`plugins/README.md`](../plugins/README.md).

## 7. Calendar: the next few events (needs the web editor's service)

The home screen can show the next events from a shared calendar in a glass panel under the clock. The TV Home service fetches the calendar every 15 minutes and drops events once they've finished. With no calendar link, the panel stays hidden.

**iCloud (Apple) shared calendar:**

1. On the iPhone of the person who **created** the shared calendar, open Calendar → **Calendars** → tap **ⓘ** next to it. On a Mac: right-click the calendar → Share Calendar.
2. Turn on **Public Calendar**, tap **Share Link…** and **Copy**. The link starts with `webcal://p…-caldav.icloud.com/published/2/…`.
3. In the web editor go to **Settings → Calendar**, paste the link, tap **Check the link** to preview the events, pick how many to show (1–6, default 3) and press **Save**.

Anyone who has the link can read the calendar, so keep it private. It's saved only on the TV. Events from Google or Outlook calendars work too: use their secret iCal/.ics address.

Times show in the TV's time zone in 24-hour format, for example "Today · 19:00", "Tomorrow · All day", "Sat 31 Oct · 10:30", or "Now · until 20:00" while an event is on. Repeating events, exceptions, moved occurrences and cancelled events are handled. When the picture behind the panel is light, the panel switches to light glass with dark text, the same way the clock does.

## 8. Now playing on a Yamaha MusicCast amplifier (needs the web editor's service)

A glass card on the right, under the calendar, shows what the amplifier is playing: the artwork, track, artist and album, the source (Spotify, AirPlay, Net Radio, Bluetooth, USB and so on) and a progress bar. DAB/FM radio shows the station name and the scrolling text. CD shows the track. The card hides while the amp is in standby, stopped, or on the TV or another HDMI input.

1. Find the amp's IP address in the MusicCast app (Settings → your device → Network) or in your router. A fixed or reserved IP address keeps it from changing.
2. In the web editor go to **Settings → Now playing**, enter the IP address (for example `192.168.1.20`), tap **Check the amplifier**, then **Save**.

The TV asks the amp through its local API (`/YamahaExtendedControl/v1/…`) every 3 seconds while the home screen is showing, every 8 seconds when nothing is playing, and not at all while another app is open. If the calendar and the card don't both fit, the calendar shows fewer events.

## 9. Weather (needs the web editor's service)

It shows the weather now plus the next hour, and together with the settings button it lines up with the panels below. In the web editor go to **Settings → Weather**, search for your town, tap the right result and **Save**. **Turn off** hides it again. The forecast comes from [Open-Meteo](https://open-meteo.com), which is free and needs no account. It's fetched every 15 minutes and shown in °C.

## OLED care

- **Pixel shift:** the whole home screen moves together by at most 2 pixels, one step every 5 minutes, gliding over a minute, so you can't see it move.
- **Idle dim** (Settings → Home screen → Dim the screen after): a dark layer fades over everything, so every part dims by the same amount. Any key press wakes it.

## 10. Background layout

In the web editor, **Settings → Background** has a live preview of the screen and these options:

| Layout | What it does |
|---|---|
| **Fill** (default) | Covers the screen. Whatever doesn't fit the 16:9 shape is cropped. |
| **Fit** | The whole picture, with edges where its shape differs from the TV's |
| **Stretch** | Squashed or stretched to the screen's shape |
| **Centre** | At the picture's own size, in the middle |
| **Tile** | Repeated from the middle of the screen. Pictures bigger than the screen are shrunk to fit first; small patterns keep their size. |

For **Fit** and **Centre**, the **Edges** can be a **plain colour** (8 swatches or any colour) or a **blurred picture**: a soft, darkened copy of the picture fills the edges. **Tile** uses the colour behind see-through PNGs. With no picture, the whole background is the colour you choose. Automatic text switches to dark text on a light colour.

Uploads keep their shape. Large pictures are scaled down to about screen size, at most 3840 on the long side, and never scaled up. Small PNG patterns stay PNG. The TV measures the brightness behind the text and paints the glass panels from the background as it's laid out, so both follow the layout you pick.

## 11. Bins reminder (from Home Assistant)

From the evening before a collection (16:00 by default) until the morning of it (09:00), a card at the top right shows **Bins out tonight**, then **Bin day today**, with a coloured wheelie bin for each bin and their names. It's hidden the rest of the time.

It reads the dates from Home Assistant, using any of:
- **a sensor with every bin's date**, e.g. the *Raw JSON* sensor from [UK Bin Collection Data](https://github.com/robbrad/UKBinCollectionData): `{"Green Bin": "30/10/2026", "Blue Bin": ...}`. The bins are named as in the sensor.
- **one calendar per bin**, each named after its bin.
- **one calendar whose events name the bins**. The [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule) integration (HACS) supports most UK councils and creates one. Any HA calendar works where each event is a bin (e.g. "General Waste"); "Recycling, Food caddy" in one event counts as two bins.

Setup, in the web editor under **Settings → Bins**:
1. In Home Assistant: your profile → **Security** → **Long-lived access tokens** → **Create token**. In the web editor, paste it under **Settings → Home Assistant** and tap **Save token**. It's stored only on the TV, in a private file, and is never sent to the TV app or shown in the editor again. **Remove token** deletes it.
2. **Load calendars** (bin sensors are listed too) and tick the ones you want: a bin sensor, or each bin's calendar. The name box is the bin's name on the TV, and starts as the calendar's name. Leave it empty to use the event titles instead. Then **Show next collections** to check. A calendar with nothing in the next 8 weeks is listed as such; it isn't an error, and it shows up again once Home Assistant has its next date. Some integrations only show the next date on the calendar's state, and that's read too. If a calendar fails, Home Assistant's own message is shown and the other calendars still work.
3. Optionally, change the reminder times and each bin's colour (Automatic guesses from the name: general/black → grey, recycling → blue, garden → green, food → brown, glass → purple). Then **Save**.

The TV Home service checks the calendar every 30 minutes, using the Home Assistant address under Settings → Home Assistant.

If a bin's next date is more than 8 weeks away, it's left out, and the editor's check says so. With UK Bin Collection Data, a bin collected today can briefly show the same date next year (e.g. 23/10/2027). That means the integration hasn't got the real next date yet, and it usually corrects itself once the council's website updates.
