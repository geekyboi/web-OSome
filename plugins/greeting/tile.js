/* Greeting plugin: Good morning / afternoon / evening at the top left. */
TVHOME.plugin({
  id: 'greeting',
  region: 'stage',
  tag: 'div',
  attrs: { id: 'greeting' },
  tone: 'greet',          // dark text where the picture behind it is light
  busy: true,             // and a halo over busy pictures

  onMinute: function (d) {
    var h = d.getHours();
    var t = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    if (this.api.root.textContent !== t) { this.api.root.textContent = t; }
  }
});
