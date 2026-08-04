// Two things only: reveal blocks as they arrive, and ink the route line in step
// with how far down the day you have read.
//
// Everything here is an enhancement. With JavaScript off, the CSS leaves the
// content visible and the route drawn as a plain stretched curve.
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || !('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  // ── Reveal ──────────────────────────────────────────────────────────────
  var revealer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      revealer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });

  document.querySelectorAll('.reveal').forEach(function (el) { revealer.observe(el); });

  // ── The route ───────────────────────────────────────────────────────────
  var track = document.querySelector('.passage__track');
  var svg   = document.querySelector('.route');
  var line  = document.querySelector('.route__line');
  var legs  = Array.prototype.slice.call(document.querySelectorAll('.leg'));
  if (!track || !svg || !line) return;

  // The path is rebuilt at the track's real pixel height rather than stretched
  // from a fixed viewBox. A stretched viewBox distorts the drawn wobble, and
  // dash lengths stop matching the path once the two axes scale differently.
  var WAVE = 620;   // px per half meander
  var AMP  = 0.30;  // sideways swing, as a share of the gutter width

  var length = 0;
  var samples = [];   // y → x along the route, so the marks can sit on it

  function build() {
    var height = Math.round(track.getBoundingClientRect().height);
    var width  = Math.round(svg.getBoundingClientRect().width);
    if (height < 2 || width < 2) return false;

    var mid = width / 2;
    var amp = width * AMP;
    var steps = Math.max(2, Math.round(height / WAVE));
    var span = height / steps;

    var d = 'M' + mid + ' 0';
    for (var i = 0; i < steps; i++) {
      var y0 = i * span;
      var y1 = (i + 1) * span;
      var x = mid + (i % 2 ? -amp : amp);
      d += ' C' + x.toFixed(1) + ' ' + (y0 + span * 0.35).toFixed(1) +
           ', ' + x.toFixed(1) + ' ' + (y1 - span * 0.35).toFixed(1) +
           ', ' + mid + ' ' + y1.toFixed(1);
    }

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    line.setAttribute('d', d);
    length = line.getTotalLength();

    // Sample the route so each anchorage mark can sit on the line instead of
    // beside it. The path only ever descends, so a plain lookup by y works.
    samples = [];
    var n = 240;
    for (var s = 0; s <= n; s++) {
      var pt = line.getPointAtLength((s / n) * length);
      samples.push([pt.y, pt.x]);
    }

    legs.forEach(function (leg) {
      var dot = leg.querySelector('.leg__dot');
      if (!dot) return;
      var y = dot.getBoundingClientRect().top + dot.offsetHeight / 2 -
              track.getBoundingClientRect().top;
      dot.style.setProperty('--x', (xAt(y) - width / 2).toFixed(1) + 'px');
    });

    return true;
  }

  function xAt(y) {
    if (!samples.length) return 0;
    if (y <= samples[0][0]) return samples[0][1];
    for (var i = 1; i < samples.length; i++) {
      if (samples[i][0] >= y) {
        var a = samples[i - 1], b = samples[i];
        var t = (y - a[0]) / ((b[0] - a[0]) || 1);
        return a[1] + (b[1] - a[1]) * t;
      }
    }
    return samples[samples.length - 1][1];
  }

  var pending = false;

  function draw() {
    pending = false;
    if (!length) return;

    var box = track.getBoundingClientRect();
    var pen = window.innerHeight * 0.62;   // where the nib sits on screen
    var progress = Math.max(0, Math.min(1, (pen - box.top) / box.height));

    line.style.strokeDasharray = (progress * length).toFixed(1) + ' ' + length.toFixed(1);

    legs.forEach(function (leg) {
      var dot = leg.querySelector('.leg__dot');
      if (dot) leg.classList.toggle('is-reached', dot.getBoundingClientRect().top <= pen);
    });
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(draw);
  }

  function rebuild() {
    if (build()) draw();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', rebuild);

  // Images land after first paint and change the track's height, so measure
  // again once they have.
  if (document.readyState === 'complete') rebuild();
  else window.addEventListener('load', rebuild);

  if ('ResizeObserver' in window) new ResizeObserver(rebuild).observe(track);

  rebuild();
})();
