/* Run with: node tests/navigation-tests.js */
'use strict';
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var context = { console: console, navigator: { onLine: true },
  localStorage: { getItem: function () { return null; }, setItem: function () {} } };
context.window = context;
vm.createContext(context);
['config', 'geo', 'roverTraverse', 'marsData', 'offlineAssets', 'planner', 'crewRouter', 'navigation', 'hud'].forEach(function (name) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), context);
});
var A = context.ARES, config = A.config, base = A.data.habitat;
var original = JSON.stringify({ config: config, data: A.data, traverse: A.roverTraverse });
var planner = A.createPlanner(config, A.roverTraverse.waypoints);
var router = A.createCrewRouter(config, A.roverTraverse.waypoints);
var nav = A.createNavigation(config);
var target = A.data.targets.find(function (t) { return t.name === 'Amalik'; });
var stops = [base, target, base];
var summary = planner.summarize(stops);
assert.equal(nav.start([base], planner.summarize([base])), false);
var unsafe = [base, { name: 'Far away', lat: 0, lon: 0 }];
assert.equal(nav.start(unsafe, planner.summarize(unsafe)), false);
assert.ok(nav.start(stops, summary));
assert.equal(nav.start(stops, summary), false, 'an active route cannot be replaced by another start');
assert.equal(nav.snapshot().phase, 'airlock');
assert.equal(nav.snapshot().position.lat, base.lat);
assert.equal(nav.snapshot().totalMin, summary.minutes, 'simulation preserves the full planner ETA');
var steps = nav.export().steps;
assert.ok(Math.abs(steps.reduce(function (n, s) { return n + s.minutes; }, 0) - summary.minutes) < 1e-8);
// Seek into a measured walking edge, away from either science-stop dropdown position.
var cursor = 0, chosen;
steps.some(function (step) {
  if (step.verified && step.distanceM > 5) { chosen = step; return true; }
  cursor += step.minutes;
  return false;
});
assert.ok(chosen);
nav.seek(cursor + chosen.minutes / 2);
var active = nav.snapshot();
assert.equal(active.phase, 'walking');
assert.ok(Math.abs(active.position.lat - (chosen.a.lat + chosen.b.lat) / 2) < 1e-10);
assert.ok(Math.abs(active.position.lon - (chosen.a.lon + chosen.b.lon) / 2) < 1e-10);
assert.ok(A.geo.distanceM(active.position, target, config.mars.radiusM) > 1);
assert.ok(active.position.pathSegment.verified);
assert.ok(active.percent > 0 && active.percent < 100);
nav.togglePause(); var pausedAt = nav.snapshot().elapsedMin;
nav.advance(10); assert.equal(nav.snapshot().elapsedMin, pausedAt);
nav.togglePause(); nav.advance(0.01); assert.ok(nav.snapshot().elapsedMin > pausedAt);
active = nav.snapshot();
var route = router.fastestReturn(active.position, base);
assert.ok(route.available);
assert.equal(route.points[0].lat, active.position.lat);
assert.equal(route.points[0].lon, active.position.lon);
assert.equal(route.connectorM, 0, 'measured mid-edge position is not an unverified connector');
var sourcePosition = JSON.stringify(active.position);
assert.ok(nav.beginReturn(route));
assert.equal(nav.snapshot().mode, 'return');
assert.equal(nav.snapshot().position.lat, active.position.lat, 'return starts at the current position without teleporting');
assert.equal(nav.snapshot().totalElapsedMin, active.totalElapsedMin, 'RTB keeps prior suit consumption');
assert.equal(nav.snapshot().nextName, 'Three Forks habitat');
assert.equal(JSON.stringify(active.position), sourcePosition);
nav.seek(route.minutes / 3);
var again = nav.snapshot();
var nextReturn = router.fastestReturn(again.position, base);
assert.ok(nextReturn.available);
assert.ok(nextReturn.minutes < route.minutes, 'return route advances toward home');
assert.ok(nav.beginReturn(nextReturn), 'RTB can be recalculated while already returning');
assert.equal(nav.snapshot().totalElapsedMin, again.totalElapsedMin);
var saved = nav.export();
var restored = A.createNavigation(config);
assert.ok(restored.restore(JSON.parse(JSON.stringify(saved))));
assert.equal(restored.snapshot().paused, true);
assert.equal(restored.snapshot().position.lon, nav.snapshot().position.lon);
assert.equal(restored.snapshot().totalElapsedMin, nav.snapshot().totalElapsedMin);
var telemetry = A.hudTelemetry(config, { summary: summary, stops: stops, position: again.position,
  routeIndex: -1, navigation: again, returnRoute: nextReturn });
