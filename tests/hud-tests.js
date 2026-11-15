/* Run with: node tests/hud-tests.js */
'use strict';
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
global.window = global;
['config', 'geo', 'roverTraverse', 'marsData', 'planner', 'offlineAssets', 'crewRouter', 'hud'].forEach(function (name) {
  require('../js/' + name + '.js');
});
var cfg = ARES.config, hab = ARES.data.habitat, targets = ARES.data.targets;
var planner = ARES.createPlanner(cfg, ARES.roverTraverse.waypoints);
var router = ARES.createCrewRouter(cfg, ARES.roverTraverse.waypoints);
var amalik = targets.find(function (t) { return t.name === 'Amalik'; });
var observation = targets.find(function (t) { return t.name === 'Observation Mountain'; });
var stops = [hab, amalik, observation, hab];
var summary = planner.summarize(stops);
function snapshot(index, position) {
  position = position || stops[index];
  return { stops: stops, summary: summary, routeIndex: index, position: position, returnRoute: router.fastestReturn(position, hab) };
}
var sourceBefore = JSON.stringify({ cfg: cfg, data: ARES.data, traverse: ARES.roverTraverse, stops: stops, summary: summary });
var start = ARES.hudTelemetry(cfg, snapshot(0));
assert.equal(start.oxygenPercent, 100);
assert.equal(start.returnText, 'At habitat');
assert.equal(start.nextName, 'Amalik');
assert.equal(start.nextDistanceM, summary.legs[0].distanceM, 'next waypoint uses the actual route leg');
var middle = ARES.hudTelemetry(cfg, snapshot(1));
var usedMin = summary.airlockMin + summary.legs[0].minutes + amalik.stopMin;
assert.ok(Math.abs(middle.oxygenPercent - 100 * (1 - usedMin / 60 / 8)) < 1e-8, 'oxygen includes walk, stop and airlock estimates');
assert.equal(middle.nextName, 'Observation Mountain');
var end = ARES.hudTelemetry(cfg, snapshot(3));
assert.equal(end.nextDistanceM, null);
assert.equal(end.nextName, 'Route complete');
assert.ok(Math.abs(end.oxygenPercent - summary.reserves[0].percentLeft) < 1e-8);
var outside = ARES.hudTelemetry(cfg, snapshot(-1, targets.find(function (t) { return t.name === 'Brac'; })));
assert.equal(outside.oxygenPercent, null, 'off-plan positions never invent suit readings');
assert.equal(outside.nextDistanceM, null);
assert.equal(outside.returnState, 'warn');
var unavailable = snapshot(-1, { name: 'Off map', lat: 0, lon: 0 });
assert.equal(ARES.hudTelemetry(cfg, unavailable).returnText, 'Unavailable');
var steep = snapshot(1);
steep.returnRoute = Object.assign({}, steep.returnRoute, { maxSlopeDeg: cfg.slope.limitDeg });
assert.equal(ARES.hudTelemetry(cfg, steep).returnState, 'bad');
assert.equal(ARES.hudTelemetry(cfg, steep).returnText, 'Terrain limit exceeded');
var exhausted = snapshot(1);
exhausted.summary = Object.assign({}, summary, { legs: [Object.assign({}, summary.legs[0], { minutes: 500 })].concat(summary.legs.slice(1)) });
assert.ok(ARES.hudTelemetry(cfg, exhausted).oxygenLow);
var atReserve = snapshot(1);
atReserve.summary = Object.assign({}, summary, { legs: [Object.assign({}, summary.legs[0], { minutes: planner.limitHours() * 60 - summary.airlockMin - amalik.stopMin })].concat(summary.legs.slice(1)) });
assert.equal(ARES.hudTelemetry(cfg, atReserve).oxygenLow, false, 'exact reserve boundary does not trigger a false warning');
assert.equal(ARES.hudTelemetry(cfg, exhausted).returnText, 'Reserve at risk');
assert.equal(JSON.stringify({ cfg: cfg, data: ARES.data, traverse: ARES.roverTraverse, stops: stops, summary: summary }), sourceBefore);

