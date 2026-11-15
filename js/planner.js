/*
 * planner.js — turns a list of stops into a checked EVA plan.
 * Pure logic: no DOM, no network. Every number it uses comes from ARES.config.
 *
 * A "stop" is { name, lat, lon, stopMin }.
 * Two kinds of leg:
 *   verified   both ends sit on ground Perseverance drove, so the leg follows the
 *              rover's own path and uses its measured elevation and tilt.
 *   unverified a straight line over ground with no measurements. Slower, flagged.
 */
window.ARES = window.ARES || {};

ARES.createPlanner = function (config, waypoints) {
  var geo = ARES.geo;
  var R = config.mars.radiusM;
  var graph = geo.buildGraph(waypoints, config.rover.linkRadiusM, R);

  /** Index of the rover waypoint a stop sits on, or -1 if it is off proven ground. */
  function snap(stop) {
    var hit = geo.nearest(waypoints, stop, R);
    return hit.distanceM <= config.rover.snapRadiusM ? hit.index : -1;
  }

  /** Minutes to walk `metres` at `slope` degrees. */
  function walkMinutes(metres, slope, verified) {
    var w = config.walking;
    var minutes = metres / 1000 / w.baseSpeedKmh * 60 * (1 + slope / w.slopeDivisorDeg);
    return verified ? minutes : minutes * w.unverifiedPenalty;
  }

  /** Build one leg between two stops. */
  function leg(a, b) {
    var ia = snap(a);
    var ib = snap(b);
    var path = ia >= 0 && ib >= 0 ? geo.shortestPath(graph, ia, ib) : null;
    var verified = !!path;
    var points;

    if (verified) {
      points = path.map(function (i) {
        var w = waypoints[i];
        return { lat: w.lat, lon: w.lon, elev: w.elev, tilt: w.tilt };
      });
    } else {
      points = [
        { lat: a.lat, lon: a.lon, elev: ia >= 0 ? waypoints[ia].elev : null, tilt: null },
        { lat: b.lat, lon: b.lon, elev: ib >= 0 ? waypoints[ib].elev : null, tilt: null }
      ];
    }

    var result = {
      from: a, to: b, verified: verified, points: points,
      distanceM: 0, minutes: 0, climbM: 0, descentM: 0,
      maxGradeDeg: 0, maxTiltDeg: 0
    };

    for (var i = 1; i < points.length; i++) {
      var p = points[i - 1];
      var q = points[i];
      var d = geo.distanceM(p, q, R);
      var known = p.elev !== null && q.elev !== null;
      var slope = config.walking.assumedSlopeDeg;
      if (known) {
        var dz = q.elev - p.elev;
        if (dz > 0) result.climbM += dz; else result.descentM -= dz;
        if (d >= config.slope.minSegmentM) {
          slope = geo.slopeDeg(dz, d);
          result.maxGradeDeg = Math.max(result.maxGradeDeg, slope);
        }
      }
      result.distanceM += d;
      result.minutes += walkMinutes(d, slope, verified);
    }
    points.forEach(function (pt) {
      if (pt.tilt !== null) result.maxTiltDeg = Math.max(result.maxTiltDeg, pt.tilt);
    });
    return result;
  }

  /** The longest EVA the consumables allow once the reserve is held back, in hours. */
  function limitHours() {
    var shortest = Math.min.apply(null, config.eva.consumables.map(function (c) { return c.enduranceH; }));
    return shortest * (1 - config.eva.reserveFraction);
  }

  /** Check a whole plan. `stops[0]` is the habitat. */
  function summarize(stops) {
    var habitat = stops[0];
    var legs = [];
    for (var i = 1; i < stops.length; i++) legs.push(leg(stops[i - 1], stops[i]));

    var s = {
      legs: legs, distanceM: 0, climbM: 0, descentM: 0, walkMin: 0, stopMin: 0,
      maxSlopeDeg: 0, farthestM: 0, profile: [], unverifiedLegs: 0
    };

    var travelled = 0;
    legs.forEach(function (l) {
      for (var k = 0; k < l.points.length; k++) {
        if (k > 0) travelled += geo.distanceM(l.points[k - 1], l.points[k], R);
        if (l.points[k].elev !== null) s.profile.push({ d: travelled, elev: l.points[k].elev });
        s.farthestM = Math.max(s.farthestM, geo.distanceM(habitat, l.points[k], R));
      }
      s.distanceM += l.distanceM;
      s.climbM += l.climbM;
      s.descentM += l.descentM;
      s.walkMin += l.minutes;
      s.stopMin += l.to.stopMin || 0;
      s.maxSlopeDeg = Math.max(s.maxSlopeDeg, l.maxGradeDeg, l.maxTiltDeg);
      if (!l.verified) s.unverifiedLegs++;
    });

    s.airlockMin = legs.length ? config.eva.airlockMin : 0;
    s.minutes = s.walkMin + s.stopMin + s.airlockMin;
    s.hours = s.minutes / 60;
    s.limitHours = limitHours();
    s.doseMsv = s.hours * config.radiation.surfaceDoseMsvPerHour;
    s.reserves = config.eva.consumables.map(function (c) {
      return { id: c.id, name: c.name, percentLeft: 100 * (1 - s.hours / c.enduranceH) };
    });

    var last = stops[stops.length - 1];
    s.closed = legs.length > 0 && geo.distanceM(habitat, last, R) < 5;

    s.flags = {
      empty: legs.length === 0,
      overLimit: s.hours > s.limitHours,
      slopeLimit: s.maxSlopeDeg >= config.slope.limitDeg,
      slopeCaution: s.maxSlopeDeg >= config.slope.cautionDeg && s.maxSlopeDeg < config.slope.limitDeg,
      walkBack: s.farthestM > config.eva.walkBackLimitKm * 1000,
      unverified: s.unverifiedLegs > 0,
      open: legs.length > 0 && !s.closed
    };
    s.go = !s.flags.empty && !s.flags.overLimit && !s.flags.slopeLimit && !s.flags.walkBack && !s.flags.open;
    // An unfinished return leg is a draft warning, not a breached safety limit.
    // `go` still means a complete route; `verdict` also describes work in progress.
    s.verdict = s.flags.empty ? 'No plan yet'
      : (s.flags.overLimit || s.flags.slopeLimit || s.flags.walkBack) ? 'No-go'
      : (s.flags.open || s.flags.slopeCaution || s.flags.unverified) ? 'Go with caution' : 'Go';
    return s;
  }

  return { snap: snap, leg: leg, summarize: summarize, limitHours: limitHours };
};
