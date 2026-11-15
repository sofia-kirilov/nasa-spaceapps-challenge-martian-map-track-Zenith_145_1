window.ARES = window.ARES || {};

ARES.solarClock = (function () {
  'use strict';

  var DEG = Math.PI / 180;
  var SOL_IN_DAYS = 1.0274912517;
  var TT_MINUS_UTC_S = 69.184;

  function sin(d) { return Math.sin(d * DEG); }
  function mod(x, m) { return ((x % m) + m) % m; }

    function marsTime(date, lonEastDeg) {
    var jdUT = 2440587.5 + date.getTime() / 86400000;
    var jdTT = jdUT + TT_MINUS_UTC_S / 86400;
    var dt = jdTT - 2451545.0;

    var M = mod(19.3871 + 0.52402073 * dt, 360);
    var alphaFMS = mod(270.3871 + 0.524038496 * dt, 360);

    var A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
    var tau = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
    var phi = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
    var pbs = 0;
    for (var i = 0; i < A.length; i++) {
      pbs += A[i] * Math.cos((0.985626 * dt / tau[i] + phi[i]) * DEG);
    }

    var center = (10.691 + 3.0e-7 * dt) * sin(M) + 0.623 * sin(2 * M) +
      0.050 * sin(3 * M) + 0.005 * sin(4 * M) + 0.0005 * sin(5 * M) + pbs;
    var ls = mod(alphaFMS + center, 360);

    var eotDeg = 2.861 * sin(2 * ls) - 0.071 * sin(4 * ls) + 0.002 * sin(6 * ls) - center;
    var declDeg = Math.asin(0.42565 * sin(ls)) / DEG + 0.25 * sin(ls);

    var msd = (jdTT - 2451549.5) / SOL_IN_DAYS + 44796.0 - 0.0009626;
    var mst = mod(24 * msd, 24);
    var lmst = mod(mst + lonEastDeg / 15, 24);
    var ltst = mod(lmst + eotDeg / 15, 24);

    return { msd: msd, ls: ls, eotDeg: eotDeg, declDeg: declDeg, mst: mst, lmst: lmst, ltst: ltst };
  }

    function season(ls) {
    return ['Northern spring', 'Northern summer', 'Northern autumn', 'Northern winter'][Math.floor(ls / 90) % 4];
  }

    function daylight(date, latDeg, lonEastDeg) {
    var t = marsTime(date, lonEastDeg);
    var cosH = (sin(-0.35) - sin(latDeg) * sin(t.declDeg)) / (Math.cos(latDeg * DEG) * Math.cos(t.declDeg * DEG));
    var result = { time: t, ltst: t.ltst, season: season(t.ls), polar: null };

    if (cosH >= 1) { result.polar = 'night'; result.isDay = false; return result; }
    if (cosH <= -1) { result.polar = 'day'; result.isDay = true; return result; }

    var halfDay = Math.acos(cosH) / DEG / 15;
    result.sunrise = 12 - halfDay;
    result.sunset = 12 + halfDay;
    result.isDay = t.ltst >= result.sunrise && t.ltst < result.sunset;

    var toSunset = result.sunset - t.ltst;
    var toSunrise = mod(result.sunrise - t.ltst, 24);
    result.earthMinToSunset = result.isDay ? marsHoursToEarthMin(toSunset) : null;
    result.earthMinToSunrise = result.isDay ? null : marsHoursToEarthMin(toSunrise);
    return result;
  }

  function marsHoursToEarthMin(h) { return h * SOL_IN_DAYS * 60; }
  function earthHoursToMars(h) { return h / SOL_IN_DAYS; }

    function checkEva(date, latDeg, lonEastDeg, evaHours, marginMin) {
    var margin = marginMin === undefined ? 30 : marginMin;
    var d = daylight(date, latDeg, lonEastDeg);
    var endsLtst = mod(d.ltst + earthHoursToMars(evaHours), 24);

    if (d.polar === 'day') return { ok: true, endsLtst: endsLtst, spareMin: Infinity, reason: 'Sun stays up all sol' };
    if (d.polar === 'night') return { ok: false, endsLtst: endsLtst, spareMin: -Infinity, reason: 'Sun stays down all sol' };
    if (!d.isDay) return { ok: false, endsLtst: endsLtst, spareMin: null, reason: 'It is dark now. Wait for sunrise.' };

    var spareMin = d.earthMinToSunset - evaHours * 60;
    var ok = spareMin >= margin;
    return {
      ok: ok,
      endsLtst: endsLtst,
      spareMin: spareMin,
      reason: ok ? 'Back with ' + formatDuration(spareMin) + ' of daylight to spare'
        : spareMin < 0 ? 'Ends ' + formatDuration(-spareMin) + ' after sunset'
        : 'Only ' + formatDuration(spareMin) + ' before sunset (need ' + margin + ' min)'
    };
  }

    function formatClock(h) {
    var total = Math.round(mod(h, 24) * 60) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

    function formatDuration(min) {
    var m = Math.round(min);
    return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ' min';
  }

    function mount() {
    var strip = typeof document !== 'undefined' && document.getElementById('solarStatus');
    var habitat = ARES.data && ARES.data.habitat;
    if (!strip || !habitat) return;

    var value = document.getElementById('solarTime');
    var note = document.getElementById('solarNote');
    var summary = ARES.debug && ARES.debug.state.summary;

    function draw() {
      var now = new Date();
      var d = daylight(now, habitat.lat, habitat.lon);
      var text = '';
      if (d.polar) text += d.polar === 'day' ? ' · sun up all sol' : ' · sun down all sol';
      else if (d.isDay) text += ' · sunset in ' + formatDuration(d.earthMinToSunset);
      else text += ' · dark, sunrise in ' + formatDuration(d.earthMinToSunrise);
      value.textContent = formatClock(d.ltst) + ' LTST';
      note.textContent = text.replace(/^ · /, '');

      var s = summary;
      if (s && !s.flags.empty && s.hours > 0) {
        var eva = checkEva(now, habitat.lat, habitat.lon, s.hours);
        value.className = eva.ok ? 'good' : 'warn';
        strip.title = 'EVA starting now: ' + eva.reason;
      } else {
        value.className = d.isDay ? 'good' : 'warn';
        strip.title = d.polar ? d.season
          : 'sunrise ' + formatClock(d.sunrise) + ', sunset ' + formatClock(d.sunset) + ' · ' + d.season;
      }
    }

    draw();
    window.addEventListener('ares:planchange', function (event) { summary = event.detail; draw(); });
    setInterval(draw, 5000);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
  }

  return {
    marsTime: marsTime,
    daylight: daylight,
    checkEva: checkEva,
    season: season,
    formatClock: formatClock,
    formatDuration: formatDuration
  };
})();
