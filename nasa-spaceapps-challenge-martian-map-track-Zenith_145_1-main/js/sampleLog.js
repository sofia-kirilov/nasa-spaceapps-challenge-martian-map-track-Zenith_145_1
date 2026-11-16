window.ARES = window.ARES || {};

ARES.createSampleLog = function () {
  'use strict';
  var store = ARES.offline;
  var $ = function (id) { return document.getElementById(id); };
  var select = $('sampleWaypoint');
  var input = $('sampleText');
  var notes = store.read('sampleLogs', []);
  if (!Array.isArray(notes)) notes = [];
  notes = notes.filter(function (n) {
    return n && typeof n.text === 'string' && typeof n.createdAt === 'string' &&
      n.waypoint && typeof n.waypoint.key === 'string' && store.validPoint(n.waypoint);
  });
  var drafts = store.read('sampleDrafts', {});
  if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) drafts = {};
  var choices = [];
  var selected = '';
  var recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var speech = ARES.createSpeechNotes(recognition, {
    state: function (listening, message) {
      $('startDictation').disabled = listening || !recognition || !window.isSecureContext;
      $('stopDictation').disabled = !listening;
      $('saveSample').disabled = listening;
      select.disabled = listening;
      $('speechStatus').textContent = message;
      $('typeSample').hidden = message.indexOf('tap to type') < 0;
      $('speechStatus').classList.toggle('listening', listening);
      if (!listening) $('speechInterim').textContent = '';
    },
    text: function (key, text) {
      if (key !== selected) return;
      input.value = (input.value.trim() + ' ' + text.trim()).trim();
      persistDraft();
    },
    interim: function (text) { $('speechInterim').textContent = text; }
  });

  function descriptor(stop) {
    var target = ARES.data.targets.find(function (t) { return t.lat === stop.lat && t.lon === stop.lon; });
    return { key: target ? 'target:' + target.id : 'custom:' + stop.lat + ',' + stop.lon,
      name: stop.name, lat: stop.lat, lon: stop.lon };
  }
  function current() { return choices.find(function (w) { return w.key === selected; }); }
  function persistDraft() {
    var waypoint = current();
    if (!waypoint) return;
    drafts[selected] = { text: input.value, waypoint: waypoint };
    store.write('sampleDrafts', drafts);
  }
  function loadSelection() {
    selected = select.value;
    input.value = drafts[selected] && typeof drafts[selected].text === 'string' ? drafts[selected].text : '';
    var waypoint = current();
    $('sampleLocation').textContent = waypoint
      ? waypoint.lat.toFixed(5) + '° N · ' + waypoint.lon.toFixed(5) + '° E' : '';
    $('speechInterim').textContent = '';
    drawNotes();
  }
  function refresh(stops) {
    var previous = selected;
    choices = ARES.data.targets.map(descriptor);
    function include(w) {
      if (w && typeof w.key === 'string' && store.validPoint(w) && !choices.some(function (c) { return c.key === w.key; })) {
        choices.push({ key: w.key, name: w.name, lat: w.lat, lon: w.lon });
      }
    }
    stops.filter(function (s) { return s.custom; }).forEach(function (s) { include(descriptor(s)); });
    notes.forEach(function (n) { include(n.waypoint); });
    Object.keys(drafts).forEach(function (key) { if (drafts[key]) include(drafts[key].waypoint); });
    select.replaceChildren();
    choices.forEach(function (w) {
      var option = document.createElement('option');
      option.value = w.key;
      option.textContent = w.name;
      select.append(option);
    });
    if (choices.some(function (w) { return w.key === previous; })) select.value = previous;
    loadSelection();
  }
  function drawNotes() {
    var list = $('sampleLogs');
    list.replaceChildren();
    var matches = notes.filter(function (n) { return n.waypoint.key === selected; });
    $('sampleCount').textContent = matches.length + (matches.length === 1 ? ' log' : ' logs');
    matches.slice().reverse().forEach(function (n) {
      var item = document.createElement('li');
      var time = document.createElement('time');
      time.dateTime = n.createdAt;
      time.textContent = new Date(n.createdAt).toLocaleString();
      var text = document.createElement('p');
      text.textContent = n.text;
      var heading = document.createElement('div');
      heading.className = 'sample-log-heading';
      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'delete-sample';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', 'Delete sample log at ' + n.waypoint.name + ' from ' + time.textContent);
      remove.addEventListener('click', function () {
        var next = notes.filter(function (note) { return note !== n; });
        if (!store.write('sampleLogs', next)) {
          $('speechStatus').textContent = 'Could not delete this log locally. Your saved log is kept. Try again when storage is available.';
          return;
        }
        notes = next;
        drawNotes();
        $('speechStatus').textContent = 'Sample log deleted from this device.';
        $('saveSample').focus({ preventScroll: true });
      });
      heading.append(time, remove);
      item.append(heading, text);
      list.append(item);
    });
  }

  select.addEventListener('change', function () { speech.cancel(); loadSelection(); });
  input.addEventListener('input', persistDraft);
  $('startDictation').disabled = !recognition || !window.isSecureContext;
  $('speechStatus').textContent = !recognition ? 'Dictation is unsupported in this browser. Type your note below.' :
    !window.isSecureContext ? 'Use localhost or HTTPS for microphone access. Typed logs work here.' :
    'Ready to dictate. Your browser may send audio to its speech service and require a connection. Typed logs work offline.';
  $('startDictation').addEventListener('click', function () { speech.start(selected); });
  $('stopDictation').addEventListener('click', speech.stop);
  $('typeSample').addEventListener('click', function () { input.focus(); });
  $('saveSample').addEventListener('click', function () {
    var text = input.value.trim();
    if (!text) { $('speechStatus').textContent = 'Enter or dictate an observation before saving.'; input.focus(); return; }
    if (speech.isActive() || !current()) return;
    var note = { waypoint: Object.assign({}, current()), text: text, createdAt: new Date().toISOString() };
    var next = notes.concat([note]);
    if (!store.write('sampleLogs', next)) {
      $('speechStatus').textContent = 'Could not save this log locally. Your draft is kept; copy it or export the plan.';
      return;
    }
    notes = next;
    input.value = '';
    persistDraft();
    drawNotes();
    $('speechStatus').textContent = 'Sample log saved on this device.';
  });
  window.addEventListener('pagehide', function () { persistDraft(); speech.cancel(); });

  return {
    refresh: refresh,
    select: function (stop) {
      speech.cancel();
      select.value = descriptor(stop).key;
      loadSelection();
      $('sampling').scrollIntoView({ behavior: 'smooth', block: 'start' });
      input.focus({ preventScroll: true });
    },
    export: function () { return { logs: notes.slice(), drafts: drafts }; }
  };
};
