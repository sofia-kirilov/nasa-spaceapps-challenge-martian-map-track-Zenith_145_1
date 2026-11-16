/* Run with: node tests/visor-tests.js */
'use strict';
var assert = require('node:assert/strict');
global.window = global;
require('../js/visorControls.js');
var V = ARES.voiceCommand;

// Spoken phrases map to one fixed command each.
assert.equal(V.parse('Arrived'), 'next');
assert.equal(V.parse('okay next stop please'), 'next');
assert.equal(V.parse('go back'), 'back');
assert.equal(V.parse('previous'), 'back');
assert.equal(V.parse('status report'), 'status');
assert.equal(V.parse('how far is it'), 'status');
assert.equal(V.parse('Return to base!'), 'return');
assert.equal(V.parse('close visor'), 'close');
assert.equal(V.parse('help'), 'help');

// "back to base" is a return, not a step back; whole words only.
assert.equal(V.parse('take me back to base'), 'return');
assert.equal(V.parse('backpack'), null);
assert.equal(V.parse('the weather is nice'), null);
assert.equal(V.parse(''), null);

// Stepping: start at the first stop, stop at the ends, never move without a route.
assert.equal(V.step('next', null, 4), 0);
assert.equal(V.step('next', 0, 4), 1);
assert.equal(V.step('next', 3, 4), null);
assert.equal(V.step('back', 0, 4), null);
assert.equal(V.step('back', 2, 4), 1);
assert.equal(V.step('back', null, 4), null);
assert.equal(V.step('next', null, 1), null);

console.log('Voice command matching and route stepping tests passed.');
