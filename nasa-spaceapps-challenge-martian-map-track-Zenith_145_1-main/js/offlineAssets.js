/* Browser-local copies only. Fresh source files always take precedence. */
window.ARES = window.ARES || {};

ARES.offline = (function () {
  'use strict';
  var prefix = 'ares.crew.v1.';
  var problem = '';
  var listeners = [];
  var shellStatus = 'Preparing offline app…';

  function notify() { listeners.forEach(function (fn) { fn(); }); }
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(prefix + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      problem = 'Local cache unavailable or damaged. Export your work before closing.';
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
      return true;
    } catch (error) {
      problem = 'Local storage is blocked or full. Changes remain in this session; export before closing.';
      notify();
      return false;
    }
  }

  function validPoint(p) {
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
  }

  function validSnapshot(s) {
    return s && s.version === 1 && s.config && s.config.map && s.config.mars &&
      s.data && validPoint(s.data.habitat) && Array.isArray(s.data.targets) &&
      s.data.targets.every(validPoint) && Array.isArray(s.data.tileLayers) &&
      s.roverTraverse && Array.isArray(s.roverTraverse.waypoints) &&
      s.roverTraverse.waypoints.length > 0 && s.roverTraverse.waypoints.every(function (w) {
        return validPoint(w) && Number.isFinite(w.elev) && Number.isFinite(w.tilt);
      });
  }

  function prepareData() {
    var saved = read('datasets', null);
    if (validSnapshot(saved)) {
      // Never replace a successfully loaded dataset with a cached copy.
      if (!ARES.config) ARES.config = saved.config;
      if (!ARES.data) ARES.data = saved.data;
      if (!ARES.roverTraverse) ARES.roverTraverse = saved.roverTraverse;
    }
    var current = { version: 1, config: ARES.config, data: ARES.data, roverTraverse: ARES.roverTraverse };
    if (validSnapshot(current)) write('datasets', current);
  }

  // Persist references to official targets, so new source coordinates win on reload.
  function saveRoute(stops) {
    return write('route', stops.map(function (stop) {
      if (stop.lat === ARES.data.habitat.lat && stop.lon === ARES.data.habitat.lon) return { habitat: true };
      var target = ARES.data.targets.find(function (t) { return t.lat === stop.lat && t.lon === stop.lon; });
      return target ? { targetId: target.id } : {
        custom: true, name: stop.name, lat: stop.lat, lon: stop.lon, stopMin: stop.stopMin || 0
      };
    }));
  }

  function restoreRoute(habitat) {
    var records = read('route', []);
    if (!Array.isArray(records)) return [habitat];
    var stops = [habitat];
    records.slice(1).forEach(function (record) {
      if (!record || typeof record !== 'object') return;
      var source = record.habitat ? ARES.data.habitat :
        ARES.data.targets.find(function (t) { return t.id === record.targetId; });
      if (source) stops.push({ name: source.name, lat: source.lat, lon: source.lon, stopMin: source.stopMin || 0 });
      else if (record.custom && validPoint(record)) stops.push({
        name: typeof record.name === 'string' ? record.name : 'Waypoint',
        lat: record.lat, lon: record.lon, custom: true,
        stopMin: Number.isFinite(record.stopMin) && record.stopMin >= 0 ? record.stopMin : 0
      });
    });
    return stops;
  }

  function start() {
    if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then(function () {
        return navigator.serviceWorker.ready;
      }).then(function () {
        shellStatus = 'Offline app ready. Viewed tiles are cached as you explore; unvisited tiles need a connection.';
        notify();
      }).catch(function () {
        shellStatus = 'Offline page cache unavailable. Local waypoint and map settings are still saved.';
        notify();
      });
    } else {
      shellStatus = 'Serve on localhost or HTTPS to cache the app and viewed tiles. Local data caching is available here.';
    }
    window.addEventListener('online', notify);
    window.addEventListener('offline', notify);
    notify();
  }

  return {
    read: read, write: write, validPoint: validPoint, prepareData: prepareData,
    saveRoute: saveRoute, restoreRoute: restoreRoute, start: start,
    subscribe: function (fn) { listeners.push(fn); },
    status: function () { return problem || ((navigator.onLine ? 'Online. ' : 'Offline. ') +
      'Map and waypoint data saved locally. ' + shellStatus); },
    hasProblem: function () { return !!problem; }
  };
})();