// Exercise modal lifecycle and data refresh independently of a live browser.
var elements = {}, bodyClasses = new Set(), focused = false, resizes = 0;
function node(id) {
  return elements[id] = { attrs: {}, handlers: {}, isConnected: true,
    setAttribute: function (key, value) { this.attrs[key] = String(value); },
    addEventListener: function (type, fn) { this.handlers[type] = fn; },
    focus: function () { focused = true; } };
}
['hudView', 'closeHud', 'hudOxygen', 'hudOxygenNote', 'hudReturn', 'hudReturnNote', 'hudDistance', 'hudWaypoint',
  'hudPosition', 'hudVerdict', 'hudPlanPath', 'hudReturnPath', 'hudBaseMarker', 'hudPositionMarker'].forEach(node);
var view = elements.hudView;
view.showModal = function () { this.open = true; };
view.close = function () { this.open = false; this.handlers.close(); };
global.document = { getElementById: function (id) { return elements[id]; }, activeElement: node('sendToHud'),
  body: { classList: { add: function (name) { bodyClasses.add(name); }, remove: function (name) { bodyClasses.delete(name); } } } };
global.dispatchEvent = function () { resizes++; };
var hud = ARES.createHud(cfg, hab);
hud.update(snapshot(1)); hud.open();
assert.ok(view.open && bodyClasses.has('hud-active'));
assert.equal(elements.hudWaypoint.textContent, 'Observation Mountain');
assert.ok(!/NaN|Infinity/.test(elements.hudPlanPath.attrs.d));
assert.equal(elements.hudReturn.textContent, 'Route available');
hud.update(snapshot(3));
assert.equal(elements.hudWaypoint.textContent, 'Route complete', 'visible HUD updates when its snapshot changes');
elements.closeHud.handlers.click();
assert.ok(!view.open && !bodyClasses.has('hud-active'));
assert.ok(focused && resizes === 2, 'closing restores planner layout and launch-button focus');
var noPlan = { stops: [hab], summary: planner.summarize([hab]), position: hab, routeIndex: 0, returnRoute: router.fastestReturn(hab, hab) };
hud.update(noPlan); hud.open();
assert.equal(elements.hudOxygen.textContent, '100%');
assert.equal(elements.hudWaypoint.textContent, 'Add a waypoint in the planner');
assert.ok(Number.isFinite(Number(elements.hudPositionMarker.attrs.cx)), 'single-point map has a finite marker');
view.close();

// The solar clock mounts in the always-visible header and refreshes on plan edits.
var clockNodes = { solarStatus: {}, solarTime: {}, solarNote: {} }, clockEvents = {}, tick;
var clockContext = { ARES: { data: ARES.data }, Date: Date, Math: Math,
  document: { readyState: 'complete', getElementById: function (id) { assert.ok(clockNodes[id], 'clock only uses header nodes'); return clockNodes[id]; } },
  window: { addEventListener: function (name, fn) { clockEvents[name] = fn; } },
  setInterval: function (fn, ms) { assert.equal(ms, 5000); tick = fn; } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/solarClock.js'), 'utf8'), clockContext);
assert.match(clockNodes.solarTime.textContent, /^\d\d:\d\d LTST$/);
clockEvents['ares:planchange']({ detail: summary });
assert.match(clockNodes.solarStatus.title, /^EVA starting now:/);
clockEvents['ares:planchange']({ detail: noPlan.summary });
assert.match(clockNodes.solarStatus.title, /sunrise|Northern/);
tick();
assert.equal(clockContext.ARES.solarClock.formatClock(23.9999), '00:00');
console.log('HUD estimates, route preview, modal lifecycle, source integrity and header solar clock tests passed.');
