/*
 * visorControls.js — walking the route from the visor, by button or by voice.
 *
 * "Arrived" and "Back" move the crew position one stop along the planned route.
 * There is no position tracking on Mars to do this automatically: the crew
 * confirms each arrival, by tapping or by saying it.
 *
 * Voice uses the browser's speech recognition and a short fixed command list.
 * Most browsers send the audio to an online service, so it needs a connection;
 * a flight suit would recognise speech on board. Answers are also spoken aloud.
 *
 * walk (from app.js): stops() -> planned stops, index() -> current step or null,
 *                     set(i)  -> move to step i.
 */
window.ARES = window.ARES || {};

/* ---------- Command matching (pure, tested in tests/visor-tests.js) ---------- */

ARES.voiceCommand = (function () {
  'use strict';
  // First match wins, so longer phrases come before the single words they contain.
  var COMMANDS = [
    ['return', ['return to base', 'return to habitat', 'back to base', 'go home', 'take me home', 'abort']],
    ['close', ['close visor', 'close hud', 'close', 'exit']],
    ['back', ['previous', 'go back', 'back']],
    ['next', ['arrived', 'arrive', 'next', 'continue', 'start']],
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
  /** Where a step command lands. Returns the new index, or null when it cannot move. */
  function step(command, index, count) {
    if (count < 2) return null;
    if (command === 'next') return index === null ? 0 : index < count - 1 ? index + 1 : null;
    if (command === 'back') return index !== null && index > 0 ? index - 1 : null;
    return null;
  }
  return { parse: parse, step: step, HELP: 'Say: arrived, back, status, return to base, or close.' };
})();

/* ---------- Visor buttons, microphone and spoken answers ---------- */

ARES.createVisorControls = function (walk) {
  'use strict';
  var V = ARES.voiceCommand;
  function $(id) { return document.getElementById(id); }
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recogniser = null, listening = false;

  function say(text) {
    $('hudVoice').textContent = text;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text.replace(/·/g, ',').replace(/O₂/g, 'oxygen')));
  }

  /** The visor's own readouts, as one sentence. Read after app.js has updated them. */
  function report() {
    var next = $('hudDistance').textContent;
    return 'Oxygen ' + $('hudOxygen').textContent + '. Return to base: ' + $('hudReturn').textContent.toLowerCase() +
      ', ' + $('hudReturnNote').textContent + '. ' +
      (next === '—' ? $('hudWaypoint').textContent + '.' : 'Next: ' + $('hudWaypoint').textContent + ', ' + next + '.');
  }

  function drawStep() {
    var stops = walk.stops(), index = walk.index();
    $('hudStep').textContent = stops.length < 2 ? 'No route loaded'
      : index === null ? 'Not started · ' + (stops.length - 1) + ' legs'
      : 'Stop ' + (index + 1) + ' of ' + stops.length + ' · ' + stops[index].name;
    $('hudNext').textContent = index === null ? 'Start route' : 'Arrived · next stop';
    $('hudNext').disabled = V.step('next', index, stops.length) === null;
    $('hudBack').disabled = V.step('back', index, stops.length) === null;
  }

  function run(command, spoken) {
    var stops = walk.stops(), index = walk.index();
    if (command === 'next' || command === 'back') {
      var target = V.step(command, index, stops.length);
      if (target === null) {
        say(stops.length < 2 ? 'No route loaded.' : command === 'next' ? 'Route complete. You are at the last stop.' : 'You are at the first stop.');
        return;
      }
      walk.set(target);
      drawStep();
      var text = 'At ' + stops[target].name + '. ' + report();
      if (spoken) say(text); else $('hudVoice').textContent = text;
    } else if (command === 'status') {
      say(index === null ? 'Route not started. ' + report() : 'At ' + stops[index].name + '. ' + report());
    } else if (command === 'return') {
      $('emergencyRTB').click(); // same action as the red button
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
    if (navigator.onLine === false) { $('hudVoice').textContent = 'Speech recognition unavailable offline — use the buttons'; return; }
    if (listening) { recogniser.stop(); return; }
    recogniser = new Recognition();
    recogniser.lang = 'en-US';
    recogniser.interimResults = false;
    recogniser.maxAlternatives = 3;
    recogniser.onresult = function (event) {
      var options = Array.from(event.results[0]).map(function (alt) { return alt.transcript; });
      var command = null;
      options.some(function (text) { command = V.parse(text); return !!command; });
      if (command) run(command, true);
      else say('Heard "' + options[0] + '". ' + V.HELP);
    };
    recogniser.onerror = function (event) {
      $('hudVoice').textContent = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Microphone is blocked. Allow it for this site, or use the buttons.'
        : event.error === 'network' ? 'Speech recognition unavailable offline — use the buttons'
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

  $('hudNext').addEventListener('click', function () { run('next', false); });
  $('hudBack').addEventListener('click', function () { run('back', false); });
  if (Recognition) {
    $('hudTalk').addEventListener('click', listen);
  } else {
    $('hudTalk').disabled = true;
    $('hudTalk').textContent = 'Voice not supported';
    $('hudVoice').textContent = 'This browser has no speech recognition. Use the buttons.';
  }
  function closeVoice() {
    if (listening) recogniser.stop();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
  $('hudView').addEventListener('close', closeVoice);
  $('evaCommands').addEventListener('close', closeVoice);
  window.addEventListener('ares:planchange', drawStep);
  drawStep();
  return { refresh: drawStep, run: run };
};
