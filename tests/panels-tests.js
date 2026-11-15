/* Run with: node tests/panels-tests.js */
'use strict';
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
var elements = {};
var focused = null;
function element(id, classes) {
  var node = { id: id, dataset: {}, attrs: {}, handlers: {}, hidden: false, scrollTop: 100,
    setAttribute: function (key, value) { this.attrs[key] = value; },
    addEventListener: function (name, fn) { this.handlers[name] = fn; },
    focus: function () { focused = this.id; },
    scrollIntoView: function () { this.scrolled = true; },
    classList: { contains: function (name) { return (classes || []).includes(name); } },
    matches: function (selectors) {
      return selectors.split(',').some(function (selector) { return (classes || []).includes(selector.trim().slice(1)); });
    }
  };
  elements[id] = node;
  return node;
}
// Use the real tab destinations so navigation tests also catch broken HTML wiring.
var tabs = Array.from(html.matchAll(/<button id="([^"]+)"[^>]*role="tab"[^>]*data-panel="([^"]+)"/g)).map(function (match) {
  var tab = element(match[1]);
  tab.dataset.panel = match[2];
  return tab;
});
assert.equal(tabs.length, 5);
var panels = tabs.map(function (tab, index) {
  assert.ok(html.includes('id="' + tab.dataset.panel + '" role="tabpanel"'));
  var panel = element(tab.dataset.panel);
  panel.hidden = index !== 0;
  return panel;
});
var scroll = element('scroll');
var oxygenLow = false;
var oxygenPercent = '70%';
var oxygen = { querySelector: function (selector) {
  return selector === '.low' ? (oxygenLow ? {} : null) : { textContent: oxygenPercent };
} };
['suitStatus', 'suitReadout', 'budgets', 'rtbPanel', 'crewPosition'].forEach(function (id) { element(id); });
var clickCapture;
var mutation;
var redraws = 0;
var context = {
  document: {
    querySelectorAll: function (selector) { return selector.includes('data-panel') ? tabs : panels; },
    querySelector: function (selector) { return selector === '.panel-scroll' ? scroll : oxygen; },
    getElementById: function (id) { return elements[id]; },
    addEventListener: function (name, fn, capture) { assert.equal(capture, true); clickCapture = fn; }
  },
  window: { dispatchEvent: function () { redraws++; } },
  Event: function (name) { this.type = name; },
  MutationObserver: function (fn) { mutation = fn; this.observe = function () {}; },
  requestAnimationFrame: function (fn) { fn(); }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/panels.js'), 'utf8'), context);
function selected(id) {
  assert.deepEqual(panels.filter(function (p) { return !p.hidden; }).map(function (p) { return p.id; }), [id]);
  tabs.forEach(function (tab) {
    assert.equal(tab.attrs['aria-selected'], String(tab.dataset.panel === id));
    assert.equal(tab.tabIndex, tab.dataset.panel === id ? 0 : -1);
  });
}
tabs[1].handlers.click(); selected('sitesPanel');
assert.equal(scroll.scrollTop, 0);
var prevented = false;
tabs[1].handlers.keydown({ key: 'ArrowRight', preventDefault: function () { prevented = true; } });
selected('sampling'); assert.equal(focused, 'logTab'); assert.ok(prevented);
tabs[2].handlers.keydown({ key: 'Home', preventDefault: function () {} }); selected('routePanel');
tabs[0].handlers.keydown({ key: 'ArrowLeft', preventDefault: function () {} }); selected('layersPanel');
tabs[4].handlers.keydown({ key: 'End', preventDefault: function () {} }); selected('layersPanel');
function click(id, classes) {
  var button = element(id, classes);
  clickCapture({ target: { closest: function () { return button; } } });
}
click('sample', ['route-log']); selected('sampling');
click('add', ['add-to-route']); selected('routePanel');
click('log', ['log-sample']); selected('sampling');
click('emergencyRTB', []); selected('routePanel');
assert.equal(focused, 'crewPosition'); assert.ok(elements.rtbPanel.scrolled);
assert.ok(redraws > 0, 'revealing the Plan tab redraws its elevation chart');
assert.equal(elements.suitReadout.textContent, 'Oxygen after EVA 70%');
oxygenLow = true; oxygenPercent = '12%'; mutation();
assert.equal(elements.suitReadout.textContent, 'Oxygen after EVA 12%, below reserve');
assert.equal(elements.suitStatus.dataset.state, 'low');
assert.equal(elements.suitStatus.attrs['aria-label'], elements.suitReadout.textContent);
oxygenLow = false; oxygenPercent = '100%'; mutation();
assert.equal(elements.suitStatus.dataset.state, 'nominal');
assert.equal(elements.suitReadout.textContent, 'Oxygen after EVA 100%');
console.log('Tab navigation, keyboard focus, log/return handoffs and oxygen mirroring tests passed.');
