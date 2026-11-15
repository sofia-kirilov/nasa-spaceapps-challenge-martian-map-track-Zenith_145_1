/*
 * uplink.js — passes a route between two stations: Mission control and Crew.
 *
 * Either station can plan a route and uplink it. The other station sees it as an
 * incoming message and must accept it before it replaces the plan on that screen.
 *
 * Transport: BroadcastChannel, which links windows and tabs of this site in the
 * same browser with no server. A flight system would use the suit radio link.
 * To reach other devices, add another entry to `transports` (see the bottom).
 *
 * This file owns no planning logic. app.js hands it three functions:
 *   getPlan()        -> { stops, summary }   the plan on this screen
 *   loadPlan(stops)  -> replaces the plan on this screen
 *   openHud()        -> opens the visor view
 */
window.ARES = window.ARES || {};

/* ---------- Messages (pure, tested in tests/uplink-tests.js) ---------- */

ARES.uplinkMessage = (function () {
  'use strict';
  var ROLES = { control: 'Mission control', crew: 'Crew' };
  var MAX_STOPS = 40;

  function cleanStop(stop) {
    if (!stop || typeof stop.lat !== 'number' || typeof stop.lon !== 'number') return null;
    if (!isFinite(stop.lat) || !isFinite(stop.lon) || Math.abs(stop.lat) > 90 || Math.abs(stop.lon) > 360) return null;
    var minutes = Number(stop.stopMin);
    var clean = {
      name: String(stop.name || 'Waypoint').slice(0, 80),
      lat: stop.lat, lon: stop.lon,
      stopMin: isFinite(minutes) && minutes >= 0 && minutes <= 600 ? minutes : 0
    };
    if (stop.custom) clean.custom = true;
    return clean;
  }

  /** Builds a route message, or null when there is nothing to send. */
  function route(role, stops, summary, id, now) {
    var clean = (stops || []).map(cleanStop);
    if (!ROLES[role] || clean.length < 2 || clean.some(function (s) { return !s; })) return null;
    return {
      v: 1, type: 'route', id: id, from: role, sentAt: now, stops: clean,
      summary: {
        distanceM: Number(summary && summary.distanceM) || 0,
        minutes: Number(summary && summary.minutes) || 0,
        verdict: String(summary && summary.verdict || '').slice(0, 40)
      }
    };
  }

  /** True when an incoming object is a route this station should show. */
  function acceptable(message, myRole) {
    if (!message || message.v !== 1 || message.type !== 'route') return false;
    if (!ROLES[message.from] || message.from === myRole) return false; // ignore our own station
    if (!Array.isArray(message.stops) || message.stops.length < 2 || message.stops.length > MAX_STOPS) return false;
    return message.stops.every(function (stop) { return !!cleanStop(stop); });
  }

  function describe(message) {
    var s = message.summary || {};
    var legs = message.stops.length - 1;
    var hours = Math.floor(s.minutes / 60), minutes = Math.round(s.minutes % 60);
    return legs + (legs === 1 ? ' leg' : ' legs') + ' · ' + (s.distanceM / 1000).toFixed(2) + ' km · ' +
      hours + ' h ' + String(minutes).padStart(2, '0') + ' min' + (s.verdict ? ' · ' + s.verdict : '');
  }

  return { ROLES: ROLES, cleanStop: cleanStop, route: route, acceptable: acceptable, describe: describe };
})();

/* ---------- Station UI and link ---------- */

