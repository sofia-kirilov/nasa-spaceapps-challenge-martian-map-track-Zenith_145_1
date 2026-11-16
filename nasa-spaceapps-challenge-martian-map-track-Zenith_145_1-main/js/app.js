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
  var crewRouter = ARES.createCrewRouter(config, waypoints);
  var offline = ARES.offline;
  var sampleLog;
  var terrain = ARES.elevationGrid ? ARES.createTerrain(ARES.elevationGrid) : null;
  var terrainView, visorControls;
  var navigation = ARES.createNavigation(config, waypoints);
  var navigationLayer;
  var positionMarker;
  var lastTick = Date.now();
  var returnRoute = null;
  var hud = ARES.createHud(config, data.habitat);
  var savedMap = offline.read('map', {});
  if (!savedMap || typeof savedMap !== 'object') savedMap = {};
  var savedLayers = offline.read('layers', {});
  if (!savedLayers || typeof savedLayers !== 'object') savedLayers = {};

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
    return Math.floor(total / 60) + ' h ' + total % 60 + ' min';
  }

  function formatKm(metres) { return (metres / 1000).toFixed(2) + ' km'; }

  function formatCoords(lat, lon) { return lat.toFixed(4) + '° N · ' + lon.toFixed(4) + '° E'; }

  function toStop(place) {
    return { name: place.name, lat: place.lat, lon: place.lon, stopMin: place.stopMin || 0 };
  }

  /* ---------- 2. State ---------- */

  var habitat = toStop(data.habitat);
  var state = {
    stops: offline.restoreRoute(habitat), // local crew plan; authoritative targets are resolved again
    adding: false,      // true while map clicks add waypoints
    summary: null       // latest result of planner.summarize
  };

  /* ---------- 3. Map ---------- */

  // Mars Trek tiles use a plain latitude/longitude grid. Leaflet's EPSG4326 grid
  // matches it; swapping in the Mars radius makes distances and the scale bar correct.
  var marsCrs = L.extend({}, L.CRS.EPSG4326, { R: config.mars.radiusM });

  var map = L.map('map', {
    crs: marsCrs,
    center: offline.validPoint(savedMap) ? [savedMap.lat, savedMap.lon] : config.map.center,
    zoom: Number.isFinite(savedMap.zoom) ? Math.max(config.map.minZoom, Math.min(config.map.maxZoom, savedMap.zoom)) : config.map.zoom,
    minZoom: config.map.minZoom,
    maxZoom: config.map.maxZoom
  });
  L.control.scale({ imperial: false }).addTo(map);
  map.attributionControl.setPrefix('');
  map.attributionControl.addAttribution('NASA/JPL-Caltech · Mars Trek · USGS');

  var routeLayer = L.layerGroup().addTo(map);
  var returnLayer = L.layerGroup().addTo(map);
  navigationLayer = L.layerGroup().addTo(map);

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
      icon: L.divIcon({ className: 'marker-habitat', html: '<span class="marker-symbol">H</span>', iconSize: [64, 64] }),
      title: habitat.name, zIndexOffset: 500
    }).addTo(map).on('click', function () { addStop(habitat); });

    data.targets.forEach(function (target) {
      L.marker([target.lat, target.lon], {
        icon: L.divIcon({ className: 'marker-target', html: '<span class="marker-symbol">' + Number(target.id) + '</span>', iconSize: [64, 64] }),
        title: target.name, zIndexOffset: 400
      }).addTo(map).on('click', function () { inspect(target); });
    });
  }

  /** One row in the layers panel: checkbox plus opacity slider. */
  function addLayerControl(spec) {
    var saved = savedLayers[spec.key];
    if (saved && typeof saved.on === 'boolean') spec.on = saved.on;
    if (saved && Number.isFinite(saved.opacity)) spec.opacity = Math.max(0, Math.min(100, saved.opacity));
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

    function saveLayer() {
      savedLayers[spec.key] = { on: box.checked, opacity: Number(slider.value) };
      offline.write('layers', savedLayers);
    }
    box.addEventListener('change', function () { spec.setVisible(box.checked); saveLayer(); });
    slider.addEventListener('input', function () {
      output.textContent = slider.value + '%';
      spec.setOpacity(slider.value / 100);
      saveLayer();
    });

    row.append(head, detail, sliderRow);
    $('layerControls').append(row);
    spec.setVisible(spec.on);
    spec.setOpacity(spec.opacity / 100);
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
    if (terrain) {
      var slope = createSlopeLayer();
      addLayerControl({
        key: 'slope', name: 'Slope guidance', on: true, opacity: 45,
        detail: 'USGS CTX elevation, 40 m cells · yellow 10°+, orange ' + config.slope.cautionDeg + '°+, red ' +
          config.slope.limitDeg + '°+ · rocks and ledges not resolved',
        setVisible: function (on) { if (on) slope.addTo(map); else map.removeLayer(slope); },
        setOpacity: function (value) { slope.setOpacity(value); }
      });
    }
  }

  /** Steep ground from the elevation grid, as a transparent picture laid over the map. */
  function createSlopeLayer() {
    var n = terrain.size;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    var ctx = canvas.getContext('2d');
    var image = ctx.createImageData(n, n);
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      var slope = terrain.slopeCell(i, j);
      var rgb = slope >= config.slope.limitDeg ? [255, 92, 77] : slope >= config.slope.cautionDeg ? [237, 150, 120]
        : slope >= 10 ? [232, 184, 74] : null;
      var k = (i * n + j) * 4;
      if (rgb) { image.data[k] = rgb[0]; image.data[k + 1] = rgb[1]; image.data[k + 2] = rgb[2]; image.data[k + 3] = 215; }
    }
    ctx.putImageData(image, 0, 0);
    var b = terrain.bounds;
    return L.imageOverlay(canvas.toDataURL(), [[b.south, b.west], [b.north, b.east]], { interactive: false, zIndex: 250 });
  }

  /** Elevation and slope from the grid for the readout, or '' outside it. */
  function terrainText(lat, lon) {
    if (!terrain) return '';
    var height = terrain.elevationAt(lat, lon), slope = terrain.slopeAt(lat, lon);
    return height === null || slope === null ? '' : 'CTX model ' + height.toFixed(0) + ' m, slope ' + slope.toFixed(0) + '°';
  }

  function setHint(text) { $('mapHint').textContent = text; }

  var DEFAULT_HINT = 'Tap a numbered marker to inspect a science stop. Tap the map to read its geology.';

  function setUpMapEvents() {
    map.on('moveend', function () {
      var center = map.getCenter();
      offline.write('map', { lat: center.lat, lon: center.lng, zoom: map.getZoom() });
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', function () {
      // Re-request visible tiles once the worker can cache this first visit.
      map.eachLayer(function (layer) { if (layer instanceof L.TileLayer) layer.redraw(); });
    });
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
      var ground = terrainText(point.lat, point.lon);
      if (ground) text += ' · ' + ground;
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
      var ground = terrainText(lat, lon);
      if (ground) $('readout').textContent = ground;
      setHint('Looking up geology…');
      api.geologyAt(lat, lon).then(function (unit) {
        setHint(unit ? 'USGS geologic unit here: ' + unit.unit + ', ' + unit.description : 'No geologic unit mapped here.');
      }).catch(function () {
        setHint('Geology lookup failed. Check the connection and tap again.');
      });
    });

    $('resetView').addEventListener('click', function () {
      map.setView(config.map.center, config.map.zoom);
    });
  }

  /* ---------- 4. Route editing ---------- */

  function positionKey(stop) { return stop.lat + ',' + stop.lon; }

  function updateHud() {
    if (!state.summary) return;
    var active = navigation.snapshot();
    var position = active ? active.position : habitat;
    hud.update({ stops: state.stops, summary: state.summary, position: position,
      routeIndex: active ? active.routeIndex : 0, navigation: active,
      returnRoute: crewRouter.fastestReturn(position, habitat) });
  }

  function drawReturn() {
    returnLayer.clearLayers();
    if (!returnRoute || !returnRoute.available || returnRoute.atBase) return;
    var line = returnRoute.points.map(function (p) { return [p.lat, p.lon]; });
    L.polyline(line, { color: '#170d0c', weight: 10, interactive: false }).addTo(returnLayer);
    L.polyline(line, { color: '#ff5c4d', weight: 6, dashArray: '12 5', interactive: false }).addTo(returnLayer);
    map.fitBounds(L.latLngBounds(line), { padding: [40, 40], maxZoom: config.map.maxZoom });
  }

  function computeReturn() {
    var active = navigation.snapshot();
    var status = $('rtbStatus');
    $('rtbPanel').hidden = false;
    status.className = '';
    if (!active) {
      status.textContent = 'Start a route first. Return to base uses your current simulated position.';
      $('navigationStatus').textContent = status.textContent;
      return;
    }
    var result = crewRouter.fastestReturn(active.position, habitat);
    if (!result.available) {
      // Keep the locked plan and exact position; no teleporting to a nearby stop.
      if (!active.paused) navigation.togglePause();
      updateNavigation();
      status.textContent = result.reason + ' Navigation is paused at your current position.';
      status.className = 'danger';
      return;
    }
    if (result.atBase) {
      if (!active.paused) navigation.togglePause();
      updateNavigation();
      status.textContent = 'You are already at Three Forks habitat. End navigation to edit your plan.';
      return;
    }
    result.from = Object.assign({}, active.position);
    returnRoute = result;
    drawReturn();
    var text = 'Returning from your current simulated position: ' + formatKm(result.distanceM) +
      ' · ' + formatDuration(result.minutes) + ' walking. Fastest on the recorded traverse using the current walking model.';
    if (result.connectorM > 0.01) text += '\nIncludes ' + result.connectorM.toFixed(1) + ' m of unverified connections to the rover path.';
    text += '\nSteepest measured ground: ' + result.maxSlopeDeg.toFixed(1) + '°. ETA excludes science stops and airlock operations.';
    if (result.maxSlopeDeg >= config.slope.limitDeg) {
      text += '\nDanger: exceeds the configured slope limit of ' + config.slope.limitDeg + '°.';
      status.className = 'danger';
    } else if (result.maxSlopeDeg >= config.slope.cautionDeg || result.connectorM > 0.01) status.className = 'warning';
    if (config.eva.consumables.some(function (c) {
      return (active.totalElapsedMin + result.minutes) / 60 > c.enduranceH * (1 - config.eva.reserveFraction);
    })) { text += '\nWarning: modeled return puts suit reserves at risk.'; status.className = 'danger'; }
    status.textContent = text;
    result.statusText = text; result.statusClass = status.className;
    navigation.beginReturn(result);
    lastTick = Date.now();
    updateNavigation();
  }

  function updateNavigation(persist) {
    var active = navigation.snapshot();
    var locked = !!active;
    $('startRoute').hidden = locked;
    $('activeNavigation').hidden = !locked;
    $('startRoute').disabled = state.summary.flags.empty || state.summary.verdict === 'No-go' || state.summary.minutes <= 0;
    ['addMode', 'returnHome', 'clear'].forEach(function (id) { $(id).disabled = locked; });
    $('undo').disabled = locked || state.stops.length === 1;
    document.querySelectorAll('.add-to-route').forEach(function (button) { button.disabled = locked; });
    if (active) {
      $('navigationMode').textContent = active.complete ? (active.mode === 'return' ? 'Arrived at habitat' : 'Traverse complete')
        : active.mode === 'return' ? 'Returning to base' : 'EVA active';
      $('navigationPercent').textContent = Math.floor(active.percent) + '%';
      $('navigationProgress').value = active.percent;
      $('navigationNext').textContent = active.complete ? 'End navigation to unlock route editing.'
        : active.phase === 'airlock' ? 'Airlock preparation at Three Forks'
        : active.phase === 'science' ? 'Science stop · ' + active.nextName
        : 'Next · ' + active.nextName + ' · ' + formatKm(active.nextDistanceM);
      $('navigationRemaining').textContent = formatKm(active.remainingDistanceM) + ' remaining · ' + formatDuration(active.remainingMin);
      $('navigationPosition').textContent = formatCoords(active.position.lat, active.position.lon);
      $('navigationStatus').textContent = active.complete ? 'Simulated route complete. Your original plan is saved.'
        : 'Route locked · simulated position · ' + (active.paused ? 'paused' : 'navigation in progress');
      $('simulationElapsed').max = String(active.totalMin);
      $('simulationElapsed').value = String(active.elapsedMin);
      $('simulationTime').textContent = formatDuration(active.elapsedMin);
      $('pauseNavigation').textContent = active.paused ? 'Resume simulation' : 'Pause simulation';
      $('pauseNavigation').disabled = active.complete;
      var latlng = [active.position.lat, active.position.lon];
      if (!positionMarker) positionMarker = L.marker(latlng, {
        icon: L.divIcon({ className: 'navigation-marker', html: '<span aria-hidden="true">↑</span>', iconSize: [40, 40], iconAnchor: [20, 20] }),
        title: 'Current simulated astronaut position', interactive: false, zIndexOffset: 1000
      }).addTo(navigationLayer);
      else positionMarker.setLatLng(latlng);
      var oxygen = config.eva.consumables.find(function (c) { return c.id === 'oxygen'; });
      var percent = Math.max(0, 100 * (1 - active.totalElapsedMin / 60 / oxygen.enduranceH));
      setSuit('Suit oxygen ' + Math.round(percent) + '% · simulated', percent < config.eva.reserveFraction * 100);
    } else {
      navigationLayer.clearLayers(); positionMarker = null;
      $('navigationStatus').textContent = state.summary.verdict === 'No-go' ? 'Resolve the route safety limits before starting.'
        : state.summary.flags.empty ? 'Add a stop, review route safety, then start your EVA.' : 'Ready to start. Review the safety notes above.';
      setSuit('Suit oxygen 100% · at habitat', false);
    }
    updateHud();
    if (visorControls) visorControls.refresh();
    if (terrainView) terrainView.redraw();
    if (persist !== false) offline.write('navigation', navigation.export());
  }

  function setSuit(text, low) {
    $('suitReadout').textContent = text;
    $('suitStatus').dataset.state = low ? 'low' : 'nominal';
    $('suitStatus').setAttribute('aria-label', text);
  }

  function setUpCrewControls() {
    $('emergencyRTB').addEventListener('click', computeReturn);
    $('startRoute').addEventListener('click', function () {
      if (!navigation.start(state.stops, state.summary)) return;
      if (state.adding) { state.adding = false; $('addMode').classList.remove('selected'); $('addMode').setAttribute('aria-pressed', 'false'); $('map').classList.remove('adding'); }
      setHint('Simulated EVA active. The cyan arrow marks your position. Return to base navigates home from here.');
      lastTick = Date.now();
      updateNavigation();
      $('pauseNavigation').focus({ preventScroll: true });
    });
    $('pauseNavigation').addEventListener('click', function () { navigation.togglePause(); lastTick = Date.now(); updateNavigation(); });
    $('simulationElapsed').addEventListener('input', function () {
      var active = navigation.snapshot();
      if (active && !active.paused) navigation.togglePause();
      navigation.seek(Number($('simulationElapsed').value));
      lastTick = Date.now(); updateNavigation();
    });
    $('endNavigation').addEventListener('click', function () {
      navigation.end(); returnRoute = null; returnLayer.clearLayers();
      $('rtbPanel').hidden = true;
      $('rtbStatus').className = '';
      $('rtbStatus').textContent = 'Start a route, then use Return to base to navigate home from your simulated position.';
      setHint(DEFAULT_HINT); updateNavigation(); $('startRoute').focus({ preventScroll: true });
    });
    setInterval(function () {
      var now = Date.now();
      // Simulation advances only while this page is visible; no background EVA jumps.
      var delta = document.hidden ? 0 : Math.min(2, Math.max(0, (now - lastTick) / 1000));
      lastTick = now;
      var active = navigation.snapshot();
      if (active && !active.paused && delta > 0) { navigation.advance(delta); updateNavigation(); }
    }, 1000);
    document.addEventListener('visibilitychange', function () { lastTick = Date.now(); });
    $('sendToHud').addEventListener('click', function () {
      if (state.adding) $('addMode').click();
      updateHud();
      hud.open();
    });
    function showCacheStatus() {
      $('offlineStatus').textContent = offline.status();
      $('offlineStatus').classList.toggle('cache-warning', offline.hasProblem());
    }
    offline.subscribe(showCacheStatus);
    offline.start();
  }

  function addStop(stop) {
    if (navigation.snapshot()) return;
    var last = state.stops[state.stops.length - 1];
    if (last.lat === stop.lat && last.lon === stop.lon) return; // already there
    state.stops.push(stop);
    render();
  }

  function setUpRouteButtons() {
    $('addMode').addEventListener('click', function () {
      if (navigation.snapshot()) return;
      state.adding = !state.adding;
      $('addMode').classList.toggle('selected', state.adding);
      $('addMode').setAttribute('aria-pressed', String(state.adding));
      $('map').classList.toggle('adding', state.adding);
      setHint(state.adding
        ? 'Tap the map to add a waypoint. Ground off the rover path counts as unverified. Tap Add waypoint again or press Escape to finish.'
        : DEFAULT_HINT);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.adding) $('addMode').click();
    });
    $('returnHome').addEventListener('click', function () { addStop(habitat); });
    $('undo').addEventListener('click', function () {
      if (navigation.snapshot()) return;
      if (state.stops.length > 1) state.stops.pop();
      render();
    });
    $('clear').addEventListener('click', function () {
      if (navigation.snapshot()) return;
      state.stops = [habitat];
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
        radius: 8, color: '#283626', weight: 2, fillColor: '#ed9678', fillOpacity: 1
      }).bindTooltip(stop.name).addTo(routeLayer);
    });
  }

  function drawRouteList() {
    var list = $('routeList');
    list.replaceChildren();
    state.stops.forEach(function (stop, index) {
      var item = el('li');
      var target = data.targets.find(function (t) { return positionKey(t) === positionKey(stop); });
      var badge = positionKey(stop) === positionKey(habitat) ? 'H' : target ? String(Number(target.id)) : 'W';
      item.append(el('b', null, badge));
      var text = el('div', null, stop.name);
      var kind = index === 0 ? 'Airlock, start'
        : stop.stopMin ? stop.stopMin + ' min science stop'
        : stop.custom ? 'Waypoint' : 'Return to habitat';
      text.append(el('small', null, kind));
      item.append(text);
      if (index > 0 && positionKey(stop) !== positionKey(habitat)) {
        var log = el('button', 'route-log', 'Log');
        log.type = 'button';
        log.setAttribute('aria-label', 'Log sample at ' + stop.name);
        log.addEventListener('click', function () { sampleLog.select(stop); });
        item.append(log);
      }
      list.append(item);
    });
    $('pointCount').textContent = state.stops.length + (state.stops.length === 1 ? ' stop' : ' stops');
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
      wrap.dataset.consumable = reserve.id;
      var labels = el('div');
      labels.append(el('span', null, reserve.name), el('span', 'budget-value', left.toFixed(0) + '%'));
      var bar = el('div', 'bar');
      var fill = el('span', left < reservePercent ? 'low' : null);
      fill.style.width = left + '%';
      bar.append(fill);
      wrap.append(labels, bar);
      box.append(wrap);
    });
    $('reserveNote').textContent = 'Keep ' + reservePercent + '%';
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
    if (f.open) alerts.push(['warn', 'The route does not return to the habitat yet. Tap Return to habitat.']);
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
    var label = s.verdict;
    verdict.textContent = label;
    verdict.className = 'tag ' + (label === 'No-go' ? 'bad' : label === 'Go' ? 'good' : f.empty ? '' : 'warn');
  }

  function drawProfile(s) {
    var canvas = $('profile');
    var ratio = Math.min(2, window.devicePixelRatio || 1);
    var width = canvas.clientWidth;
    var height = canvas.clientHeight;
    if (!width || !height) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = '16px Consolas, monospace';
    ctx.fillStyle = '#96a19c';
    ctx.textBaseline = 'middle';

    var points = s.profile;
    if (points.length < 2) {
      ctx.textAlign = 'center';
      ctx.fillText('Add a rover-path stop', width / 2, height / 2 - 10);
      ctx.fillText('to see measured elevation', width / 2, height / 2 + 12);
      return;
    }

    var left = 84, right = 12, top = 10, bottom = 28;
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
    $('duration').textContent = s.flags.empty ? 'Limit ' + s.limitHours.toFixed(1) + ' h'
      : formatDuration(s.minutes) + ' of ' + s.limitHours.toFixed(1) + ' h';
    $('undo').disabled = state.stops.length === 1;
    drawRoute(s);
    drawRouteList();
    drawStats(s);
    drawBudgets(s);
    drawAlerts(s);
    drawProfile(s);
    updateNavigation();
    if (sampleLog) sampleLog.refresh(state.stops);
    offline.saveRoute(state.stops);
    window.dispatchEvent(new CustomEvent('ares:planchange', { detail: s }));
  }

  /* ---------- 6. Science stops ---------- */

  function createTargetCards() {
    data.targets.forEach(function (target) {
      var card = el('button', 'target-card');
      card.type = 'button';
      var thumb = el('div', 'terrain-thumb');
      var fallback = el('img');
      fallback.src = 'assets/jezero-delta.jpg';
      fallback.alt = 'Jezero delta overview';
      fallback.loading = 'lazy';
      thumb.append(fallback, el('span', null, String(Number(target.id))));
      var body = el('div', 'target-body');
      body.append(el('small', null, target.area), el('h3', null, target.name), el('p', null, target.rock));
      body.append(el('small', null, 'Sol ' + target.sol + ' · ' + target.stopMin + ' min stop'));
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
        img.addEventListener('error', function () { img.remove(); });
        thumb.insertBefore(img, thumb.lastElementChild);
      }).catch(function () { /* leave the plain card */ });
    });
  }

  /** Open the drawer for one science stop and fill it with live data. */
  function inspect(target) {
    var box = $('drawerContent');
    box.replaceChildren();

    box.append(el('div', 'eyebrow', 'Science stop ' + Number(target.id)));
    box.append(el('h2', null, target.name));
    box.append(el('div', 'drawer-meta', target.area + ' · ' + formatCoords(target.lat, target.lon)));

    var round = planner.summarize([habitat, toStop(target), habitat]);
    box.append(el('div', 'drawer-meta',
      'Round trip from the habitat: ' + formatKm(round.distanceM) + ', ' + formatDuration(round.minutes) +
      ', steepest ' + round.maxSlopeDeg.toFixed(0) + '°'));

    box.append(el('h3', null, 'Rock'));
    box.append(el('p', null, target.rock));
    var geology = el('p', 'live', 'USGS geologic unit: loading…');
    box.append(geology);

    box.append(el('h3', null, 'Why go'));
    box.append(el('p', null, target.why));
    box.append(el('h3', null, 'What to do there'));
    box.append(el('p', null, target.task + ' Plan ' + target.stopMin + ' minutes.'));

    box.append(el('h3', null, 'What Perseverance saw, sol ' + target.sol));
    var gallery = el('div', 'gallery');
    gallery.append(el('p', 'live', 'Loading rover images…'));
    box.append(gallery);

    var add = el('button', 'primary add-to-route', 'Add to route');
    add.type = 'button';
    add.disabled = !!navigation.snapshot();
    add.addEventListener('click', function () {
      addStop(toStop(target));
      $('inspection').close();
    });
    box.append(add);
    var logSample = el('button', 'log-sample', 'Log sample observations');
    logSample.type = 'button';
    logSample.addEventListener('click', function () { $('inspection').close(); sampleLog.select(target); });
    box.append(logSample);
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
    return { cell: cell, label: cell.firstChild, value: value, note: note };
  }

  function setUpConditions() {
    var site = conditionCell('Habitat site');
    site.value.textContent = 'Three Forks';
    site.note.textContent = formatCoords(habitat.lat, habitat.lon);

    var limit = conditionCell('EVA limit');
    limit.value.textContent = planner.limitHours().toFixed(1) + ' h';
    limit.note.textContent = 'Suit endurance minus ' + config.eva.reserveFraction * 100 + '% reserve';

    var radiation = conditionCell('Surface radiation');
    radiation.value.textContent = config.radiation.surfaceDoseMsvPerHour + ' mSv/h';
    radiation.note.textContent = 'Curiosity RAD, ' + config.radiation.surfaceDoseMsvPerDay + ' ± ' +
      config.radiation.uncertaintyMsvPerDay + ' mSv/day (Hassler et al. 2014)';

    // Weather measured by Perseverance, from NASA's archive (data/medaJezero.js).
    var archive = ARES.medaArchive;
    if (archive && archive.sols.length) {
      var newest = archive.sols[archive.sols.length - 1];
      var archived = conditionCell('Archived Perseverance weather · ' + archive.site);
      archived.value.textContent = newest.airTempC.min.toFixed(0) + ' to ' + newest.airTempC.max.toFixed(0) + ' °C air · ' +
        newest.pressurePa.min + ' to ' + newest.pressurePa.max + ' Pa';
      archived.note.textContent = 'Sol ' + newest.sol + ' (' + newest.earthDate + ') · ground ' +
        newest.groundTempC.min.toFixed(0) + ' to ' + newest.groundTempC.max.toFixed(0) + ' °C · ' + archive.station +
        ' · NASA PDS archive, not live · rover was on higher ground than Three Forks';
      var history = el('details', 'weather-history');
      history.append(el('summary', null, 'Sols ' + archive.sols[0].sol + ' to ' + newest.sol));
      archive.sols.slice().reverse().forEach(function (day) {
        var row = el('div', 'stat');
        row.append(el('span', null, 'Sol ' + day.sol + ' · ' + day.earthDate),
          el('span', null, day.airTempC.min.toFixed(0) + ' to ' + day.airTempC.max.toFixed(0) + ' °C · ' + day.pressurePa.mean + ' Pa'));
        history.append(row);
      });
      archived.cell.append(history);
    }

    var weather = conditionCell('Mars weather · latest published');
    api.latestWeather().then(function (w) {
      if (!w) { weather.value.textContent = 'No readings'; return; }
      // Say plainly when the newest feed is from another crater.
      if (w.site !== 'Jezero Crater') weather.label.textContent = w.site + ' weather · not Jezero · latest published';
      weather.value.textContent = w.minTempC.toFixed(0) + ' to ' + w.maxTempC.toFixed(0) + ' °C' +
        (w.pressurePa ? ' · ' + w.pressurePa.toFixed(0) + ' Pa' : '');
      weather.note.textContent = w.station + ', ' + w.site + ' · sol ' + w.sol + ' (' + w.earthDate + ')' +
        (w.sunrise && w.sunset ? ' · daylight ' + w.sunrise.slice(0, 5) + ' to ' + w.sunset.slice(0, 5) : '');
    }).catch(function () {
      weather.value.textContent = 'Unavailable';
      weather.note.textContent = 'NASA weather feeds did not load';
    });

    var space = conditionCell('Space weather · NASA DONKI');
    api.spaceWeather().then(function (sw) {
      space.value.textContent = sw.particleEvents
        ? sw.particleEvents + ' particle event alert' + (sw.particleEvents === 1 ? '' : 's')
        : 'No particle events';
      space.value.className = sw.particleEvents ? 'bad' : 'good';
      space.note.textContent = sw.total + (sw.total === 1 ? ' notice in ' : ' notices in ') +
        config.api.spaceWeatherDays + ' days, Sun-wide, not Mars-specific' +
        (sw.fetchedAt ? ' · checked ' + new Date(sw.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
    }).catch(function () {
      space.value.textContent = 'Unavailable';
      space.note.textContent = 'DONKI did not load (the shared demo key allows 30 requests an hour)';
    });
  }

  /* ---------- 8. Export and start-up ---------- */

  function exportPlan() {
    var s = state.summary;
    var plan = {
      title: 'Jezero EVA plan',
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
      emergencyReturn: returnRoute,
      navigation: navigation.export(),
      sampling: sampleLog.export(),
      assumptions: { walking: config.walking, slope: config.slope, eva: config.eva, radiation: config.radiation }
    };
    var url = URL.createObjectURL(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }));
    var link = el('a');
    link.href = url;
    link.download = 'jezero-eva-plan.json';
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function start() {
    $('scienceGoal').textContent = data.scienceGoal;
    setUpLayers();
    createMarkers();
    setUpMapEvents();
    setUpRouteButtons();
    sampleLog = ARES.createSampleLog();
    setUpCrewControls();
    setUpConditions();
    createTargetCards();
    $('closeDrawer').addEventListener('click', function () { $('inspection').close(); });
    $('export').addEventListener('click', exportPlan);
    window.addEventListener('resize', function () { drawProfile(state.summary); });
    // Header wrapping and portrait stacking can resize the map without a window resize.
    new ResizeObserver(function () { map.invalidateSize(); }).observe($('mapWrap'));
    setHint(DEFAULT_HINT);
    var saved = offline.read('navigation', null);
    render();
    var samePlan = saved && Array.isArray(saved.stops) && saved.stops.length === state.stops.length &&
      saved.stops.every(function (stop, index) {
        var current = state.stops[index];
        return stop && stop.lat === current.lat && stop.lon === current.lon && stop.name === current.name &&
          (stop.stopMin || 0) === (current.stopMin || 0);
      });
    if (samePlan && navigation.restore(saved)) {
      returnRoute = navigation.export().returnRoute;
      render(); drawReturn();
      if (returnRoute) {
        $('rtbPanel').hidden = false;
        $('rtbStatus').textContent = returnRoute.statusText || 'Saved return route restored. Resume the simulation to navigate home.';
        $('rtbStatus').className = returnRoute.statusClass || '';
      }
      setHint('Saved simulation restored and paused. Resume navigation when ready.');
    } else if (saved) {
      $('navigationStatus').textContent = 'The saved simulation no longer matches the current route or data. Review your plan and start again.';
    }
    if (ARES.createVisorControls) visorControls = ARES.createVisorControls({
      stops: function () { var active = navigation.snapshot(); return active && active.mode === 'return' ? [habitat] : state.stops; },
      index: function () { var active = navigation.snapshot(); return active ? Math.max(0, active.routeIndex) : null; },
      set: function (index) {
        if (!navigation.snapshot()) $('startRoute').click();
        var active = navigation.snapshot();
        if (!active || active.mode === 'return') return;
        var saved = navigation.export(), elapsed = 0;
        for (var i = 0; i < saved.steps.length; i++) {
          var step = saved.steps[i];
          if (index === 0 || (step.routeIndex >= index && step.phase !== 'walking')) break;
          elapsed += step.minutes;
        }
        navigation.seek(index === state.stops.length - 1 ? saved.totalMin : elapsed);
        if (!navigation.snapshot().paused) navigation.togglePause();
        updateNavigation();
      }
    });
    if (terrain) {
      terrainView = ARES.createTerrainView(terrain, {
        limits: config.slope,
        getScene: function () {
          var active = navigation.snapshot(), points = [];
          state.summary.legs.forEach(function (leg) { points = points.concat(leg.points); });
          if (active && active.mode === 'return' && returnRoute) points = returnRoute.points;
          return { path: points, stops: data.targets.map(function (t) { return {lat:t.lat,lon:t.lon,label:String(Number(t.id))}; })
            .concat(state.stops.filter(function(s){return s.custom;}).map(function(s){return {lat:s.lat,lon:s.lon,label:'W'};})),
            habitat: habitat, position: active ? active.position : null };
        }
      });
      $('open3d').addEventListener('click', function () { terrainView.open(); });
    }
    $('openCommands').addEventListener('click', function () { updateHud(); $('evaCommands').showModal(); });
    $('closeCommands').addEventListener('click', function () { $('evaCommands').close(); });

  }

  start();

  // Handy in the browser console while developing: ARES.debug.state, ARES.debug.map
  ARES.debug = { state: state, map: map, planner: planner, crewRouter: crewRouter, navigation: navigation };
})();
