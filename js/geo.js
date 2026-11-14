/*
 * geo.js — pure geometry helpers. No DOM, no network, so it runs in Node for tests.
 * A "point" is any object with lat and lon in degrees (lon positive east).
 */
window.ARES = window.ARES || {};

ARES.geo = (function () {
  var RAD = Math.PI / 180;

  /** Great-circle distance in metres on a sphere of the given radius. */
  function distanceM(a, b, radiusM) {
    var dLat = (b.lat - a.lat) * RAD;
    var dLon = (b.lon - a.lon) * RAD;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * radiusM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Grade in degrees for a height change over a horizontal distance. */
  function slopeDeg(heightChangeM, distanceMetres) {
    if (distanceMetres <= 0) return 0;
    return Math.atan(Math.abs(heightChangeM) / distanceMetres) / RAD;
  }

  /** Index of, and distance to, the point in `points` closest to `target`. */
  function nearest(points, target, radiusM) {
    var best = { index: -1, distanceM: Infinity };
    for (var i = 0; i < points.length; i++) {
      var d = distanceM(points[i], target, radiusM);
      if (d < best.distanceM) best = { index: i, distanceM: d };
    }
    return best;
  }

  /**
   * Turn the rover's ordered stops into a graph of ground it is known to have covered.
   * Consecutive stops are connected (the rover drove between them). Stops closer than
   * linkRadiusM are connected too, so routes can switch where the rover's path crosses itself.
   * Returns an adjacency list: graph[i] = [{ to, distanceM }, ...].
   */
  function buildGraph(points, linkRadiusM, radiusM) {
    var graph = points.map(function () { return []; });
    function connect(i, j) {
      var d = distanceM(points[i], points[j], radiusM);
      graph[i].push({ to: j, distanceM: d });
      graph[j].push({ to: i, distanceM: d });
    }
    for (var i = 0; i < points.length; i++) {
      if (i + 1 < points.length) connect(i, i + 1);
      for (var j = i + 2; j < points.length; j++) {
        if (distanceM(points[i], points[j], radiusM) <= linkRadiusM) connect(i, j);
      }
    }
    return graph;
  }

  /** Dijkstra. Returns the list of node indexes from `from` to `to`, or null if unreachable. */
  function shortestPath(graph, from, to) {
    var n = graph.length;
    var dist = new Array(n).fill(Infinity);
    var prev = new Array(n).fill(-1);
    var done = new Array(n).fill(false);
    dist[from] = 0;
    for (var step = 0; step < n; step++) {
      var u = -1;
      for (var i = 0; i < n; i++) {
        if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
      }
      if (u === -1 || dist[u] === Infinity) break;
      if (u === to) break;
      done[u] = true;
      graph[u].forEach(function (edge) {
        var candidate = dist[u] + edge.distanceM;
        if (candidate < dist[edge.to]) {
          dist[edge.to] = candidate;
          prev[edge.to] = u;
        }
      });
    }
    if (dist[to] === Infinity) return null;
    var path = [];
    for (var node = to; node !== -1; node = prev[node]) path.unshift(node);
    return path;
  }

  return {
    distanceM: distanceM,
    slopeDeg: slopeDeg,
    nearest: nearest,
    buildGraph: buildGraph,
    shortestPath: shortestPath
  };
})();
