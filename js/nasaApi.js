/*
 * nasaApi.js — every live request to NASA / USGS in one file.
 * Each function returns a Promise and rejects on failure; the UI decides what to
 * show instead. Results are cached for the session so repeat clicks cost nothing.
 * All four services were tested from a web page on 2026-11-14.
 */
window.ARES = window.ARES || {};

ARES.api = (function () {
  var cfg = ARES.config.api;
  var cache = {};

  function getJson(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).catch(function (error) {
        delete cache[url]; // let a later click retry
        throw error;
      });
    }
    return cache[url];
  }

  /** USGS global geologic map unit at a point. Resolves { unit, description } or null. */
  function geologyAt(lat, lon) {
    var url = cfg.geology +
      '?geometry=' + lon + ',' + lat +
      '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects' +
      '&outFields=Unit,UnitDesc&returnGeometry=false&f=json';
    return getJson(url).then(function (json) {
      var feature = json.features && json.features[0];
      if (!feature) return null;
      return { unit: feature.attributes.Unit, description: feature.attributes.UnitDesc };
    });
  }

  /**
   * Perseverance raw images taken on one sol.
   * camera is an instrument code such as MCZ_LEFT (Mastcam-Z) or NAVCAM_LEFT.
   * Resolves [{ thumb, full, caption, camera, sol }].
   */
  function roverImages(sol, camera, count) {
    var url = cfg.marsRss +
      '?feed=raw_images&category=mars2020&feedtype=json&page=0&num=' + (count || 6) +
      '&condition_2=' + sol + ':sol:gte&condition_3=' + sol + ':sol:lte' +
      '&search=%7C' + (camera || 'MCZ_LEFT');
    return getJson(url).then(function (json) {
      return (json.images || []).map(function (image) {
        return {
          thumb: image.image_files.small,
          full: image.image_files.large || image.image_files.full_res,
          caption: image.caption || '',
          camera: image.camera && image.camera.instrument,
          sol: image.sol
        };
      });
    });
  }

  var num = function (v) { var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; };

  /** Newest sol with real temperatures from one rover's weather feed, or null. */
  function roverWeather(category, station, site) {
    var url = cfg.marsRss + '?feed=weather&category=' + category + '&feedtype=json';
    return getJson(url).then(function (json) {
      var best = null;
      (json.sols || json.soles || []).forEach(function (s) {
        if (num(s.min_temp) === null || num(s.max_temp) === null) return;
        if (!best || String(s.terrestrial_date) > String(best.terrestrial_date)) best = s;
      });
      if (!best) return null;
      return {
        station: station, site: site,
        sol: best.sol, earthDate: best.terrestrial_date, season: best.season,
        minTempC: num(best.min_temp), maxTempC: num(best.max_temp),
        pressurePa: num(best.pressure),
        sunrise: best.sunrise || '', sunset: best.sunset || ''
      };
    }).catch(function () { return null; });
  }

  /**
   * Most recent Mars surface weather NASA publishes. Perseverance MEDA is the
   * station at Jezero, but its public feed stopped in April 2024, so Curiosity
   * REMS (Gale Crater) is used when it is newer. Resolves the newer reading,
   * labelled with its station and site, or null.
   */
  function latestWeather() {
    return Promise.all([
      roverWeather('mars2020', 'Perseverance MEDA', 'Jezero Crater'),
      roverWeather('msl', 'Curiosity REMS', 'Gale Crater')
    ]).then(function (readings) {
      readings = readings.filter(Boolean);
      if (!readings.length) return null;
      readings.sort(function (a, b) { return String(b.earthDate).localeCompare(String(a.earthDate)); });
      return readings[0];
    });
  }

  /**
   * NASA DONKI space-weather notifications from the last few days.
   * These describe the Sun and the inner solar system as a whole, not Mars
   * specifically. Resolves { total, particleEvents, latest }.
   */
  function spaceWeather() {
    var day = function (date) { return date.toISOString().slice(0, 10); };
    var end = new Date();
    var start = new Date(end.getTime() - cfg.spaceWeatherDays * 86400000);
    var url = cfg.donki + '?startDate=' + day(start) + '&endDate=' + day(end) +
      '&type=all&api_key=' + cfg.nasaKey;
    var key = 'ares.spaceWeather';
    var maxAgeMs = (cfg.spaceWeatherCacheMin || 0) * 60000;
    var summarize = function (list, fetchedAt) {
      list = Array.isArray(list) ? list : [];
      var particle = list.filter(function (n) { return n.messageType === 'SEP'; });
      var latest = list[0] || null;
      return {
        total: list.length,
        particleEvents: particle.length,
        fetchedAt: fetchedAt,
        latest: latest ? { type: latest.messageType, time: latest.messageIssueTime, url: latest.messageURL } : null
      };
    };
    // A recent answer saved in this browser is reused, so reloading the page
    // does not spend another request. It is always shown with its check time.
    try {
      var saved = JSON.parse(localStorage.getItem(key));
      if (saved && Date.now() - saved.at < maxAgeMs) return Promise.resolve(summarize(saved.list, saved.at));
    } catch (e) { /* storage unavailable: just fetch */ }
    return getJson(url).then(function (list) {
      var at = Date.now();
      try {
        localStorage.setItem(key, JSON.stringify({
          at: at,
          list: (Array.isArray(list) ? list : []).map(function (n) {
            return { messageType: n.messageType, messageIssueTime: n.messageIssueTime, messageURL: n.messageURL };
          })
        }));
      } catch (e) { /* ignore */ }
      return summarize(list, at);
    });
  }

  return {
    geologyAt: geologyAt,
    roverImages: roverImages,
    latestWeather: latestWeather,
    spaceWeather: spaceWeather
  };
})();
