/* Hello, world! plugin: the smallest useful example of a tile.
   It's a glass card in the right-hand column (under the others, because its order in
   plugin.json is 40), showing a greeting and how long TV Home has been open.
   Copy this folder into plugins/ to show it; delete it there and the column closes up by itself. */
TVHOME.plugin({
  id: 'hello',                   // the folder name
  region: 'right',               // the column on the right
  tag: 'section',
  attrs: { id: 'hello', 'aria-label': 'Hello' },
  glass: true,                   // the blurred-glass background, like the other panels
  tone: 'music',                 // dark text when the picture behind the bottom right is light
  html: '<div class="hello-title">Hello, world!</div><div class="hello-sub" id="hello-sub"></div>',

  start: function (api) {
    this.since = Date.now();
    api.show(true);              // tiles in the column start hidden; this one always shows
  },
  // called once a minute (and once at the start)
  onMinute: function () {
    var mins = Math.floor((Date.now() - (this.since || Date.now())) / 60000);
    this.api.$('hello-sub').textContent = mins < 1 ? 'TV Home just opened' : 'TV Home has been open for ' + mins + ' min';
  }
});
