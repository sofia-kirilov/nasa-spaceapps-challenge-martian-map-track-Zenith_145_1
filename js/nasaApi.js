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

  /** Most recent sol in the Perseverance MEDA weather feed that has real readings. */
  function latestWeather() {
    var url = cfg.marsRss + '?feed=weather&category=mars2020&feedtype=json';
    return getJson(url).then(function (json) {
      var sols = (json.sols || []).filter(function (s) {
        return typeof s.min_temp === 'number' && typeof s.max_temp === 'number';
      });
      if (!sols.length) return null;
      var s = sols[sols.length - 1];
      return {
        sol: s.sol, earthDate: s.terrestrial_date, season: s.season,
        minTempC: s.min_temp, maxTempC: s.max_temp,
        pressurePa: typeof s.pressure === 'number' ? s.pressure : null,
        sunrise: s.sunrise, sunset: s.sunset
      };
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
    return getJson(url).then(function (list) {
      list = Array.isArray(list) ? list : [];
      var particle = list.filter(function (n) { return n.messageType === 'SEP'; });
      var latest = list[0] || null;
      return {
        total: list.length,
        particleEvents: particle.length,
        latest: latest ? { type: latest.messageType, time: latest.messageIssueTime, url: latest.messageURL } : null
      };
    });
  }

  return {
    geologyAt: geologyAt,
    roverImages: roverImages,
    latestWeather: latestWeather,
    spaceWeather: spaceWeather
  };
})();
