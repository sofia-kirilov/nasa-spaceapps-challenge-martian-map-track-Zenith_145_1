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
    var candidates = [{ index: start.index, point: from, verified: false }];
    var edge = from.pathSegment;
    if (edge && edge.verified && edge.from && edge.to) {
      var a = geo.nearest(waypoints, edge.from, R), b = geo.nearest(waypoints, edge.to, R);
      var length = geo.distanceM(edge.from, edge.to, R);
      // An interpolated point on a recorded edge can return through either end.
      // Choose by walking time, rather than snapping blindly to the nearest node.
      if (a.distanceM < 0.01 && b.distanceM < 0.01 && graph[a.index].some(function (e) { return e.to === b.index; }) &&
        Math.abs(geo.distanceM(edge.from, from, R) + geo.distanceM(from, edge.to, R) - length) < 0.05) {
        var fraction = length ? geo.distanceM(edge.from, from, R) / length : 0;
        var current = { lat: from.lat, lon: from.lon,
          elev: edge.from.elev + (edge.to.elev - edge.from.elev) * fraction,
          tilt: Math.max(edge.from.tilt || 0, edge.to.tilt || 0), pathSegment: edge };
        candidates = [{ index: a.index, point: current, verified: true }, { index: b.index, point: current, verified: true }];
      }
    }
    if (!candidates[0].verified && start.distanceM > config.rover.snapRadiusM || end.distanceM > config.rover.snapRadiusM) return {
      available: false,
      reason: 'No return route on the recorded traverse from this position. A routable position must be within ' +
        config.rover.snapRadiusM + ' m of a rover waypoint; off-traverse terrain is unverified.'
    };
    var best = null;
    candidates.forEach(function (candidate) {
      var path = geo.shortestPath(graph, candidate.index, end.index);
      if (!path) return;
      var points = path.map(function (i) {
        var w = waypoints[i];
        return { lat: w.lat, lon: w.lon, elev: w.elev, tilt: w.tilt };
      });
      var result = { available: true, atBase: false, points: points,
        distanceM: 0, minutes: 0, maxSlopeDeg: 0,
        connectorM: (candidate.verified ? 0 : start.distanceM) + end.distanceM };
      function add(part) {
        result.distanceM += part.distanceM;
        result.minutes += part.minutes;
        result.maxSlopeDeg = Math.max(result.maxSlopeDeg, part.maxSlopeDeg);
      }
      for (var i = 1; i < points.length; i++) add(segment(points[i - 1], points[i], true));
      add(segment(candidate.point, points[0], candidate.verified));
      add(segment(points[points.length - 1], base, false));
      result.points = [Object.assign({}, candidate.point)].concat(points, [{ lat: base.lat, lon: base.lon }]);
      if (!best || result.minutes < best.minutes) best = result;
    });
    return best || { available: false, reason: 'No connected return path in the recorded traverse.' };
  }
  return { fastestReturn: fastestReturn };
};
