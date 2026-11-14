/* Fastest return over the existing rover graph; source objects are read only. */
window.ARES = window.ARES || {};
ARES.offline.prepareData();

ARES.createCrewRouter = function (config, waypoints) {
  'use strict';
  var geo = ARES.geo;
  var R = config.mars.radiusM;

  function segment(a, b, verified) {
    var d = geo.distanceM(a, b, R);
    var known = Number.isFinite(a.elev) && Number.isFinite(b.elev);
    var slope = known && d >= config.slope.minSegmentM
      ? geo.slopeDeg(b.elev - a.elev, d) : config.walking.assumedSlopeDeg;
    return {
      distanceM: d,
      minutes: d / 1000 / config.walking.baseSpeedKmh * 60 *
        (1 + slope / config.walking.slopeDivisorDeg) * (verified ? 1 : config.walking.unverifiedPenalty),
      maxSlopeDeg: Math.max(known && d >= config.slope.minSegmentM ? slope : 0, a.tilt || 0, b.tilt || 0)
    };
  }

  var graph = geo.buildGraph(waypoints, config.rover.linkRadiusM, R).map(function (edges, i) {
    return edges.map(function (edge) {
      // shortestPath reads distanceM as the edge weight: supply walking minutes
      // on a new graph, leaving the original map/route data untouched.
      return { to: edge.to, distanceM: segment(waypoints[i], waypoints[edge.to], true).minutes };
    });
  });

  function fastestReturn(from, base) {
    var start = geo.nearest(waypoints, from, R);
    var end = geo.nearest(waypoints, base, R);
    if (geo.distanceM(from, base, R) < 0.01) return {
      available: true, atBase: true, points: [from], distanceM: 0, minutes: 0, maxSlopeDeg: 0, connectorM: 0
    };
    if (start.distanceM > config.rover.snapRadiusM || end.distanceM > config.rover.snapRadiusM) return {
      available: false,
      reason: 'No return route on the recorded traverse from this position. Select a position within ' +
        config.rover.snapRadiusM + ' m of a rover waypoint; off-traverse terrain is unverified.'
    };
    var path = geo.shortestPath(graph, start.index, end.index);
    if (!path) return { available: false, reason: 'No connected return path in the recorded traverse.' };
    var points = path.map(function (i) {
      var w = waypoints[i];
      return { lat: w.lat, lon: w.lon, elev: w.elev, tilt: w.tilt };
    });
    var result = { available: true, atBase: false, points: points,
      distanceM: 0, minutes: 0, maxSlopeDeg: 0, connectorM: start.distanceM + end.distanceM };
    function add(part) {
      result.distanceM += part.distanceM;
      result.minutes += part.minutes;
      result.maxSlopeDeg = Math.max(result.maxSlopeDeg, part.maxSlopeDeg);
    }
    for (var i = 1; i < points.length; i++) add(segment(points[i - 1], points[i], true));
    // Count the exact end connectors instead of silently teleporting to snapped nodes.
    add(segment(from, points[0], false));
    add(segment(points[points.length - 1], base, false));
    result.points = [{ lat: from.lat, lon: from.lon }].concat(points, [{ lat: base.lat, lon: base.lon }]);
    return result;
  }
  return { fastestReturn: fastestReturn };
};
