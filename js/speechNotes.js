/* Speech lifecycle is independent of the drawer and never mutates science data. */
window.ARES = window.ARES || {};

ARES.createSpeechNotes = function (Recognition, handlers) {
  'use strict';
  var active = null;
  function finish(session, message) {
    if (active !== session) return;
    active = null;
    handlers.state(false, message);
  }
  function stop() {
    if (!active) return;
    handlers.state(true, 'Finishing dictation…');
    try { active.engine.stop(); } catch (error) { cancel(); }
  }
  function cancel() {
    if (!active) return;
    var old = active;
    active = null; // Ignore any late result from the previous waypoint.
    try { old.engine.abort(); } catch (error) { /* already ended */ }
    handlers.state(false, 'Dictation stopped. Your draft is kept.');
  }
  function start(key) {
    if (!Recognition || active) return false;
    var session;
    try {
      session = { key: key, engine: new Recognition() };
      var engine = session.engine;
      engine.lang = document.documentElement.lang || 'en-US';
      engine.continuous = true;
      engine.interimResults = true;
      engine.onresult = function (event) {
        if (active !== session) return;
        var interim = [];
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var result = event.results[i];
          if (result.isFinal) handlers.text(session.key, result[0].transcript);
          else interim.push(result[0].transcript);
        }
        handlers.interim(interim.join(' '));
      };
      engine.onerror = function (event) {
        var messages = {
          'not-allowed': 'Microphone permission denied. Type your note instead.',
          'service-not-allowed': 'Speech service unavailable. Type your note instead.',
          'audio-capture': 'No microphone available. Type your note instead.',
          'no-speech': 'No speech detected. Try again or type your note.',
          'network': 'Speech service needs a connection. Type your note offline.'
        };
        finish(session, messages[event.error] || 'Dictation stopped. Your draft is kept.');
      };
      engine.onend = function () { finish(session, 'Dictation finished. Review the text, then save your log.'); };
      active = session;
      handlers.state(true, 'Listening… speak your geological observations.');
      engine.start();
      return true;
    } catch (error) {
      if (session) finish(session, 'Could not start dictation. Type your note instead.');
      else handlers.state(false, 'Speech recognition is unavailable. Type your note instead.');
      return false;
    }
  }
  return { start: start, stop: stop, cancel: cancel, isActive: function () { return !!active; } };
};
