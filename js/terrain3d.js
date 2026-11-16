/*
 * terrain3d.js — a 3D view of the elevation grid, drawn on a plain canvas.
 * No libraries: the surface is a grid of four-sided tiles painted far to near.
 *
 * Drag to rotate and tilt. The route, science stops, habitat and current
 * position are drawn on top at their real heights.
 *
 * options.getScene() -> { path: [{lat, lon}], stops: [{lat, lon, label}],
 *                         habitat: {lat, lon}, position: {lat, lon} | null }
 * options.limits     -> { cautionDeg, limitDeg }
 */
window.ARES = window.ARES || {};

ARES.createTerrainView = function (terrain, options) {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var view = $('terrainView'), canvas = $('terrainCanvas'), ctx = canvas.getContext('2d');
  var N = terrain.size;
  var midM = (terrain.minM + terrain.maxM) / 2;
  var extentM = N * terrain.cellNorthM;
  var camera = { yaw: -0.55, pitch: 0.62, zoom: 1.35, exaggeration: 2, mode: 'elevation' };
  var HEIGHTS = [1, 2, 4];

  /* Tile colours for both modes, computed once. Shading uses a fixed sun in the north-west. */
  var colours = { elevation: new Array((N - 1) * (N - 1)), slope: new Array((N - 1) * (N - 1)) };
  (function buildColours() {
    var ramp = [[58, 36, 26], [126, 78, 50], [196, 136, 84], [236, 208, 166]]; // low to high, Mars tones
    function mix(t) {
      var x = Math.max(0, Math.min(0.9999, t)) * (ramp.length - 1), k = Math.floor(x), f = x - k;
      return ramp[k].map(function (c, n) { return c + (ramp[k + 1][n] - c) * f; });
    }
    function css(rgb, shade) {
      return 'rgb(' + rgb.map(function (c) { return Math.max(0, Math.min(255, Math.round(c * shade))); }).join(',') + ')';
    }
    for (var i = 0; i < N - 1; i++) for (var j = 0; j < N - 1; j++) {
      var h = (terrain.height(i, j) + terrain.height(i + 1, j) + terrain.height(i, j + 1) + terrain.height(i + 1, j + 1)) / 4;
      var east = (terrain.height(i, j + 1) + terrain.height(i + 1, j + 1) - terrain.height(i, j) - terrain.height(i + 1, j)) / (2 * terrain.cellEastM);
      var north = (terrain.height(i, j) + terrain.height(i, j + 1) - terrain.height(i + 1, j) - terrain.height(i + 1, j + 1)) / (2 * terrain.cellNorthM);
      var shade = Math.max(0.55, Math.min(1.25, 0.9 + 2.2 * (north - east) / Math.SQRT2)); // lit from the north-west
      var slope = Math.atan(Math.sqrt(east * east + north * north)) * 180 / Math.PI;
      colours.elevation[i * (N - 1) + j] = css(mix((h - terrain.minM) / (terrain.maxM - terrain.minM)), shade);
      colours.slope[i * (N - 1) + j] = slope >= options.limits.limitDeg ? css([255, 92, 77], 1)
        : slope >= options.limits.cautionDeg ? css([237, 150, 120], 1)
        : slope >= 10 ? css([232, 184, 74], 1) : css([92, 104, 108], shade);
    }
  })();

  var sx = new Float32Array(N * N), sy = new Float32Array(N * N);
  var frame = { w: 0, h: 0, scale: 1, cos: 1, sin: 0, sinP: 1, cosP: 0 };

  /** World metres (east, north, up) to canvas pixels. */
  function project(eastM, northM, upM) {
    var xr = eastM * frame.cos - northM * frame.sin;
    var yr = eastM * frame.sin + northM * frame.cos;
    return [frame.w / 2 + xr * frame.scale,
      frame.h / 2 - (yr * frame.sinP + upM * camera.exaggeration * frame.cosP) * frame.scale];
  }
  function projectPoint(point, liftM) {
    var h = terrain.elevationAt(point.lat, point.lon);
    if (h === null) return null; // outside the grid: not drawn
    var eastM = ((point.lon - terrain.bounds.west) / (terrain.bounds.east - terrain.bounds.west) - 0.5) * N * terrain.cellEastM;
    var northM = (0.5 - (terrain.bounds.north - point.lat) / (terrain.bounds.north - terrain.bounds.south)) * N * terrain.cellNorthM;
    return project(eastM, northM, h - midM + (liftM || 0));
  }

  function draw() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    frame.w = w; frame.h = h;
    frame.scale = camera.zoom * Math.min(w, h) / (extentM * 1.15);
    frame.cos = Math.cos(camera.yaw); frame.sin = Math.sin(camera.yaw);
    frame.sinP = Math.sin(camera.pitch); frame.cosP = Math.cos(camera.pitch);

    for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
      var p = project((j + 0.5 - N / 2) * terrain.cellEastM, (N / 2 - i - 0.5) * terrain.cellNorthM, terrain.height(i, j) - midM);
      sx[i * N + j] = p[0]; sy[i * N + j] = p[1];
    }

    // Paint far tiles first so near ground covers what is behind it.
    var palette = colours[camera.mode];
    var jFarFirst = frame.sin > 0 ? -1 : 1, iFarFirst = frame.cos > 0 ? 1 : -1;
    ctx.lineWidth = 0.6;
    for (var a = 0; a < N - 1; a++) {
      var ti = iFarFirst > 0 ? a : N - 2 - a;
      for (var b = 0; b < N - 1; b++) {
        var tj = jFarFirst > 0 ? b : N - 2 - b;
        var k = ti * N + tj;
        ctx.beginPath();
        ctx.moveTo(sx[k], sy[k]); ctx.lineTo(sx[k + 1], sy[k + 1]);
        ctx.lineTo(sx[k + N + 1], sy[k + N + 1]); ctx.lineTo(sx[k + N], sy[k + N]);
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle = palette[ti * (N - 1) + tj];
        ctx.fill(); ctx.stroke();
      }
    }
    drawScene();
    drawNorth();
  }

  function drawScene() {
    var scene = options.getScene();
    var line = scene.path.map(function (p) { return projectPoint(p, 4); }).filter(Boolean);
    if (line.length > 1) {
      [['#03121b', 7], ['#6be3ee', 3.5]].forEach(function (style) {
        ctx.beginPath();
        line.forEach(function (p, n) { if (n) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
        ctx.strokeStyle = style[0]; ctx.lineWidth = style[1]; ctx.lineJoin = 'round'; ctx.stroke();
      });
    }
    ctx.font = '600 14px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    scene.stops.concat([{ lat: scene.habitat.lat, lon: scene.habitat.lon, label: 'H', habitat: true }]).forEach(function (stop) {
      var p = projectPoint(stop, 0);
      if (!p) return;
      var top = p[1] - 30; // a pin: stem from the ground up to the label
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], top);
      ctx.strokeStyle = '#03121b'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#adfaff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath();
      if (stop.habitat) ctx.rect(p[0] - 13, top - 13, 26, 26); else ctx.arc(p[0], top, 14, 0, Math.PI * 2);
      ctx.fillStyle = stop.habitat ? '#6be3ee' : '#03121b'; ctx.fill();
      ctx.strokeStyle = '#adfaff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = stop.habitat ? '#03121b' : '#d9fcff';
      ctx.fillText(stop.label, p[0], top + 1);
    });
    if (scene.position) {
      var here = projectPoint(scene.position, 6);
      if (here) {
        ctx.beginPath(); ctx.arc(here[0], here[1], 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ffca65'; ctx.fill();
        ctx.strokeStyle = '#03121b'; ctx.lineWidth = 3; ctx.stroke();
      }
    }
  }

  function drawNorth() {
    var cx = 44, cy = frame.h - 48, len = 24;
    var dx = -frame.sin * len, dy = -frame.cos * frame.sinP * len; // north on screen
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fillStyle = '#03121bcc'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy);
    ctx.strokeStyle = '#adfaff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#adfaff'; ctx.fill();
    ctx.fillStyle = '#d9fcff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', cx + dx * 1.55, cy + dy * 1.55);
  }

  var pending = false;
  function redraw() {
    if (pending || !view.open) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; draw(); });
  }
  function clampCamera() {
    camera.pitch = Math.max(0.3, Math.min(1.5, camera.pitch));
    camera.zoom = Math.max(0.6, Math.min(6, camera.zoom));
  }
  function labels() {
    $('terrainHeight').textContent = 'Height ×' + camera.exaggeration;
    $('terrainColour').textContent = camera.mode === 'elevation' ? 'Show slope' : 'Show elevation';
    $('terrainLegend').textContent = camera.mode === 'elevation'
      ? 'Colour: dark is low, pale is high (' + Math.round(terrain.minM) + ' to ' + Math.round(terrain.maxM) + ' m).'
      : 'Colour: yellow 10°+, orange ' + options.limits.cautionDeg + '°+, red ' + options.limits.limitDeg + '°+ (over the suit slope limit).';
    $('terrainLegend').textContent += ' Height is exaggerated ×' + camera.exaggeration + '. Guidance only: rocks and ledges are not resolved.';
  }

  /* Drag to rotate and tilt; wheel or the buttons to zoom. */
  var drag = null;
  canvas.addEventListener('pointerdown', function (event) {
    drag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!drag) return;
    camera.yaw += (event.clientX - drag.x) * 0.008;
    camera.pitch += (event.clientY - drag.y) * 0.006;
    drag = { x: event.clientX, y: event.clientY };
    clampCamera(); redraw();
  });
  ['pointerup', 'pointercancel'].forEach(function (name) { canvas.addEventListener(name, function () { drag = null; }); });
  canvas.addEventListener('wheel', function (event) {
    event.preventDefault();
    camera.zoom *= event.deltaY < 0 ? 1.12 : 1 / 1.12;
    clampCamera(); redraw();
  }, { passive: false });

  var buttons = {
    terrainLeft: function () { camera.yaw -= 0.26; }, terrainRight: function () { camera.yaw += 0.26; },
    terrainUp: function () { camera.pitch += 0.15; }, terrainDown: function () { camera.pitch -= 0.15; },
    terrainIn: function () { camera.zoom *= 1.3; }, terrainOut: function () { camera.zoom /= 1.3; },
    terrainHeight: function () { camera.exaggeration = HEIGHTS[(HEIGHTS.indexOf(camera.exaggeration) + 1) % HEIGHTS.length]; },
    terrainColour: function () { camera.mode = camera.mode === 'elevation' ? 'slope' : 'elevation'; }
  };
  Object.keys(buttons).forEach(function (id) {
    $(id).addEventListener('click', function () { buttons[id](); clampCamera(); labels(); redraw(); });
  });
  $('closeTerrain').addEventListener('click', function () { view.close(); });
  window.addEventListener('resize', redraw);
  window.addEventListener('ares:planchange', redraw);

  return {
    open: function () { if (view.open) return; labels(); view.showModal(); draw(); },
    redraw: redraw
  };
};
