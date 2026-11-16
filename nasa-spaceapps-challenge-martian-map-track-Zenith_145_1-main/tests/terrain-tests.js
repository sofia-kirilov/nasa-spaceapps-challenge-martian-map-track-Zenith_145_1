/* Run with: node tests/terrain-tests.js */
'use strict';
var assert = require('node:assert/strict');
global.window = global;
require('../js/config.js');
require('../js/roverTraverse.js');
require('../data/jezeroElevation.js');
require('../js/terrain.js');

var grid = ARES.elevationGrid;
assert.equal(grid.rows.length, grid.size);
grid.rows.forEach(function (row) { assert.equal(row.length, grid.size * 2); assert.ok(/^[0-9a-z]+$/.test(row)); });

var terrain = ARES.createTerrain(grid);
assert.ok(terrain.minM > -2600 && terrain.maxM < -2380, 'heights are in the range of the Jezero delta front');
assert.ok(Math.abs(terrain.cellNorthM - 40) < 0.01, 'cells are 40 m north-south');
assert.ok(terrain.cellEastM > 37.5 && terrain.cellEastM < 38.5, 'and about 38 m east-west at this latitude');

// Outside the grid there is no answer rather than a made-up one.
assert.equal(terrain.elevationAt(19, 77.4), null);
assert.equal(terrain.slopeAt(18.45, 78), null);

// The habitat site sits inside the grid.
var hab = terrain.elevationAt(18.45252, 77.4072);
assert.ok(hab > -2560 && hab < -2530, 'habitat height ' + hab);

// Independent check: Perseverance measured its own elevation along its track.
var inside = ARES.roverTraverse.waypoints.filter(function (w) { return terrain.elevationAt(w.lat, w.lon) !== null; });
var diffs = inside.map(function (w) { return terrain.elevationAt(w.lat, w.lon) - w.elev; });
var mean = diffs.reduce(function (a, b) { return a + b; }, 0) / diffs.length;
var meanAbs = diffs.reduce(function (a, b) { return a + Math.abs(b); }, 0) / diffs.length;
var worst = Math.max.apply(null, diffs.map(Math.abs));
console.log('Rover waypoints inside the grid: ' + inside.length + ' of ' + ARES.roverTraverse.waypoints.length +
  ' | grid minus rover: mean ' + mean.toFixed(1) + ' m, mean absolute ' + meanAbs.toFixed(1) + ' m, worst ' + worst.toFixed(1) + ' m');
assert.ok(inside.length > 100, 'most of the traverse near the delta is covered');
assert.ok(meanAbs < 6, 'the grid agrees with rover-measured elevation to within a few metres on average');

// Slopes are plausible: mostly gentle, some steep ground on the delta scarp.
var steep = 0, total = 0;
for (var i = 0; i < terrain.size; i++) for (var j = 0; j < terrain.size; j++) {
  var s = terrain.slopeCell(i, j);
  assert.ok(s >= 0 && s < 60);
  total++; if (s >= ARES.config.slope.limitDeg) steep++;
}
console.log('Cells at or over the ' + ARES.config.slope.limitDeg + '° limit: ' + (100 * steep / total).toFixed(1) + '%');
assert.ok(steep > 0 && steep / total < 0.2);
console.log('Elevation grid decoding, bounds, rover cross-check and slope tests passed.');
