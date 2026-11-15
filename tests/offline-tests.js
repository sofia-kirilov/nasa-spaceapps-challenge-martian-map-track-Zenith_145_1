/* Run with: node tests/offline-tests.js */
'use strict';
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');

async function run() {
  var origin = 'https://ares.test/';
  var stores = new Map();
  var handlers = {};
  var network = true;
  var sourceText = 'updated source';
  var key = function (request) { return new URL(typeof request === 'string' ? request : request.url, origin).href; };
  var caches = {
    keys: async function () { return Array.from(stores.keys()); },
    delete: async function (name) { return stores.delete(name); },
    open: async function (name) {
      if (!stores.has(name)) stores.set(name, new Map());
      var entries = stores.get(name);
      return {
        addAll: async function (files) {
          files.forEach(function (file) {
            var local = file === './' ? 'index.html' : file;
            var bytes = fs.readFileSync(path.join(__dirname, '..', local));
            entries.set(key(file), new Response(bytes));
          });
        },
        put: async function (request, response) { entries.set(key(request), response.clone()); },
        match: async function (request) { var r = entries.get(key(request)); return r && r.clone(); },
        keys: async function () { return Array.from(entries.keys()).map(function (url) { return new Request(url); }); },
        delete: async function (request) { return entries.delete(key(request)); }
      };
    }
  };
  var context = {
    URL:URL, Response:Response, caches:caches,
    fetch:async function () { if (!network) throw new Error('offline'); return new Response(sourceText); },
    self:{
      registration:{scope:origin}, location:{origin:new URL(origin).origin},
      addEventListener:function (name, fn) { handlers[name] = fn; },
      skipWaiting:async function () {}, clients:{claim:async function () {}}
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), context);
  var pending;
  handlers.install({waitUntil:function (promise) { pending = promise; }});
  await pending;
  stores.set('ares-shell-old', new Map());
  stores.set('another-app-cache', new Map());
  handlers.activate({waitUntil:function (promise) { pending = promise; }});
  await pending;
  assert.ok(!stores.has('ares-shell-old'));
  assert.ok(stores.has('another-app-cache'), 'other applications caches untouched');

  function request(url, mode) {
    var response;
    handlers.fetch({request:{method:'GET',url:new URL(url,origin).href,mode:mode || 'cors'},
      respondWith:function (promise) { response = promise; }});
    return response;
  }
  network = false;
  var shell = await (await request(origin,'navigate')).text();
  assert.match(shell, /id="emergencyRTB"/);
  ['planTab', 'stopsTab', 'logTab', 'conditionsTab', 'layersTab', 'addMode', 'returnHome', 'export', 'sendToHud', 'hudView', 'solarTime'].forEach(function (id) {
    assert.ok(shell.includes('id="' + id + '"'), id + ' remains available offline');
  });
  assert.match(await (await request('js/panels.js')).text(), /function syncSuit/);
  assert.match(await (await request('js/hud.js')).text(), /ARES.createHud/);
  assert.match(await (await request('js/solarClock.js')).text(), /getElementById\('solarStatus'\)/);
  for (var font of ['Roboto.ttf', 'RobotoMono.ttf']) {
    assert.ok((await (await request('assets/fonts/' + font)).arrayBuffer()).byteLength > 1000, font + ' cached offline');
  }
  assert.match(await (await request('js/marsData.js')).text(), /ARES.data/);
  assert.match(await (await request('assets/vendor/leaflet.js')).text(), /Leaflet 1.9.4/);
  assert.equal(request('https://mars.nasa.gov/rss/api/?feed=weather'), undefined, 'weather never replayed as live');

  network = true;
  assert.equal(await (await request('js/marsData.js')).text(), sourceText, 'new online source wins');
  network = false;
  assert.equal(await (await request('js/marsData.js')).text(), sourceText, 'last successful source available offline');

  network = true;
  for (var i=0; i<245; i++) await request('https://trek.nasa.gov/tiles/Mars/EQ/layer/' + i + '.png');
  assert.equal(stores.get('ares-tiles-v1').size,240,'tile cache stays bounded');
  network = false;
  assert.equal(await (await request('https://trek.nasa.gov/tiles/Mars/EQ/layer/244.png')).text(),sourceText);
  await assert.rejects(request('https://trek.nasa.gov/tiles/Mars/EQ/unvisited.png'), /offline/);
  console.log('Offline shell, exact data caching, fresh-source precedence and bounded tile cache tests passed.');
}
module.exports = run();
module.exports.catch(function (error) { console.error(error); process.exitCode = 1; });
