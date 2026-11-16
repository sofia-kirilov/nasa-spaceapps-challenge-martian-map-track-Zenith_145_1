/* Run with: node tests/app-tests.js. Exercises real app handlers with a small DOM/map adapter. */
'use strict';
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function boot(memory) {
  var nodes = [], elements = {}, timers = [], now = 0;
  function Node(tag) {
    this.tag = tag; this.children = []; this.handlers = {}; this.style = {}; this.dataset = {};
    this.value = ''; this.textContent = ''; this.disabled = false; this.clientWidth = 0;
    var self = this;
    this.classList = {
      add: function (name) { self.className = (self.className || '') + ' ' + name; },
      remove: function (name) { self.className = (self.className || '').split(' ').filter(function (c) { return c !== name; }).join(' '); },
      toggle: function (name, on) { this[on ? 'add' : 'remove'](name); }
    };
    nodes.push(this);
  }
  Node.prototype.append = function () {
    var self = this;
    Array.from(arguments).forEach(function (child) {
      self.children.push(child);
      if (self.tag === 'select' && self.children.length === 1) self.value = child.value;
    });
  };
  Node.prototype.replaceChildren = function () { this.children = []; this.append.apply(this, arguments); };
  Node.prototype.setAttribute = function (key, value) { this[key] = value; };
  Node.prototype.addEventListener = function (key, fn) { this.handlers[key] = fn; };
  Node.prototype.focus = Node.prototype.scrollIntoView = function () {};
  Node.prototype.click = function () { if (!this.disabled && this.handlers.click) this.handlers.click(); };
  Node.prototype.showModal = function () { this.open = true; };
  Node.prototype.close = function () { this.open = false; if (this.handlers.close) this.handlers.close(); };
  Object.defineProperty(Node.prototype, 'firstChild', { get: function () { return this.children[0]; } });
  Object.defineProperty(Node.prototype, 'lastElementChild', { get: function () { return this.children[this.children.length - 1]; } });
  Array.from(html.matchAll(/<([\w]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)).forEach(function (match) {
    var node = elements[match[2]] = new Node(match[1]);
    node.id = match[2]; node.hidden = /\bhidden\b/.test(match[0]);
  });
  var document = {
    documentElement: { lang: 'en' }, hidden: false, handlers: {}, body: new Node('body'),
    getElementById: function (id) { assert.ok(elements[id], 'app requests an existing DOM ID: ' + id); return elements[id]; },
    createElement: function (tag) { return new Node(tag); },
    createTextNode: function (text) { var n = new Node('text'); n.textContent = text; return n; },
    querySelectorAll: function (selector) { return nodes.filter(function (n) { return (n.className || '').split(' ').includes(selector.slice(1)); }); },
    addEventListener: function (name, fn) { this.handlers[name] = fn; }
  };
  function layer() {
    return { handlers: {}, addTo: function () { return this; }, setStyle: function () {}, setOpacity: function () {},
      on: function (name, fn) { this.handlers[name] = fn; return this; },
      bindTooltip: function () { return this; }, setLatLng: function (p) { this.position = p; },
      clearLayers: function () {}, eachLayer: function () {} };
  }
  var map = layer();
  map.attributionControl = { setPrefix: function () {}, addAttribution: function () {} };
  map.invalidateSize = map.removeLayer = map.fitBounds = map.setView = function () {};
  map.getCenter = function () { return { lat: 18.45, lng: 77.4 }; };
  map.getZoom = function () { return 14; };
  var context = { document: document, navigator: { onLine: true }, console: console,
    isSecureContext: true, location: { protocol: 'http:' }, Date: { now: function () { return now; } },
    localStorage: { getItem: function (key) { return memory[key] || null; }, setItem: function (key, value) { memory[key] = value; } },
    setInterval: function (fn, ms) { timers.push({ fn: fn, ms: ms }); }, setTimeout: function () {},
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
    ResizeObserver: function () { this.observe = function () {}; },
    addEventListener: function () {}, dispatchEvent: function () {},
    L: { extend: Object.assign, CRS: { EPSG4326: {} }, map: function () { return map; },
      control: { scale: layer }, layerGroup: layer, polyline: layer, circleMarker: layer, marker: layer,
      divIcon: function (options) { return options; }, tileLayer: layer, latLngBounds: function (points) { return points; } }
  };
  context.window = context;
  vm.createContext(context);
  ['config', 'geo', 'roverTraverse', 'marsData', 'offlineAssets', 'planner', 'crewRouter', 'navigation', 'speechNotes', 'sampleLog'].forEach(function (name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/' + name + '.js'), 'utf8'), context);
  });
  context.ARES.api = { roverImages: function () { return Promise.resolve([]); }, geologyAt: function () { return Promise.resolve(null); },
    latestWeather: function () { return Promise.resolve(null); }, spaceWeather: function () { return Promise.resolve({ particleEvents: 0, total: 0 }); } };
  context.ARES.createHud = function () { return { update: function () {}, open: function () {} }; };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), context);
  return { elements: elements, nodes: nodes, debug: context.ARES.debug, context: context,
    tick: function (seconds) { now += seconds * 1000; timers.find(function (t) { return t.ms === 1000; }).fn(); } };
}
var memory = {}, app = boot(memory), e = app.elements;
assert.ok(e.startRoute.disabled, 'empty route cannot start');
e.emergencyRTB.click(); assert.match(e.rtbStatus.textContent, /Start a route first/);
assert.equal(app.debug.navigation.snapshot(), null);
// Add a real science stop through its real inspection drawer, then append home.
e.targetCards.children[0].click();
var add = app.nodes.find(function (n) { return n.className === 'primary add-to-route'; });
add.click(); e.returnHome.click();
assert.equal(app.debug.state.stops.length, 3);
assert.equal(e.startRoute.disabled, false);
e.startRoute.click();
assert.ok(e.activeNavigation.hidden === false && e.startRoute.hidden);
['addMode', 'returnHome', 'undo', 'clear'].forEach(function (id) { assert.ok(e[id].disabled, id + ' locks during navigation'); });
var lockedStops = JSON.stringify(app.debug.state.stops);
e.clear.handlers.click(); e.undo.handlers.click(); e.returnHome.handlers.click();
assert.equal(JSON.stringify(app.debug.state.stops), lockedStops, 'event guards protect the locked route');
app.tick(1); assert.ok(app.debug.navigation.snapshot().elapsedMin > 0);
e.pauseNavigation.click(); var elapsed = app.debug.navigation.snapshot().elapsedMin;
app.tick(1); assert.equal(app.debug.navigation.snapshot().elapsedMin, elapsed);
var savedSteps = app.debug.navigation.export().steps, cursor = 0;
savedSteps.some(function (s) {
  if (s.verified && s.distanceM > 5) { e.simulationElapsed.value = cursor + s.minutes / 2; return true; }
  cursor += s.minutes; return false;
});
e.simulationElapsed.handlers.input();
var position = app.debug.navigation.snapshot().position;
assert.match(e.suitReadout.textContent, /simulated/);
e.emergencyRTB.click();
assert.equal(app.debug.navigation.snapshot().mode, 'return');
assert.equal(app.debug.navigation.snapshot().position.lat, position.lat);
assert.equal(app.debug.navigation.snapshot().position.lon, position.lon);
assert.match(e.rtbStatus.textContent, /Returning from your current simulated position/);
assert.equal(JSON.stringify(app.debug.state.stops), lockedStops);
assert.equal(e.rtbPanel.hidden, false);
var restored = boot(memory);
assert.equal(restored.debug.navigation.snapshot().mode, 'return');
assert.equal(restored.debug.navigation.snapshot().paused, true);
assert.equal(restored.debug.navigation.snapshot().position.lat, position.lat);
assert.ok(restored.elements.clear.disabled);
assert.match(restored.elements.rtbStatus.textContent, /Returning from your current simulated position/);
restored.elements.endNavigation.click();
assert.equal(restored.debug.navigation.snapshot(), null);
assert.equal(restored.elements.clear.disabled, false);
assert.equal(restored.elements.rtbPanel.hidden, true);
assert.equal(JSON.parse(memory['ares.crew.v1.navigation']), null);
assert.equal(JSON.stringify(restored.debug.state.stops), lockedStops);
console.log('App start/lock, simulation controls, automatic RTB, persistence and end-navigation tests passed.');
