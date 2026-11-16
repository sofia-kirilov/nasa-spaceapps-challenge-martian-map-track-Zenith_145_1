/*
 * terrain.js — reads the elevation grid in data/jezeroElevation.js.
 * Pure maths, no DOM. Used by the slope layer, the map readout and the 3D view.
 */
window.ARES = window.ARES || {};

ARES.createTerrain = function (grid) {
  'use strict';
  var N = grid.size;
  var RAD = Math.PI / 180;
  var heights = new Float32Array(N * N);
  var min = Infinity, max = -Infinity;
  grid.rows.forEach(function (row, i) {
    for (var j = 0; j < N; j++) {
      var h = grid.baseM + parseInt(row.substr(j * 2, 2), 36) * grid.stepM;
      heights[i * N + j] = h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  });

  var midLat = grid.latNorth - (N / 2) * grid.cellDeg;
  var cellNorthM = grid.cellDeg * RAD * grid.radiusM;
  var cellEastM = cellNorthM * Math.cos(midLat * RAD); // cells are narrower east-west on the ground

  function height(i, j) { return heights[i * N + j]; }
  function latOf(i) { return grid.latNorth - (i + 0.5) * grid.cellDeg; } // cell centre
  function lonOf(j) { return grid.lonWest + (j + 0.5) * grid.cellDeg; }

  /** Height in metres at a point, blended between the four nearest cell centres. Null outside the grid. */
  function elevationAt(lat, lon) {
    var y = (grid.latNorth - lat) / grid.cellDeg - 0.5;
    var x = (lon - grid.lonWest) / grid.cellDeg - 0.5;
    if (!(y >= 0 && x >= 0 && y <= N - 1 && x <= N - 1)) return null;
    var i = Math.min(N - 2, Math.floor(y)), j = Math.min(N - 2, Math.floor(x));
    var fy = y - i, fx = x - j;
    return height(i, j) * (1 - fy) * (1 - fx) + height(i, j + 1) * (1 - fy) * fx +
      height(i + 1, j) * fy * (1 - fx) + height(i + 1, j + 1) * fy * fx;
  }

  /** Slope of one cell in degrees, from its four neighbours. */
  function slopeCell(i, j) {
    var i0 = Math.max(0, i - 1), i1 = Math.min(N - 1, i + 1);
    var j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    var east = (height(i, j1) - height(i, j0)) / ((j1 - j0) * cellEastM);
    var north = (height(i0, j) - height(i1, j)) / ((i1 - i0) * cellNorthM);
    return Math.atan(Math.sqrt(east * east + north * north)) / RAD;
  }

  /** Slope in degrees at a point (the cell it falls in). Null outside the grid. */
  function slopeAt(lat, lon) {
    var i = Math.floor((grid.latNorth - lat) / grid.cellDeg);
    var j = Math.floor((lon - grid.lonWest) / grid.cellDeg);
    return i >= 0 && j >= 0 && i < N && j < N ? slopeCell(i, j) : null;
  }

  return {
    size: N, minM: min, maxM: max, cellNorthM: cellNorthM, cellEastM: cellEastM,
    bounds: { north: grid.latNorth, south: grid.latNorth - N * grid.cellDeg,
      west: grid.lonWest, east: grid.lonWest + N * grid.cellDeg },
    height: height, latOf: latOf, lonOf: lonOf,
    elevationAt: elevationAt, slopeCell: slopeCell, slopeAt: slopeAt
  };
};
