/* Run with: node tests/uplink-tests.js */
'use strict';
var assert = require('node:assert/strict');
global.window = global;
require('../js/uplink.js');
var M = ARES.uplinkMessage;

var hab = { name: 'Habitat', lat: 18.45252, lon: 77.4072, stopMin: 0 };
var stop = { name: 'Amalik', lat: 18.4506, lon: 77.4014, stopMin: 30 };
var summary = { distanceM: 800, minutes: 71, verdict: 'Go' };

// A route needs somewhere to go.
assert.equal(M.route('control', [hab], summary, 'a', 1), null);
assert.equal(M.route('nobody', [hab, stop], summary, 'a', 1), null);

var message = M.route('control', [hab, stop, hab], summary, 'a', 1);
assert.equal(message.type, 'route');
assert.equal(message.stops.length, 3);
assert.equal(M.describe(message), '2 legs · 0.80 km · 1 h 11 min · Go');

// The other station shows it; the sending station ignores its own message.
assert.equal(M.acceptable(message, 'crew'), true);
assert.equal(M.acceptable(message, 'control'), false);

// Crew can send a route back for approval.
assert.equal(M.acceptable(M.route('crew', [hab, stop], summary, 'b', 2), 'control'), true);

// Malformed or oversized messages are dropped.
assert.equal(M.acceptable(null, 'crew'), false);
assert.equal(M.acceptable({ v: 2, type: 'route', from: 'control', stops: [hab, stop] }, 'crew'), false);
assert.equal(M.acceptable({ v: 1, type: 'route', from: 'control', stops: [hab, { name: 'x', lat: 'north', lon: 1 }] }, 'crew'), false);
assert.equal(M.acceptable({ v: 1, type: 'route', from: 'control', stops: new Array(41).fill(stop) }, 'crew'), false);

// Incoming stops are reduced to the fields the planner uses.
var cleaned = M.cleanStop({ name: 'x'.repeat(200), lat: 1, lon: 2, stopMin: -5, extra: '<script>' });
assert.equal(cleaned.name.length, 80);
assert.equal(cleaned.stopMin, 0);
assert.equal(cleaned.extra, undefined);

console.log('Route messages, station filtering and input cleaning tests passed.');
