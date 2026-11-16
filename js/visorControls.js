/*
 * visorControls.js — running the EVA from the visor, by button or by voice.
 *
 * The visor gets its own Start, Pause and Voice buttons. They press the same
 * controls as the Plan tab (js/navigation.js does the work), so there is one
 * source of truth for where the crew is.
 *
 * Voice uses the browser's speech recognition and a short fixed command list.
 * Most browsers send the audio to an online service, so it needs a connection;
 * a flight suit would recognise speech on board. Answers are also spoken aloud.
 */
window.ARES = window.ARES || {};

/* ---------- Command matching (pure, tested in tests/visor-tests.js) ---------- */

ARES.voiceCommand = (function () {
  'use strict';
  // First match wins, so longer phrases come before the single words they contain.
  var COMMANDS = [
    ['return', ['return to base', 'return to habitat', 'back to base', 'go home', 'take me home', 'abort']],
    ['close', ['close visor', 'close hud', 'close', 'exit']],
    ['resume', ['resume', 'continue', 'carry on']],
    ['pause', ['pause', 'hold', 'wait']],
    ['start', ['start route', 'start', 'begin', 'go']],
    ['status', ['status', 'report', 'oxygen', 'where am i', 'how far']],
    ['help', ['help', 'commands', 'what can i say']]
  ];
  function parse(text) {
    var heard = ' ' + String(text || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    for (var c = 0; c < COMMANDS.length; c++) {
      for (var p = 0; p < COMMANDS[c][1].length; p++) {
        if (heard.indexOf(' ' + COMMANDS[c][1][p] + ' ') >= 0) return COMMANDS[c][0];
      }
    }
    return null;
  }
  return { parse: parse, HELP: 'Say: start, pause, resume, status, return to base, or close.' };
})();

/* ---------- Visor buttons, microphone and spoken answers ---------- */

ARES.createVisorControls = function () {
  'use strict';
  var V = ARES.voiceCommand;
  function $(id) { return document.getElementById(id); }
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recogniser = null, listening = false;

  function active() { return !$('activeNavigation').hidden; }
  function running() { return active() && /pause/i.test($('pauseNavigation').textContent); }

  function say(text) {
    $('hudVoice').textContent = text;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text.replace(/·/g, ',').replace(/O₂/g, 'oxygen')));
  }

  /** The visor's own readouts, as one sentence. */
  function report() {
    var next = $('hudDistance').textContent;
    return 'Oxygen ' + $('hudOxygen').textContent + '. Return to base: ' + $('hudReturn').textContent.toLowerCase() +
      ', ' + $('hudReturnNote').textContent + '. ' +
      (next === '—' || next === '--' ? $('hudWaypoint').textContent + '.' : 'Next: ' + $('hudWaypoint').textContent + ', ' + next + '.');
  }

  /** Mirror the Plan tab's navigation state into the visor. */
  function draw() {
    $('hudStep').textContent = active()
      ? $('navigationMode').textContent + ' · ' + $('navigationPercent').textContent + ' · ' + $('navigationNext').textContent
      : $('navigationStatus').textContent;
    $('hudStart').hidden = active();
    $('hudStart').disabled = $('startRoute').disabled;
    $('hudPause').hidden = !active();
    $('hudPause').textContent = $('pauseNavigation').textContent;
  }

  function run(command) {
    if (command === 'start') {
      if (active()) say('The route is already active. ' + report());
      else if ($('startRoute').disabled) say('Cannot start. ' + $('navigationStatus').textContent);
      else { $('startRoute').click(); draw(); say('Route started. ' + report()); }
    } else if (command === 'pause' || command === 'resume') {
      if (!active()) say('No route is active. Say start.');
      else if ((command === 'pause') !== running()) say(command === 'pause' ? 'Already paused.' : 'Already moving.');
      else { $('pauseNavigation').click(); draw(); say(command === 'pause' ? 'Paused.' : 'Resumed. ' + report()); }
    } else if (command === 'status') {
      say((active() ? $('navigationNext').textContent + ' ' : 'Route not started. ') + report());
    } else if (command === 'return') {
      $('emergencyRTB').click(); // same action as the red button
      draw();
      say('Return to base. ' + $('hudReturn').textContent + ', ' + $('hudReturnNote').textContent + '.');
    } else if (command === 'close') {
      say('Closing visor.');
      $('closeHud').click();
    } else {
      say(V.HELP);
    }
  }

  function stopListening() {
    listening = false;
    $('hudTalk').textContent = 'Voice command';
    $('hudTalk').setAttribute('aria-pressed', 'false');
  }

  function listen() {
    if (listening) { recogniser.stop(); return; }
    recogniser = new Recognition();
    recogniser.lang = 'en-US';
    recogniser.interimResults = false;
    recogniser.maxAlternatives = 3;
    recogniser.onresult = function (event) {
      var options = Array.from(event.results[0]).map(function (alt) { return alt.transcript; });
      var command = null;
      options.some(function (text) { command = V.parse(text); return !!command; });
      if (command) run(command);
      else say('Heard "' + options[0] + '". ' + V.HELP);
    };
    recogniser.onerror = function (event) {
      $('hudVoice').textContent = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone is blocked. Allow it for this site, or use the buttons.'
        : event.error === 'network' ? 'Speech recognition needs a connection. Use the buttons.'
        : event.error === 'no-speech' ? 'Nothing heard. ' + V.HELP
        : 'Voice command failed (' + event.error + '). Use the buttons.';
    };
    recogniser.onend = stopListening;
    try {
      recogniser.start();
      listening = true;
      $('hudTalk').textContent = 'Listening… tap to stop';
      $('hudTalk').setAttribute('aria-pressed', 'true');
      $('hudVoice').textContent = V.HELP;
    } catch (error) {
      stopListening();
      $('hudVoice').textContent = 'Voice command could not start. Use the buttons.';
    }
  }

  $('hudStart').addEventListener('click', function () { $('startRoute').click(); draw(); });
  $('hudPause').addEventListener('click', function () { $('pauseNavigation').click(); draw(); });
  if (Recognition) {
    $('hudTalk').addEventListener('click', listen);
  } else {
    $('hudTalk').disabled = true;
    $('hudTalk').textContent = 'Voice not supported';
    $('hudVoice').textContent = 'This browser has no speech recognition. Use the buttons.';
  }
  $('hudView').addEventListener('close', function () {
    if (listening) recogniser.stop();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  });
  new MutationObserver(draw).observe(document.querySelector('.navigation-panel'),
    { childList: true, subtree: true, characterData: true, attributes: true });
  draw();
  return { refresh: draw, run: run };
};
