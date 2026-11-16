/* Simulated EVA progress. Authoritative data and planner results remain read only. */
window.ARES = window.ARES || {};

ARES.createNavigation = function (config, waypoints) {
  'use strict';
  var session = null;
  var geo = ARES.geo;
  var R = config.mars.radiusM;
  var source = JSON.stringify([config.mars, config.walking, config.slope, config.eva, waypoints || []]);
  var fingerprint = 2166136261;
  for (var h = 0; h < source.length; h++) fingerprint = Math.imul(fingerprint ^ source.charCodeAt(h), 16777619) >>> 0;
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function point(p) { return { lat: p.lat, lon: p.lon, elev: p.elev, tilt: p.tilt }; }
  function validPoint(p) { return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180; }
  function walkTime(a, b, verified) {
    var d = geo.distanceM(a, b, R);
    var slope = Number.isFinite(a.elev) && Number.isFinite(b.elev) && d >= config.slope.minSegmentM
      ? geo.slopeDeg(b.elev - a.elev, d) : config.walking.assumedSlopeDeg;
    return d / 1000 / config.walking.baseSpeedKmh * 60 *
      (1 + slope / config.walking.slopeDivisorDeg) * (verified ? 1 : config.walking.unverifiedPenalty);
  }
  function walking(points, minutes, verified, nextName, routeIndex) {
    var steps = [];
    for (var i = 1; i < points.length; i++) {
      var a = point(points[i - 1]), b = point(points[i]);
      var distance = geo.distanceM(a, b, R);
      if (distance < 0.001) continue;
      var measured = verified && Number.isFinite(a.elev) && Number.isFinite(b.elev);
      steps.push({ a: a, b: b, minutes: walkTime(a, b, measured), distanceM: distance,
        pathSegment: measured ? points[i - 1].pathSegment || points[i].pathSegment || { from: a, to: b, verified: true } : null,
        verified: measured, phase: 'walking', nextName: nextName, routeIndex: routeIndex });
    }
    var total = steps.reduce(function (sum, s) { return sum + s.minutes; }, 0);
    // Match the existing model's leg ETA exactly, including its endpoint assumptions.
    steps.forEach(function (s) { s.minutes = total ? s.minutes / total * minutes : 0; });
    return steps;
  }
  function dwell(position, minutes, phase, name, index) {
    return { a: point(position), b: point(position), minutes: minutes, distanceM: 0,
      phase: phase, nextName: name, routeIndex: index };
  }
  function start(stops, summary) {
    if (session || summary.flags.empty || summary.verdict === 'No-go' || summary.minutes <= 0) return false;
    var steps = [dwell(stops[0], summary.airlockMin, 'airlock', stops[1].name, 0)];
    summary.legs.forEach(function (leg, index) {
      var points = [leg.from].concat(leg.points, [leg.to]);
      steps = steps.concat(walking(points, leg.minutes, leg.verified, leg.to.name, index));
      if (leg.to.stopMin) steps.push(dwell(leg.to, leg.to.stopMin, 'science', leg.to.name, index + 1));
    });
    session = { version: 1, fingerprint: fingerprint, stops: copy(stops), steps: steps, elapsedMin: 0, elapsedBeforeReturn: 0,
      mode: 'eva', paused: false, totalMin: summary.minutes, returnRoute: null };
    return true;
  }
  function snapshot() {
    if (!session) return null;
    var elapsed = session.elapsedMin, cursor = 0, done = 0;
    var steps = session.steps;
    var totalDistance = steps.reduce(function (sum, s) { return sum + s.distanceM; }, 0);
    var selected = steps[steps.length - 1];
    var fraction = 1;
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      if (elapsed < cursor + step.minutes) {
        selected = step;
        fraction = step.minutes ? Math.max(0, (elapsed - cursor) / step.minutes) : 1;
        break;
      }
      cursor += step.minutes;
      done += step.distanceM;
    }
    var complete = elapsed >= session.totalMin;
    var position = { lat: selected.a.lat + (selected.b.lat - selected.a.lat) * fraction,
      lon: selected.a.lon + (selected.b.lon - selected.a.lon) * fraction,
      name: complete ? (session.mode === 'return' ? 'Three Forks habitat' : session.stops[session.stops.length - 1].name)
        : selected.phase === 'science' ? selected.nextName : selected.phase === 'airlock' ? session.stops[0].name : 'Along traverse to ' + selected.nextName };
    if (selected.phase === 'walking' && selected.verified && !complete) {
      position.pathSegment = copy(selected.pathSegment || { from: point(selected.a), to: point(selected.b), verified: true });
    }
    var remainingDistance = complete ? 0 : Math.max(0, totalDistance - done - selected.distanceM * fraction);
    // Include subsequent walking segments up to the next stop, not just the current edge.
    var nextDistance = selected.distanceM * (1 - fraction);
    if (!complete && selected.phase !== 'science') {
      for (var j = i + 1; j < steps.length && steps[j].phase === 'walking' && steps[j].routeIndex === selected.routeIndex; j++) nextDistance += steps[j].distanceM;
    }
    return { mode: session.mode, paused: session.paused, complete: complete,
      elapsedMin: elapsed, totalMin: session.totalMin,
      totalElapsedMin: session.elapsedBeforeReturn + elapsed,
      remainingMin: Math.max(0, session.totalMin - elapsed), remainingDistanceM: remainingDistance,
      percent: session.totalMin ? elapsed / session.totalMin * 100 : 100,
      position: position, routeIndex: selected.routeIndex, phase: complete ? 'complete' : selected.phase,
      nextName: complete ? 'Route complete' : selected.nextName, nextDistanceM: complete ? 0 : nextDistance };
  }
  function beginReturn(route) {
    if (!session || !route.available || route.atBase || route.minutes <= 0) return false;
    var before = snapshot().totalElapsedMin;
    session.steps = walking(route.points, route.minutes, true, 'Three Forks habitat', -1);
    session.elapsedBeforeReturn = before;
    session.elapsedMin = 0;
    session.totalMin = route.minutes;
    session.mode = 'return';
    session.returnRoute = copy(route);
    session.paused = false;
    return true;
  }
  function seek(minutes) {
    if (!session || !Number.isFinite(minutes)) return;
    session.elapsedMin = Math.max(0, Math.min(session.totalMin, minutes));
    if (session.elapsedMin >= session.totalMin) session.paused = true;
  }
  function restore(saved) {
    // Only restore a valid, previously generated local simulation. Never infer GPS data.
    if (!saved || saved.version !== 1 || saved.fingerprint !== fingerprint || !['eva', 'return'].includes(saved.mode) || !Array.isArray(saved.stops) || saved.stops.length < 2 ||
      !Array.isArray(saved.steps) || !saved.steps.length || !Number.isFinite(saved.totalMin) || saved.totalMin <= 0 ||
      !Number.isFinite(saved.elapsedMin) || !Number.isFinite(saved.elapsedBeforeReturn) || saved.elapsedBeforeReturn < 0 ||
      !saved.stops.every(validPoint) ||
      !saved.steps.every(function (s) { return s && validPoint(s.a) && validPoint(s.b) &&
        ['airlock', 'walking', 'science'].includes(s.phase) && Number.isInteger(s.routeIndex) &&
        Number.isFinite(s.minutes) && s.minutes >= 0 &&
        Number.isFinite(s.distanceM) && s.distanceM >= 0; }) ||
      Math.abs(saved.steps.reduce(function (sum, s) { return sum + s.minutes; }, 0) - saved.totalMin) > 0.0001) return false;
    if (saved.mode === 'return' && (!saved.returnRoute || !saved.returnRoute.available ||
      !Array.isArray(saved.returnRoute.points) || saved.returnRoute.points.length < 2 ||
      !saved.returnRoute.points.every(validPoint))) return false;
    session = copy(saved);
    session.paused = true; // Reload never silently advances an EVA.
    seek(saved.elapsedMin);
    return true;
  }
  return { start: start, beginReturn: beginReturn, snapshot: snapshot, seek: seek, restore: restore,
    advance: function (minutes) { if (session && !session.paused && Number.isFinite(minutes) && minutes > 0) seek(session.elapsedMin + minutes); },
    togglePause: function () { if (session && session.elapsedMin < session.totalMin) session.paused = !session.paused; },
    end: function () { session = null; },
    export: function () { return copy(session); } };
};
