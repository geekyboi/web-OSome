/* Clock plugin: the time (24 h) in the capsule at the top right. */
TVHOME.plugin({
  id: 'clock',
  region: 'status',
  tag: 'span',
  attrs: { id: 'time' },
  html: '--:--',

  onSecond: function (d) {
    var colon = this.api.root.querySelector('.colon');
    if (colon) { colon.classList.toggle('off', d.getSeconds() % 2 === 1); }   // the colon blinks with the seconds
  },
  onMinute: function (d) {
    var pad = this.api.util.pad;
    // each digit in its own fixed-width box: the font's digits differ in width, so otherwise the colon moves
    var dg = function (n) { return pad(n).replace(/\d/g, '<i class="dg">$&</i>'); };
    this.api.root.innerHTML = dg(d.getHours()) + '<span class="colon' + (d.getSeconds() % 2 ? ' off' : '') + '">:</span>' + dg(d.getMinutes());
    this.api.layout();
  }
});