assert.ok(Math.abs(telemetry.oxygenPercent - 100 * (1 - again.totalElapsedMin / 60 / 8)) < 1e-8);
assert.equal(telemetry.nextDistanceM, again.nextDistanceM);
nav.seek(1e6);
assert.equal(nav.snapshot().percent, 100);
assert.equal(nav.snapshot().complete, true);
assert.equal(nav.snapshot().paused, true);
assert.equal(nav.snapshot().remainingDistanceM, 0);
assert.equal(nav.snapshot().position.lat, base.lat);
assert.equal(nav.snapshot().position.lon, base.lon);
nav.end(); assert.equal(nav.snapshot(), null);
assert.ok(nav.start(stops, summary), 'ending unlocks a new session');
assert.equal(nav.restore({ mode: 'eva', steps: [{}], stops: stops, totalMin: 1, elapsedMin: 0 }), false);
assert.equal(nav.restore(null), false);
var changedConfig = JSON.parse(JSON.stringify(config));
changedConfig.walking.baseSpeedKmh += 0.1;
assert.equal(A.createNavigation(changedConfig).restore(saved), false, 'a cached simulation cannot override updated model inputs');
var damaged = JSON.parse(JSON.stringify(saved)); damaged.steps[0].a.lat = 999;
assert.equal(A.createNavigation(config).restore(damaged), false, 'invalid cached coordinates are rejected');
damaged = JSON.parse(JSON.stringify(saved)); damaged.returnRoute.points = 'damaged';
assert.equal(A.createNavigation(config).restore(damaged), false, 'invalid cached return geometry is rejected');
assert.equal(JSON.stringify({ config: config, data: A.data, traverse: A.roverTraverse }), original);

// Verify that edge-aware routing can use a long recorded edge beyond the node snap radius.
var longEdge = [{ lat: 0, lon: 0, elev: 0, tilt: 0 }, { lat: 0, lon: 0.01, elev: 0, tilt: 0 }];
var midpoint = { lat: 0, lon: 0.005, pathSegment: { from: longEdge[0], to: longEdge[1], verified: true } };
var longRouter = A.createCrewRouter(config, longEdge);
assert.ok(longRouter.fastestReturn(midpoint, longEdge[0]).available);
assert.equal(longRouter.fastestReturn({ lat: 0, lon: 0.005 }, longEdge[0]).available, false);

// Validate actual markup: one header, unique IDs, no status verdict or station controls in it.
var html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
var ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), function (m) { return m[1]; });
assert.equal(new Set(ids).size, ids.length, 'all DOM IDs are unique');
assert.equal((html.match(/<head>/g) || []).length, 1);
assert.equal((html.match(/<body>/g) || []).length, 1);
var header = html.match(/<header class="mission-bar"[\s\S]*?<\/header>/)[0];
assert.ok(!/verdict|Go with caution|stationControl|stationCrew|duration/.test(header));
assert.ok(header.includes('id="emergencyRTB"') && header.includes('id="solarTime"') && header.includes('id="suitStatus"'));
assert.ok(!/crewPosition|calculateRTB|dismissRTB|station-switch|uplink/.test(html));
assert.ok(html.indexOf('id="verdict"') > html.indexOf('id="routePanel"'));
console.log('Active simulation, current-position return routing, reload, suit telemetry and markup tests passed.');
