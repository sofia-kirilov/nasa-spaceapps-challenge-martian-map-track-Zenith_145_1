/*
 * app.js — the user interface. It wires the map, the plan panel and the live
 * NASA feeds together. Numbers live in config.js, map content in marsData.js,
 * route maths in planner.js, network calls in nasaApi.js.
 *
 * Sections, in order:
 *   1. Helpers            5. Plan panel
 *   2. State              6. Science stops (cards and inspection drawer)
 *   3. Map                7. Site conditions
 *   4. Route editing      8. Export and start-up
 */
(function () {
  'use strict';

  var config = ARES.config;
  var data = ARES.data;
  var api = ARES.api;
  var waypoints = ARES.roverTraverse.waypoints;
  var planner = ARES.createPlanner(config, waypoints);

  /* ---------- 1. Helpers ---------- */

  function $(id) { return document.getElementById(id); }

  /** Create an element. `text` is set as plain text, so API strings are never run as HTML. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatDuration(minutes) {
    var total = Math.round(minutes);
    return Math.floor(total / 60) + ' h ' + String(total % 60).padStart(2, '0') + ' min';
  }

  function formatKm(metres) { return (metres / 1000).toFixed(2) + ' km'; }

  function formatCoords(lat, lon) { return lat.toFixed(4) + '° N · ' + lon.toFixed(4) + '° E'; }

  function toStop(place) {
    return { name: place.name, lat: place.lat, lon: place.lon, stopMin: place.stopMin || 0 };
  }

  /* ---------- 2. State ---------- */

  var habitat = toStop(data.habitat);
  var state = {
    stops: [habitat],   // the plan, always starting at the habitat
    adding: false,      // true while map clicks add waypoints
    summary: null       // latest result of planner.summarize
  };

  /* ---------- 3. Map ---------- */

  // Mars Trek tiles use a plain latitude/longitude grid. Leaflet's EPSG4326 grid
  // matches it; swapping in the Mars radius makes distances and the scale bar correct.
  var marsCrs = L.extend({}, L.CRS.EPSG4326, { R: config.mars.radiusM });

  var map = L.map('map', {
    crs: marsCrs,
    center: config.map.center,
    zoom: config.map.zoom,
    minZoom: config.map.minZoom,
    maxZoom: config.map.maxZoom
  });
  L.control.scale({ imperial: false }).addTo(map);
  map.attributionControl.setPrefix('');
  map.attributionControl.addAttribution('NASA/JPL-Caltech · Mars Trek · USGS');

  var routeLayer = L.layerGroup().addTo(map);

  /** Build one Leaflet tile layer from a marsData.tileLayers entry. */
  function createTileLayer(layer, zIndex) {
    var url = config.api.trekTiles + '/' + layer.id +
      '/1.0.0/default/default028mm/{z}/{y}/{x}.' + layer.ext;
    var options = {
      tileSize: 256,
      maxNativeZoom: layer.maxNativeZoom,
      maxZoom: config.map.maxZoom,
      opacity: layer.opacity / 100,
      zIndex: zIndex,
      noWrap: true
    };
    if (layer.bounds) {
      options.bounds = [[layer.bounds[0], layer.bounds[1]], [layer.bounds[2], layer.bounds[3]]];
    }
    return L.tileLayer(url, options);
  }

  function tiltClass(tilt) {
    if (tilt >= config.slope.cautionDeg) return 'steep';
    if (tilt >= 10) return 'caution';
    return 'ok';
  }

  var TILT_COLORS = { ok: '#d2e6a5', caution: '#e8b84a', steep: '#ed9678' };

  /** The rover's path and every stop, coloured by the tilt it measured there. */
  function createRoverLayer() {
    var group = L.layerGroup();
    L.polyline(waypoints.map(function (w) { return [w.lat, w.lon]; }), {
      color: '#f4eed7', weight: 1.5, opacity: 0.7, dashArray: '4 4', interactive: false
    }).addTo(group);
    waypoints.forEach(function (w) {
      L.circleMarker([w.lat, w.lon], {
        radius: 3, weight: 1, color: '#172522',
        fillColor: TILT_COLORS[tiltClass(w.tilt)], fillOpacity: 0.95
      }).bindTooltip('Sol ' + w.sol + ' · ' + w.elev.toFixed(0) + ' m · tilt ' + w.tilt.toFixed(1) + '°')
        .addTo(group);
    });
    return group;
  }

  function createMarkers() {
    L.marker([habitat.lat, habitat.lon], {
      icon: L.divIcon({ className: 'marker-habitat', html: '⌂', iconSize: [26, 26] }),
      title: habitat.name, zIndexOffset: 500
    }).addTo(map).on('click', function () { addStop(habitat); });

    data.targets.forEach(function (target) {
      L.marker([target.lat, target.lon], {
        icon: L.divIcon({ className: 'marker-target', html: target.id, iconSize: [26, 26] }),
        title: target.name, zIndexOffset: 400
      }).addTo(map).on('click', function () { inspect(target); });
    });
  }

  /** One row in the layers panel: checkbox plus opacity slider. */
  function addLayerControl(spec) {
    var row = el('div', 'layer');
    var head = el('div', 'layer-head');
    var box = el('input');
    box.type = 'checkbox';
    box.id = 'layer-' + spec.key;
    box.checked = spec.on;
    var label = el('label', null, spec.name);
    label.htmlFor = box.id;
    head.append(box, label);

    var detail = el('small', null, spec.detail);
    var sliderRow = el('div', 'slider-row');
    var slider = el('input');
    slider.type = 'range';
    slider.id = 'opacity-' + spec.key;
    slider.min = 0;
    slider.max = 100;
    slider.value = spec.opacity;
    slider.setAttribute('aria-label', spec.name + ' opacity');
    var output = el('output', null, spec.opacity + '%');
    sliderRow.append(slider, output);

    box.addEventListener('change', function () { spec.setVisible(box.checked); });
    slider.addEventListener('input', function () {
      output.textContent = slider.value + '%';
      spec.setOpacity(slider.value / 100);
    });

    row.append(head, detail, sliderRow);
    $('layerControls').append(row);
    spec.setVisible(spec.on);
  }

  function setUpLayers() {
    data.tileLayers.forEach(function (layer, index) {
      var tiles = createTileLayer(layer, index + 1);
      addLayerControl({
        key: layer.key, name: layer.name, detail: layer.detail, on: layer.on, opacity: layer.opacity,
        setVisible: function (on) { if (on) tiles.addTo(map); else map.removeLayer(tiles); },
        setOpacity: function (value) { tiles.setOpacity(value); }
      });
    });

    var rover = createRoverLayer();
    addLayerControl({
      key: 'rover', name: 'Perseverance path', detail: 'Mars 2020 · measured elevation and tilt',
      on: true, opacity: 100,
      setVisible: function (on) { if (on) rover.addTo(map); else map.removeLayer(rover); },
      setOpacity: function (value) {
        rover.eachLayer(function (layer) { layer.setStyle({ opacity: value * 0.7, fillOpacity: value }); });
      }
    });
  }

  function setHint(text) { $('mapHint').textContent = text; }

  var DEFAULT_HINT = 'Click a numbered marker to inspect a science stop. Click the map to read its geology.';

  function setUpMapEvents() {
    map.on('mousemove', function (event) {
      var point = { lat: event.latlng.lat, lon: event.latlng.lng };
      var text = formatCoords(point.lat, point.lon);
      var hit = ARES.geo.nearest(waypoints, point, config.mars.radiusM);
      if (hit.distanceM <= config.rover.snapRadiusM) {
        var w = waypoints[hit.index];
        text += ' · rover measured ' + w.elev.toFixed(0) + ' m, tilt ' + w.tilt.toFixed(1) + '°';
      } else {
        text += ' · no rover measurement here';
      }
      $('readout').textContent = text;
    });

    map.on('click', function (event) {
      var lat = event.latlng.lat;
      var lon = event.latlng.lng;
      if (state.adding) {
        var customCount = state.stops.filter(function (s) { return s.custom; }).length;
        addStop({ name: 'Waypoint ' + (customCount + 1), lat: lat, lon: lon, stopMin: 0, custom: true });
        return;
      }
      setHint('Looking up geology…');
      api.geologyAt(lat, lon).then(function (unit) {
        setHint(unit ? 'USGS geologic unit here: ' + unit.unit + ', ' + unit.description : 'No geologic unit mapped here.');
      }).catch(function () {
        setHint('Geology lookup failed. Check the connection and click again.');
      });
    });

    $('resetView').addEventListener('click', function () {
      map.setView(config.map.center, config.map.zoom);
    });
  }

  /* ---------- 4. Route editing ---------- */

  function addStop(stop) {
    var last = state.stops[state.stops.length - 1];
    if (last.lat === stop.lat && last.lon === stop.lon) return; // already there
    state.stops.push(stop);
    render();
  }

  function setUpRouteButtons() {
    $('addMode').addEventListener('click', function () {
      state.adding = !state.adding;
      $('addMode').classList.toggle('selected', state.adding);
      $('addMode').setAttribute('aria-pressed', String(state.adding));
      $('map').classList.toggle('adding', state.adding);
      setHint(state.adding
        ? 'Click the map to add a waypoint. Ground off the rover path counts as unverified. Press Escape to finish.'
        : DEFAULT_HINT);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.adding) $('addMode').click();
    });
    $('returnHome').addEventListener('click', function () { addStop(habitat); });
    $('undo').addEventListener('click', function () {
      if (state.stops.length > 1) state.stops.pop();
      render();
    });
    $('clear').addEventListener('click', function () {
      state.stops = [habitat];
      render();
    });
    $('demo').addEventListener('click', function () {
      var pick = function (id) {
        return toStop(data.targets.filter(function (t) { return t.id === id; })[0]);
      };
      state.stops = [habitat, pick('02'), pick('03'), pick('01'), habitat];
      render();
    });
  }

  /* ---------- 5. Plan panel ---------- */

  function drawRoute(summary) {
    routeLayer.clearLayers();
    summary.legs.forEach(function (leg) {
      var line = leg.points.map(function (p) { return [p.lat, p.lon]; });
      L.polyline(line, { color: '#19251d', weight: 7, opacity: 0.9, interactive: false }).addTo(routeLayer);
      L.polyline(line, {
        color: leg.verified ? '#d2e6a5' : '#ed9678',
        weight: 3, dashArray: leg.verified ? null : '8 6', interactive: false
      }).addTo(routeLayer);
    });
    state.stops.forEach(function (stop) {
      if (!stop.custom) return;
      L.circleMarker([stop.lat, stop.lon], {
        radius: 6, color: '#283626', weight: 2, fillColor: '#ed9678', fillOpacity: 1
      }).bindTooltip(stop.name).addTo(routeLayer);
    });
  }

  function drawRouteList() {
    var list = $('routeList');
    list.replaceChildren();
    state.stops.forEach(function (stop, index) {
      var item = el('li');
      item.append(el('b', null, index === 0 ? '⌂' : String(index).padStart(2, '0')));
      var text = el('div', null, stop.name);
      var kind = index === 0 ? 'Airlock, start'
        : stop.stopMin ? stop.stopMin + ' min science stop'
        : stop.custom ? 'Waypoint' : 'Return';
      text.append(el('small', null, kind));
      item.append(text);
      list.append(item);
    });
    $('pointCount').textContent = state.stops.length + (state.stops.length === 1 ? ' point' : ' points');
  }

  function drawStats(s) {
    var rows = [
      ['Walking', formatDuration(s.walkMin)],
      ['Science stops', formatDuration(s.stopMin)],
      ['Airlock', formatDuration(s.airlockMin)],
      ['Climb / descent', s.climbM.toFixed(0) + ' m / ' + s.descentM.toFixed(0) + ' m'],
      ['Steepest ground', s.maxSlopeDeg.toFixed(0) + '°'],
      ['Farthest from habitat', formatKm(s.farthestM)],
      ['Radiation dose', s.doseMsv.toFixed(3) + ' mSv']
    ];
    var box = $('stats');
    box.replaceChildren();
    rows.forEach(function (row) {
      var line = el('div', 'stat');
      line.append(el('span', null, row[0]), el('span', null, row[1]));
      box.append(line);
    });
  }

  function drawBudgets(s) {
    var box = $('budgets');
    box.replaceChildren();
    var reservePercent = config.eva.reserveFraction * 100;
    s.reserves.forEach(function (reserve) {
      var left = Math.max(0, reserve.percentLeft);
      var wrap = el('div', 'budget');
      var labels = el('div');
      labels.append(el('span', null, reserve.name), el('span', null, left.toFixed(0) + '%'));
      var bar = el('div', 'bar');
      var fill = el('span', left < reservePercent ? 'low' : null);
      fill.style.width = left + '%';
      bar.append(fill);
      wrap.append(labels, bar);
      box.append(wrap);
    });
    $('reserveNote').textContent = 'KEEP ' + reservePercent + '%';
  }

  /** Turn the planner's flags into plain sentences. */
  function buildAlerts(s) {
    var f = s.flags;
    var alerts = [];
    if (f.empty) {
      alerts.push(['safe', 'Ready to plan. Pick a science stop or add a waypoint.']);
      return alerts;
    }
    if (f.overLimit) alerts.push(['danger', 'Too long: ' + formatDuration(s.minutes) + ' against a ' + s.limitHours.toFixed(1) + ' h limit. Drop a stop.']);
    if (f.slopeLimit) alerts.push(['danger', 'Too steep: ' + s.maxSlopeDeg.toFixed(0) + '° on this route, limit ' + config.slope.limitDeg + '°.']);
    if (f.walkBack) alerts.push(['danger', 'Too far: ' + formatKm(s.farthestM) + ' from the habitat, walk-back limit ' + config.eva.walkBackLimitKm.toFixed(1) + ' km. This stop needs a rover.']);
    if (f.slopeCaution) alerts.push(['warn', 'Steep section: Perseverance measured ' + s.maxSlopeDeg.toFixed(0) + '° on this route. Take it slowly.']);
    if (f.unverified) alerts.push(['warn', s.unverifiedLegs + (s.unverifiedLegs === 1 ? ' leg crosses' : ' legs cross') + ' ground the rover never drove. No elevation data there; time is padded by ' + Math.round((config.walking.unverifiedPenalty - 1) * 100) + '%.']);
    if (f.open) alerts.push(['warn', 'The route does not return to the habitat yet. Press Return.']);
    if (s.go && !f.slopeCaution && !f.unverified) alerts.push(['safe', 'Go. The whole route follows ground Perseverance drove and stays inside every limit.']);
    return alerts;
  }

  function drawAlerts(s) {
    var box = $('alerts');
    box.replaceChildren();
    buildAlerts(s).forEach(function (alert) {
      box.append(el('div', 'alert ' + alert[0], alert[1]));
    });

    var verdict = $('verdict');
    var f = s.flags;
    var label = f.empty ? 'DRAFT' : !s.go ? 'NO-GO' : (f.slopeCaution || f.unverified) ? 'GO WITH CAUTION' : 'GO';
    verdict.textContent = label;
    verdict.className = 'tag ' + (label === 'NO-GO' ? 'bad' : label === 'GO' ? 'good' : label === 'DRAFT' ? '' : 'warn');
  }

  function drawProfile(s) {
    var canvas = $('profile');
    var ratio = Math.min(2, window.devicePixelRatio || 1);
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '11px Consolas, monospace';
    ctx.fillStyle = '#96a19c';
    ctx.textBaseline = 'middle';

    var points = s.profile;
    if (points.length < 2) {
      ctx.textAlign = 'center';
      ctx.fillText('Add a stop on the rover path to see measured elevation', width / 2, height / 2);
      return;
    }

    var left = 58, right = 12, top = 10, bottom = 20;
    var plotW = width - left - right;
    var plotH = height - top - bottom;
    var low = Infinity, high = -Infinity;
    points.forEach(function (p) { low = Math.min(low, p.elev); high = Math.max(high, p.elev); });
    low = Math.floor(low / 5) * 5;
    high = Math.ceil(high / 5) * 5;
    if (high - low < 10) high = low + 10;
    var total = points[points.length - 1].d || 1;
    var x = function (d) { return left + d / total * plotW; };
    var y = function (elev) { return top + (1 - (elev - low) / (high - low)) * plotH; };

    ctx.strokeStyle = '#303a3b';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    [low, (low + high) / 2, high].forEach(function (value) {
      ctx.beginPath();
      ctx.moveTo(left, y(value));
      ctx.lineTo(width - right, y(value));
      ctx.stroke();
      ctx.fillText(Math.round(value) + ' m', left - 6, y(value));
    });

    ctx.beginPath();
    points.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(x(p.d), y(p.elev)); else ctx.lineTo(x(p.d), y(p.elev));
    });
    ctx.strokeStyle = '#d2e6a5';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineTo(x(total), top + plotH);
    ctx.lineTo(left, top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(210, 230, 165, 0.14)';
    ctx.fill();

    ctx.fillStyle = '#96a19c';
    ctx.textAlign = 'left';
    ctx.fillText('0 km', left, height - 8);
    ctx.textAlign = 'right';
    ctx.fillText(formatKm(total), width - right, height - 8);
  }

  /** Recalculate the plan and redraw everything that depends on it. */
  function render() {
    var s = planner.summarize(state.stops);
    state.summary = s;
    $('distance').replaceChildren(document.createTextNode((s.distanceM / 1000).toFixed(2) + ' '), el('small', null, 'km'));
    $('duration').textContent = formatDuration(s.minutes) + ' of ' + s.limitHours.toFixed(1) + ' h';
    $('undo').disabled = state.stops.length === 1;
    drawRoute(s);
    drawRouteList();
    drawStats(s);
    drawBudgets(s);
    drawAlerts(s);
    drawProfile(s);
  }

  /* ---------- 6. Science stops ---------- */

  function createTargetCards() {
    data.targets.forEach(function (target) {
      var card = el('button', 'target-card');
      card.type = 'button';
      var thumb = el('div', 'terrain-thumb');
      thumb.append(el('span', null, target.id + ' / SOL ' + target.sol));
      var body = el('div', 'target-body');
      body.append(el('small', null, target.area), el('h3', null, target.name), el('p', null, target.rock));
      card.append(thumb, body);
      card.addEventListener('click', function () { inspect(target); });
      $('targetCards').append(card);

      // Real photo from the sol the rover sampled here. The card works without it.
      api.roverImages(target.sol, 'MCZ_LEFT', 1).then(function (images) {
        if (!images.length) return;
        var img = el('img');
        img.src = images[0].thumb;
        img.alt = 'Perseverance Mastcam-Z image, sol ' + target.sol;
        img.loading = 'lazy';
        thumb.prepend(img);
      }).catch(function () { /* leave the plain card */ });
    });
  }

  /** Open the drawer for one science stop and fill it with live data. */
  function inspect(target) {
    var box = $('drawerContent');
    box.replaceChildren();

    box.append(el('div', 'eyebrow', 'SCIENCE STOP ' + target.id));
    box.append(el('h2', null, target.name));
    box.append(el('div', 'drawer-meta', target.area + ' · ' + formatCoords(target.lat, target.lon)));

    var round = planner.summarize([habitat, toStop(target), habitat]);
    box.append(el('div', 'drawer-meta',
      'Round trip from the habitat: ' + formatKm(round.distanceM) + ', ' + formatDuration(round.minutes) +
      ', steepest ' + round.maxSlopeDeg.toFixed(0) + '°'));

    box.append(el('h3', null, 'ROCK'));
    box.append(el('p', null, target.rock));
    var geology = el('p', 'live', 'USGS geologic unit: loading…');
    box.append(geology);

    box.append(el('h3', null, 'WHY GO'));
    box.append(el('p', null, target.why));
    box.append(el('h3', null, 'WHAT TO DO THERE'));
    box.append(el('p', null, target.task + ' Plan ' + target.stopMin + ' minutes.'));

    box.append(el('h3', null, 'WHAT PERSEVERANCE SAW, SOL ' + target.sol));
    var gallery = el('div', 'gallery');
    gallery.append(el('p', 'live', 'Loading rover images…'));
    box.append(gallery);

    var add = el('button', 'primary', '＋ Add to route');
    add.type = 'button';
    add.addEventListener('click', function () {
      addStop(toStop(target));
      $('inspection').close();
    });
    box.append(add);
    box.append(el('p', 'reserve-note', 'Images: NASA/JPL-Caltech/ASU, Mastcam-Z raw frames. Position: where the rover was parked on sol ' + target.sol + '.'));

    api.geologyAt(target.lat, target.lon).then(function (unit) {
      geology.textContent = unit
        ? 'USGS geologic unit: ' + unit.unit + ', ' + unit.description + ' (global map, coarse at this scale).'
        : 'USGS geologic unit: none mapped here.';
    }).catch(function () {
      geology.textContent = 'USGS geologic unit: lookup failed.';
    });

    api.roverImages(target.sol, 'MCZ_LEFT', 6).then(function (images) {
      gallery.replaceChildren();
      if (!images.length) {
        gallery.append(el('p', 'live', 'No Mastcam-Z images listed for this sol.'));
        return;
      }
      images.forEach(function (image) {
        var link = el('a');
        link.href = image.full;
        link.target = '_blank';
        link.rel = 'noopener';
        var img = el('img');
        img.src = image.thumb;
        img.alt = 'Mastcam-Z image, sol ' + image.sol;
        img.loading = 'lazy';
        link.append(img);
        gallery.append(link);
      });
    }).catch(function () {
      gallery.replaceChildren(el('p', 'live', 'Rover images did not load. Check the connection.'));
    });

    $('inspection').showModal();
  }

  /* ---------- 7. Site conditions ---------- */

  function conditionCell(label) {
    var cell = el('div');
    cell.append(el('label', null, label));
    var value = el('strong', null, 'Loading…');
    var note = el('small', null, '');
    cell.append(value, note);
    $('conditions').append(cell);
    return { value: value, note: note };
  }

  function setUpConditions() {
    var site = conditionCell('HABITAT SITE');
    site.value.textContent = 'Three Forks';
    site.note.textContent = formatCoords(habitat.lat, habitat.lon);

    var limit = conditionCell('EVA LIMIT');
    limit.value.textContent = planner.limitHours().toFixed(1) + ' h';
    limit.note.textContent = 'shortest consumable less ' + config.eva.reserveFraction * 100 + '% reserve';

    var radiation = conditionCell('SURFACE RADIATION');
    radiation.value.textContent = config.radiation.surfaceDoseMsvPerHour + ' mSv/h';
    radiation.note.textContent = 'Curiosity RAD average';

    var weather = conditionCell('WEATHER · PERSEVERANCE MEDA');
    api.latestWeather().then(function (w) {
      if (!w) { weather.value.textContent = 'No readings'; return; }
      weather.value.textContent = w.minTempC.toFixed(0) + ' to ' + w.maxTempC.toFixed(0) + ' °C' +
        (w.pressurePa ? ' · ' + w.pressurePa.toFixed(0) + ' Pa' : '');
      weather.note.textContent = 'latest published sol ' + w.sol + ' (' + w.earthDate + ') · daylight ' +
        w.sunrise.slice(0, 5) + ' to ' + w.sunset.slice(0, 5);
    }).catch(function () {
      weather.value.textContent = 'Unavailable';
      weather.note.textContent = 'MEDA feed did not load';
    });

    var space = conditionCell('SPACE WEATHER · NASA DONKI');
    api.spaceWeather().then(function (sw) {
      space.value.textContent = sw.particleEvents
        ? sw.particleEvents + ' particle event alert' + (sw.particleEvents === 1 ? '' : 's')
        : 'No particle events';
      space.value.className = sw.particleEvents ? 'bad' : 'good';
      space.note.textContent = sw.total + (sw.total === 1 ? ' notice in ' : ' notices in ') +
        config.api.spaceWeatherDays + ' days, Sun-wide, not Mars-specific';
    }).catch(function () {
      space.value.textContent = 'Unavailable';
      space.note.textContent = 'DONKI did not load (the demo key allows 30 requests an hour)';
    });
  }

  /* ---------- 8. Export and start-up ---------- */

  function exportPlan() {
    var s = state.summary;
    var plan = {
      title: 'ARES Jezero EVA plan',
      note: 'Planning concept. Terrain from NASA Perseverance waypoints; walking and suit figures are assumptions.',
      verdict: $('verdict').textContent,
      stops: state.stops,
      distanceKm: +(s.distanceM / 1000).toFixed(3),
      durationMin: Math.round(s.minutes),
      limitHours: s.limitHours,
      steepestDeg: +s.maxSlopeDeg.toFixed(1),
      farthestFromHabitatKm: +(s.farthestM / 1000).toFixed(3),
      doseMsv: +s.doseMsv.toFixed(4),
      flags: s.flags,
      assumptions: { walking: config.walking, slope: config.slope, eva: config.eva, radiation: config.radiation }
    };
    var url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
    var link = el('a');
    link.href = url;
    link.download = 'ares-eva-plan.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function start() {
    $('scienceGoal').textContent = data.scienceGoal;
    setUpLayers();
    createMarkers();
    setUpMapEvents();
    setUpRouteButtons();
    setUpConditions();
    createTargetCards();
    $('closeDrawer').addEventListener('click', function () { $('inspection').close(); });
    $('export').addEventListener('click', exportPlan);
    window.addEventListener('resize', function () { drawProfile(state.summary); });
    setHint(DEFAULT_HINT);
    render();
  }

  start();

  // Handy in the browser console while developing: ARES.debug.state, ARES.debug.map
  ARES.debug = { state: state, map: map, planner: planner };
})();
