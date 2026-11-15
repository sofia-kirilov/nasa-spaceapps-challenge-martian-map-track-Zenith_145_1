/* Accessible tab switching and route/log focus handoffs. */
(function () {
  'use strict';
  var tabs = Array.from(document.querySelectorAll('[role="tab"][data-panel]'));
  var panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
  var scroll = document.querySelector('.panel-scroll');

  function showPanel(id, focus) {
    var selected = tabs.find(function (tab) { return tab.dataset.panel === id; });
    if (!selected) return;
    tabs.forEach(function (tab) {
      var active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    panels.forEach(function (panel) { panel.hidden = panel.id !== id; });
    scroll.scrollTop = 0;
    if (focus) selected.focus();
    // The elevation canvas may have been hidden when the route last changed.
    window.dispatchEvent(new Event('resize'));
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { showPanel(tab.dataset.panel, false); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      showPanel(tabs[next].dataset.panel, true);
    });
  });

  // Reveal the destination before existing handlers move focus or draw a return route.
  document.addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    if (button.matches('.route-log, .log-sample')) showPanel('sampling', false);
    if (button.classList.contains('add-to-route')) showPanel('routePanel', false);
    if (button.id === 'emergencyRTB') {
      showPanel('routePanel', false);
      requestAnimationFrame(function () {
        document.getElementById('navigationStatus').scrollIntoView({ block: 'center' });
        document.getElementById('navigationStatus').focus({ preventScroll: true });
      });
    }
  }, true);

  // Suit telemetry is updated by the active navigation session in app.js.
})();