ARES.createUplink = function (options) {
  'use strict';
  var M = ARES.uplinkMessage;
  function $(id) { return document.getElementById(id); }
  function clock(ms) { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  function other(role) { return role === 'control' ? 'crew' : 'control'; }

  var me = Math.random().toString(36).slice(2, 10); // this window
  var role = 'control';
  try { role = sessionStorage.getItem('ares.station') === 'crew' ? 'crew' : 'control'; } catch (e) { /* keep default */ }
  var peers = {};      // window id -> role, for other open windows
  var incoming = null; // route waiting for a decision
  var lastSentId = null;

  /* Each transport has send(object) and calls receive(object) for what arrives. */
  var transports = [];
  if (typeof BroadcastChannel === 'function') {
    var channel = new BroadcastChannel('ares-uplink');
    channel.onmessage = function (event) { receive(event.data); };
    transports.push({ send: function (message) { channel.postMessage(message); } });
  }
  function send(message) {
    message.window = me;
    transports.forEach(function (t) { try { t.send(message); } catch (e) { /* link down: status shows it */ } });
  }

  function linkedTo(wanted) {
    return Object.keys(peers).filter(function (id) { return peers[id] === wanted; }).length;
  }

  function drawStation() {
    document.body.dataset.station = role;
    $('stationControl').setAttribute('aria-pressed', String(role === 'control'));
    $('stationCrew').setAttribute('aria-pressed', String(role === 'crew'));
    $('uplinkSend').textContent = role === 'control' ? 'Uplink route to crew' : 'Send route to mission control';
    var count = linkedTo(other(role));
    $('uplinkLink').textContent = !transports.length ? 'This browser cannot link windows.'
      : count ? M.ROLES[other(role)] + ' linked · ' + count + (count === 1 ? ' window' : ' windows')
      : 'No ' + M.ROLES[other(role)].toLowerCase() + ' window linked. Open this page in a second window and switch it to ' +
        M.ROLES[other(role)] + '.';
    $('uplinkLink').className = count ? 'good' : '';
  }

  function drawInbox() {
    $('uplinkInbox').hidden = !incoming;
    if (!incoming) return;
    $('uplinkFrom').textContent = 'Incoming route · ' + M.ROLES[incoming.from] + ' · ' + clock(incoming.sentAt);
    $('uplinkSummary').textContent = M.describe(incoming);
    $('uplinkStops').textContent = incoming.stops.map(function (s) { return s.name; }).join(' → ');
  }

  function setRole(next) {
    role = next;
    try { sessionStorage.setItem('ares.station', role); } catch (e) { /* not remembered */ }
    incoming = null;
    drawInbox();
    $('uplinkStatus').textContent = '';
    send({ v: 1, type: 'here', role: role });
    drawStation();
  }

  function receive(message) {
    if (!message || message.v !== 1 || message.window === me) return;
    if (message.type === 'hello' || message.type === 'here') {
      peers[message.window] = message.role === 'crew' ? 'crew' : 'control';
      if (message.type === 'hello') send({ v: 1, type: 'here', role: role });
      drawStation();
    } else if (message.type === 'bye') {
      delete peers[message.window];
      drawStation();
    } else if (message.type === 'reply' && message.id === lastSentId) {
      $('uplinkStatus').textContent = M.ROLES[other(role)] + (message.accepted ? ' accepted' : ' declined') +
        ' the route at ' + clock(message.at) + '.';
      $('uplinkStatus').className = message.accepted ? 'good' : 'warn';
    } else if (M.acceptable(message, role)) {
      incoming = message;
      drawInbox();
      $('uplinkInbox').scrollIntoView({ block: 'nearest' });
    }
  }

  function decide(accepted) {
    if (!incoming) return;
    var message = incoming;
    incoming = null;
    drawInbox();
    send({ v: 1, type: 'reply', id: message.id, accepted: accepted, at: Date.now() });
    if (!accepted) return;
    options.loadPlan(message.stops.map(M.cleanStop));
    $('uplinkStatus').textContent = 'Loaded the route from ' + M.ROLES[message.from] + '.';
    $('uplinkStatus').className = 'good';
    if (role === 'crew') options.openHud(); // the crew walks it from the visor
  }

  $('stationControl').addEventListener('click', function () { setRole('control'); });
  $('stationCrew').addEventListener('click', function () { setRole('crew'); });
  $('uplinkAccept').addEventListener('click', function () { decide(true); });
  $('uplinkDecline').addEventListener('click', function () { decide(false); });
  $('uplinkSend').addEventListener('click', function () {
    var plan = options.getPlan();
    var id = me + '-' + Date.now();
    var message = M.route(role, plan.stops, plan.summary, id, Date.now());
    var status = $('uplinkStatus');
    status.className = 'warn';
    if (!message) { status.textContent = 'Add at least one stop before sending a route.'; return; }
    if (!transports.length) { status.textContent = 'This browser cannot link windows.'; return; }
    lastSentId = id;
    send(message);
    status.textContent = linkedTo(other(role))
      ? 'Sent at ' + clock(message.sentAt) + '. Waiting for ' + M.ROLES[other(role)].toLowerCase() + ' to accept.'
      : 'Sent at ' + clock(message.sentAt) + ', but no ' + M.ROLES[other(role)].toLowerCase() + ' window is linked to receive it.';
    status.className = linkedTo(other(role)) ? '' : 'warn';
  });
  window.addEventListener('pagehide', function () { send({ v: 1, type: 'bye' }); });

  drawStation();
  drawInbox();
  send({ v: 1, type: 'hello', role: role });
  return { role: function () { return role; } };
};
