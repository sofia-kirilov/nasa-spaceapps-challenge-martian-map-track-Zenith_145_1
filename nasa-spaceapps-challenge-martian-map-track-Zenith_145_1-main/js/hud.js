/* Visor preview only. Reuses planner results; never advances a live suit or crew feed. */
window.ARES = window.ARES || {};

ARES.hudTelemetry = function (config, snapshot) {
  'use strict';
  var s = snapshot.summary;
  var index = snapshot.routeIndex;
  var active = snapshot.navigation;
  var known = !!active || index >= 0 && index < snapshot.stops.length;
  var elapsedMin = index > 0 ? s.airlockMin : 0;
  if (known && !active) s.legs.slice(0, index).forEach(function (leg) {
    elapsedMin += leg.minutes + (leg.to.stopMin || 0);
  });
  if (active) elapsedMin = active.totalElapsedMin;
  var oxygen = config.eva.consumables.find(function (c) { return c.id === 'oxygen'; });
  var percent = known && oxygen ? Math.max(0, 100 * (1 - elapsedMin / 60 / oxygen.enduranceH)) : null;
  var r = snapshot.returnRoute;
  var reserveRisk = known && r.available && !r.atBase && config.eva.consumables.some(function (c) {
    return (elapsedMin + r.minutes) / 60 > c.enduranceH * (1 - config.eva.reserveFraction);
  });
  var returnState = !r.available ? 'bad' : r.atBase ? 'good'
    : r.maxSlopeDeg >= config.slope.limitDeg || reserveRisk ? 'bad'
    : !known || r.maxSlopeDeg >= config.slope.cautionDeg || r.connectorM > 0.01 ? 'warn' : 'good';
  var returnText = !r.available ? 'Unavailable' : r.atBase ? 'At habitat'
    : r.maxSlopeDeg >= config.slope.limitDeg ? 'Terrain limit exceeded'
    : reserveRisk ? 'Reserve at risk' : returnState === 'warn' ? 'Caution' : 'Route available';
  var nextLeg = known ? s.legs[index] : null;
  return {
    oxygenPercent: percent,
    oxygenLow: percent !== null && elapsedMin / 60 > oxygen.enduranceH * (1 - config.eva.reserveFraction),
    returnState: returnState, returnText: returnText,
    returnNote: !r.available ? r.reason : r.atBase ? 'Selected position is at base'
      : (r.distanceM / 1000).toFixed(2) + ' km · ' + Math.ceil(r.minutes) + ' min walking' +
        (!known ? ' · suit reserve unknown' : r.connectorM > 0.01 ? ' · unverified connection' : ''),
    nextDistanceM: active ? active.nextDistanceM : nextLeg ? nextLeg.distanceM : null,
    nextName: active ? active.nextName : nextLeg ? nextLeg.to.name : known ? (s.flags.empty ? 'Add a waypoint in the planner' : 'Route complete')
      : 'Selected position is outside this plan'
  };
};

ARES.createHud = function (config, habitat) {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var view = $('hudView');
  var latest;
  var previousFocus;

  function miniMap(snapshot) {
    var plan = [];
    snapshot.summary.legs.forEach(function (leg) { plan = plan.concat(leg.points); });
    var returning = snapshot.returnRoute.available ? snapshot.returnRoute.points || [] : [];
    var all = plan.concat(returning, [habitat, snapshot.position]);
    var cosLat = Math.cos(habitat.lat * Math.PI / 180);
    var xs = all.map(function (p) { return (p.lon - habitat.lon) * cosLat; });
    var ys = all.map(function (p) { return p.lat - habitat.lat; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var scale = Math.min(220 / Math.max(maxX - minX, 0.0001), 120 / Math.max(maxY - minY, 0.0001));
    function project(p) {
      return [130 + ((p.lon - habitat.lon) * cosLat - (minX + maxX) / 2) * scale,
        80 - (p.lat - habitat.lat - (minY + maxY) / 2) * scale];
    }
    function path(points) {
      return points.map(function (p, i) { var xy = project(p); return (i ? 'L' : 'M') + xy[0].toFixed(1) + ',' + xy[1].toFixed(1); }).join(' ');
    }
    $('hudPlanPath').setAttribute('d', path(plan));
    $('hudReturnPath').setAttribute('d', path(returning));
    var base = project(habitat), position = project(snapshot.position);
    $('hudBaseMarker').setAttribute('x', base[0] - 5);
    $('hudBaseMarker').setAttribute('y', base[1] - 5);
    $('hudPositionMarker').setAttribute('cx', position[0]);
    $('hudPositionMarker').setAttribute('cy', position[1]);
  }

  function draw() {
    if (!latest) return;
    var telemetry = ARES.hudTelemetry(config, latest);
    $('hudOxygen').textContent = telemetry.oxygenPercent === null ? 'Unknown' : Math.round(telemetry.oxygenPercent) + '%';
    $('hudOxygen').className = telemetry.oxygenLow ? 'bad' : telemetry.oxygenPercent === null ? 'warn' : '';
    $('hudOxygenNote').textContent = telemetry.oxygenPercent === null ? 'Choose a stop on the plan for an estimate'
      : (telemetry.oxygenLow ? 'Below ' : 'Keep ') + Math.round(config.eva.reserveFraction * 100) + '% reserve';
    $('hudReturn').textContent = telemetry.returnText;
    $('hudReturn').className = telemetry.returnState;
    $('hudReturnNote').textContent = telemetry.returnNote;
    $('hudDistance').textContent = telemetry.nextDistanceM === null ? '—'
      : telemetry.nextDistanceM < 1000 ? Math.round(telemetry.nextDistanceM) + ' m' : (telemetry.nextDistanceM / 1000).toFixed(2) + ' km';
    $('hudWaypoint').textContent = telemetry.nextName;
    $('hudPosition').textContent = 'Position: ' + latest.position.name;
    $('hudVerdict').textContent = latest.summary.verdict;
    $('hudVerdict').className = latest.summary.verdict === 'No-go' ? 'bad' : latest.summary.verdict === 'Go with caution' ? 'warn' : '';
    miniMap(latest);
  }

  $('closeHud').addEventListener('click', function () { view.close(); });
  // Native dialog handles Escape and keeps keyboard focus in the visor controls.
  view.addEventListener('close', function () {
    document.body.classList.remove('hud-active');
    window.dispatchEvent(new Event('resize'));
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  });
  return {
    update: function (snapshot) { latest = snapshot; draw(); },
    open: function () {
      if (view.open) return;
      previousFocus = document.activeElement;
      draw();
      document.body.classList.add('hud-active');
      view.showModal();
      window.dispatchEvent(new Event('resize'));
    }
  };
};
