/* Run with: node tests/run-tests.js */
global.window = global;
['config', 'geo', 'roverTraverse', 'marsData', 'planner'].forEach(function (f) {
  require('../js/' + f + '.js');
});
var assert = require('assert');
var cfg = ARES.config, geo = ARES.geo, wp = ARES.roverTraverse.waypoints, data = ARES.data;
var planner = ARES.createPlanner(cfg, wp);
var stop = function (t) { return { name: t.name, lat: t.lat, lon: t.lon, stopMin: t.stopMin || 0 }; };
var hab = stop(data.habitat);
var T = {}; data.targets.forEach(function (t) { T[t.name] = stop(t); });
var show = function (name, s) {
  console.log(name.padEnd(34), (s.distanceM / 1000).toFixed(2) + ' km', s.hours.toFixed(2) + ' h',
    'slope ' + s.maxSlopeDeg.toFixed(1), 'far ' + (s.farthestM / 1000).toFixed(2) + ' km',
    'go=' + s.go, JSON.stringify(Object.keys(s.flags).filter(function (k) { return s.flags[k]; })));
};

// geometry
assert.ok(Math.abs(geo.distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }, cfg.mars.radiusM) - 59158) < 5, '1 degree of latitude');
assert.ok(Math.abs(geo.slopeDeg(1, 1) - 45) < 1e-9, '45 degree grade');
assert.strictEqual(wp.length, 262, 'waypoint count');

// every target and the habitat sit on proven ground
assert.ok(planner.snap(hab) >= 0, 'habitat on rover path');
data.targets.forEach(function (t) { assert.ok(planner.snap(stop(t)) >= 0, t.name + ' on rover path'); });

// empty plan
var empty = planner.summarize([hab]);
assert.ok(empty.flags.empty && !empty.go && empty.minutes === 0, 'empty plan');
assert.equal(empty.verdict, 'No plan yet');

// planning limit comes from the consumables, in one place
assert.ok(Math.abs(planner.limitHours() - 6.4) < 1e-9, 'limit = 8 h suit design less 20%');

// flat 1 km unverified walk: 1 / baseSpeed h * (1 + 5/15) * 1.3
var flat = planner.leg({ lat: 18.6, lon: 77.6 }, { lat: 18.6 + 1000 / 59158, lon: 77.6 });
assert.ok(!flat.verified, 'off-path leg is unverified');
assert.ok(Math.abs(flat.minutes - (60 / cfg.walking.baseSpeedKmh) * (1 + 5 / 15) * 1.3) < 0.05, 'flat walking time ' + flat.minutes);

// plans
var near = planner.summarize([hab, T['Amalik'], T['Observation Mountain'], hab]);
show('Hab > Amalik > Obs Mtn > Hab', near);
assert.ok(near.closed && near.unverifiedLegs === 0, 'delta loop is closed and verified');
assert.ok(near.go, 'delta loop is a GO');
assert.equal(near.verdict, 'Go');

var ridge = planner.summarize([hab, T['Skinner Ridge'], hab]);
show('Hab > Skinner Ridge > Hab', ridge);
assert.ok(ridge.maxSlopeDeg >= cfg.slope.cautionDeg, 'Hawksbill Gap climb is steep');
assert.equal(ridge.verdict, 'Go with caution');

var floor = planner.summarize([hab, T['Brac'], hab]);
show('Hab > Brac > Hab', floor);
assert.ok(floor.flags.walkBack && !floor.go, 'crater floor is out of walking range');
assert.equal(floor.verdict, 'No-go');

var open = planner.summarize([hab, T['Amalik']]);
assert.ok(open.flags.open && !open.go, 'open route is not a GO');
assert.equal(open.verdict, 'Go with caution', 'draft return leg is a warning, not a safety breach');

var unverified = planner.summarize([hab, { lat: hab.lat + 0.01, lon: hab.lon + 0.01 }, hab]);
assert.ok(unverified.flags.unverified);
assert.equal(unverified.verdict, 'Go with caution');
var tooLong = Object.assign({}, T['Amalik'], { stopMin: 480 });
assert.equal(planner.summarize([hab, tooLong]).verdict, 'No-go', 'open drafts still enforce time limits');
assert.equal(planner.summarize([hab, T['Brac']]).verdict, 'No-go', 'open drafts still enforce walk-back limits');

// Check exact threshold boundaries without changing authoritative config or terrain.
var boundaryConfig = JSON.parse(JSON.stringify(cfg));
boundaryConfig.slope.cautionDeg = near.maxSlopeDeg;
assert.equal(ARES.createPlanner(boundaryConfig, wp).summarize([hab, T['Amalik'], T['Observation Mountain'], hab]).verdict,
  'Go with caution', 'caution starts at its configured threshold');
boundaryConfig.slope.limitDeg = near.maxSlopeDeg;
assert.equal(ARES.createPlanner(boundaryConfig, wp).summarize([hab, T['Amalik']]).verdict,
  'No-go', 'a draft at the slope limit is unsafe');
var atLimit = Object.assign({}, hab, { stopMin: planner.limitHours() * 60 - cfg.eva.airlockMin });
assert.equal(planner.summarize([hab, atLimit]).verdict, 'Go', 'exact time limit holds the configured reserve');
atLimit.stopMin += 0.01;
assert.equal(planner.summarize([hab, atLimit]).verdict, 'No-go', 'even a small time excess is flagged');

data.targets.forEach(function (t) { show('Hab > ' + t.name + ' > Hab', planner.summarize([hab, stop(t), hab])); });
console.log('all tests passed');
