/* Run with: node tests/crew-tests.js */
'use strict';
var assert = require('node:assert/strict');
var fs = require('node:fs');
var vm = require('node:vm');
var path = require('node:path');
function makeContext(storage) {
  var context = { console: console, navigator: { onLine: true }, document: { documentElement: { lang: 'en-US' } },
    localStorage: storage || { getItem: function () { return null; }, setItem: function () {} } };
  context.window = context;
  vm.createContext(context);
  ['config','geo','roverTraverse','marsData','offlineAssets','crewRouter','speechNotes'].forEach(function (name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), context);
  });
  return context;
}
var memory = {};
var storage = { getItem: function (key) { return memory[key] || null; }, setItem: function (key, value) { memory[key] = value; } };
var context = makeContext(storage);
var A = context.ARES;
var original = JSON.stringify({ data: A.data, traverse: A.roverTraverse, config: A.config });
function freeze(value) { Object.freeze(value); Object.values(value).forEach(function (v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) freeze(v); }); }
freeze(A.data); freeze(A.config); freeze(A.roverTraverse);
var router = A.createCrewRouter(A.config, A.roverTraverse.waypoints);
A.data.targets.forEach(function (target) {
  var route = router.fastestReturn(target, A.data.habitat);
  assert.ok(route.available && route.minutes > 0 && route.distanceM > 0, target.name);
  assert.equal(route.points[0].lat, target.lat);
  assert.equal(route.points[route.points.length - 1].lon, A.data.habitat.lon);
});
assert.ok(router.fastestReturn(A.data.habitat, A.data.habitat).atBase);
assert.equal(router.fastestReturn({ lat: 0, lon: 0 }, A.data.habitat).available, false);
assert.equal(A.createCrewRouter(A.config, []).fastestReturn(A.data.targets[0], A.data.habitat).available, false);

// A shorter steep link competes with a longer flat detour. Time weighting must choose the detour.
var cfg = JSON.parse(JSON.stringify(A.config));
cfg.rover.linkRadiusM = 65;
var points = [
  {lat:0,lon:0,elev:0,tilt:0}, {lat:0,lon:0.001,elev:100,tilt:0},
  {lat:0,lon:0.002,elev:0,tilt:0}, {lat:0.0003,lon:0.001,elev:0,tilt:0}
];
var route = A.createCrewRouter(cfg, points).fastestReturn(points[0], points[2]);
assert.ok(route.points.some(function (p) { return p.lat === 0.0003; }), 'fastest route uses flat detour');
assert.ok(!route.points.some(function (p) { return p.elev === 100; }), 'fastest route avoids slower steep link');
var nearby = {lat:0.00001,lon:0};
var connected = A.createCrewRouter(cfg, points).fastestReturn(nearby, points[2]);
assert.ok(connected.connectorM > 0 && connected.minutes > route.minutes, 'off-node connector distance and time included');

// Durable source snapshots, corrupt cache fallback, blocked/quota storage, and fresh-data precedence.
var snapshot = JSON.parse(memory['ares.crew.v1.datasets']);
assert.equal(snapshot.roverTraverse.waypoints.length, 262);
var loadedData = A.data;
A.offline.prepareData();
assert.equal(A.data, loadedData, 'cache never overrides source objects');
A.offline.saveRoute([A.data.habitat, A.data.targets[1], {name:'Site X',custom:true,lat:18.45,lon:77.4}]);
var restored = A.offline.restoreRoute(A.data.habitat);
assert.equal(restored[1].lat, A.data.targets[1].lat);
assert.ok(restored[2].custom);
var oldLat = snapshot.data.targets[1].lat;
snapshot.data.targets[1].lat = 1;
memory['ares.crew.v1.datasets'] = JSON.stringify(snapshot);
A.offline.prepareData();
assert.equal(A.data.targets[1].lat, oldLat, 'fresh scientific coordinates win');
var fallbackContext = makeContext(storage);
var snapshotData = fallbackContext.ARES.data;
delete fallbackContext.ARES.data;
fallbackContext.ARES.offline.prepareData();
assert.equal(fallbackContext.ARES.data.targets[0].lat, snapshotData.targets[0].lat, 'missing source restored from snapshot');
memory['ares.crew.v1.route'] = '{invalid';
assert.equal(A.offline.restoreRoute(A.data.habitat).length, 1);
assert.ok(A.offline.hasProblem());
var blocked = makeContext({getItem:function(){throw new Error('blocked');},setItem:function(){throw new Error('quota');}});
assert.equal(blocked.ARES.offline.write('draft', 'x'), false);
assert.ok(blocked.ARES.offline.hasProblem());
assert.equal(JSON.stringify({data:A.data,traverse:A.roverTraverse,config:A.config}), original, 'all source structures unchanged');

// Speech result ownership, interim/final separation, stop, late results, errors and retry.
var engines = [];
function Recognition() { engines.push(this); }
Recognition.prototype.start = function () {};
Recognition.prototype.stop = function () { this.onend(); };
Recognition.prototype.abort = function () { this.onend(); };
var texts = [], states = [], interim = [];
var speech = A.createSpeechNotes(Recognition, {
  text:function(key,text){texts.push([key,text]);}, state:function(active,message){states.push([active,message]);},
  interim:function(text){interim.push(text);}
});
assert.ok(speech.start('target:01'));
assert.equal(speech.start('target:02'), false, 'only one microphone session');
var pending = [{transcript:'layered'}]; pending.isFinal = false;
engines[0].onresult({resultIndex:0,results:[pending]});
assert.equal(texts.length,0);
assert.equal(interim[0],'layered');
var finalResult = [{transcript:'layered basalt'}]; finalResult.isFinal = true;
engines[0].onresult({resultIndex:0,results:[finalResult]});
assert.equal(texts[0][0],'target:01');
speech.cancel(); speech.start('target:02');
engines[0].onresult({resultIndex:0,results:[finalResult]});
assert.equal(texts.length,1,'late result cannot leak into another waypoint');
engines[1].onerror({error:'not-allowed'});
assert.equal(speech.isActive(),false);
assert.match(states[states.length-1][1],/permission denied/);
speech.start('target:02'); speech.stop();
assert.equal(speech.isActive(),false);
assert.equal(A.createSpeechNotes(null,{state:function(){}}).start('x'),false);

