/* Run with: node tests/visor-tests.js */
'use strict';
var assert = require('node:assert/strict');
global.window = global;
require('../js/visorControls.js');
var V = ARES.voiceCommand;

// Spoken phrases map to one fixed command each.
assert.equal(V.parse('Start route'), 'start');
assert.equal(V.parse('okay begin'), 'start');
assert.equal(V.parse('pause'), 'pause');
assert.equal(V.parse('hold on'), 'pause');
assert.equal(V.parse('resume'), 'resume');
assert.equal(V.parse('status report'), 'status');
assert.equal(V.parse('how far is it'), 'status');
assert.equal(V.parse('Return to base!'), 'return');
assert.equal(V.parse('close visor'), 'close');
assert.equal(V.parse('help'), 'help');

// "back to base" and "go home" are a return, not a start; whole words only.
assert.equal(V.parse('take me back to base'), 'return');
assert.equal(V.parse('go home'), 'return');
assert.equal(V.parse('goat'), null);
assert.equal(V.parse('the weather is nice'), null);
assert.equal(V.parse(''), null);

console.log('Voice command matching tests passed.');