// Exercise sample logging with a minimal DOM, independent of browser speech support.
function Element(tag) {
  this.tag = tag; this.value = ''; this.children = []; this.handlers = {}; this.textContent = '';
  this.classList = { toggle: function () {} };
}
Element.prototype.setAttribute = function (key, value) { this[key] = value; };
Element.prototype.append = function () {
  var self = this;
  Array.from(arguments).forEach(function (child) {
    self.children.push(child);
    if (self.tag === 'select' && self.children.length === 1) self.value = child.value;
  });
};
Element.prototype.replaceChildren = function () { this.children = []; this.value = ''; this.append.apply(this, arguments); };
Element.prototype.addEventListener = function (type, fn) { this.handlers[type] = fn; };
Element.prototype.focus = Element.prototype.scrollIntoView = function () {};
var elements = {};
context.document = {
  documentElement: { lang: 'en-US' },
  getElementById: function (id) {
    if (!elements[id]) elements[id] = new Element(id === 'sampleWaypoint' ? 'select' : 'div');
    return elements[id];
  },
  createElement: function (tag) { return new Element(tag); }
};
context.addEventListener = function () {};
context.isSecureContext = true;
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sampleLog.js'), 'utf8'), context);
var logger = A.createSampleLog();
var custom = { custom:true, name:'Core station', lat:18.45, lon:77.4 };
logger.refresh([A.data.habitat, custom]);
assert.ok(elements.startDictation.disabled, 'unsupported dictation still permits typing');
elements.sampleText.value = 'Sample C01: fine laminae, dry scoop.';
elements.sampleText.handlers.input();
elements.saveSample.handlers.click();
assert.equal(logger.export().logs.length, 1);
assert.equal(logger.export().logs[0].waypoint.lat, A.data.targets[0].lat);
assert.equal(elements.sampleText.value, '');
logger.select(custom);
elements.sampleText.value = 'Pending regolith observation';
elements.sampleText.handlers.input();
logger = A.createSampleLog();
logger.refresh([A.data.habitat]); // Draft's custom location survives removing its route.
logger.select(custom);
assert.equal(elements.sampleText.value, 'Pending regolith observation');
assert.equal(logger.export().logs.length, 1, 'saved notes survive reload');
context.localStorage = {
  getItem: storage.getItem,
  setItem: function (key, value) { if (key.endsWith('sampleLogs')) throw new Error('quota'); storage.setItem(key, value); }
};
elements.saveSample.handlers.click();
assert.equal(elements.sampleText.value, 'Pending regolith observation', 'failed save retains draft');
assert.equal(logger.export().logs.length, 1, 'failed save does not report a saved log');
assert.match(elements.speechStatus.textContent, /Could not save/);
// Deletion must persist atomically and survive reload, including storage failures.
context.localStorage = storage;
logger.select(A.data.targets[0]);
var deleteButton = elements.sampleLogs.children[0].children[0].children[1];
context.localStorage = { getItem: storage.getItem, setItem: function () { throw new Error('blocked'); } };
deleteButton.handlers.click();
assert.equal(logger.export().logs.length, 1, 'failed deletion keeps the saved log');
assert.match(elements.speechStatus.textContent, /Could not delete/);
context.localStorage = storage;
deleteButton.handlers.click();
assert.equal(logger.export().logs.length, 0, 'delete removes the exact saved entry');
logger = A.createSampleLog(); logger.refresh([A.data.habitat]);
assert.equal(logger.export().logs.length, 0, 'deletion survives reload');
// A network failure keeps its notice after onend, ignores late results and allows retry.
speech.start('target:01');
var failingEngine = engines[engines.length - 1];
failingEngine.onerror({error:'network'});
failingEngine.onend();
assert.equal(speech.isActive(), false);
assert.equal(states[states.length - 1][1], 'Speech recognition unavailable offline — tap to type');
var beforeLate = texts.length;
failingEngine.onresult({resultIndex:0,results:[finalResult]});
assert.equal(texts.length, beforeLate);
context.navigator.onLine = false;
assert.equal(speech.start('target:01'), false);
assert.equal(states[states.length - 1][1], 'Speech recognition unavailable offline — tap to type');
context.navigator.onLine = true;
assert.equal(speech.start('target:01'), true, 'dictation can retry after recovery'); speech.cancel();
// The actual logging UI retains the draft and exposes manual entry while offline.
context.SpeechRecognition = Recognition;
logger = A.createSampleLog(); logger.refresh([A.data.habitat]);
elements.sampleText.value = 'Offline typed observation'; elements.sampleText.handlers.input();
context.navigator.onLine = false;
elements.startDictation.handlers.click();
assert.equal(elements.speechStatus.textContent, 'Speech recognition unavailable offline — tap to type');
assert.equal(elements.typeSample.hidden, false);
assert.equal(elements.saveSample.disabled, false);
assert.equal(elements.sampleText.value, 'Offline typed observation');
elements.typeSample.handlers.click(); elements.saveSample.handlers.click();
assert.equal(logger.export().logs[0].text, 'Offline typed observation');
context.navigator.onLine = true;
console.log('Crew routes, cache integrity, sample persistence/deletion and speech fallback tests passed.');

