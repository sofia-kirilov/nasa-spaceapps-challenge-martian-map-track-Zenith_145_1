/*
 * config.js — every tunable assumption in one place.
 * Change a number here and the whole app follows. Nothing else hard-codes these.
 */
window.ARES = window.ARES || {};

ARES.config = {
  mars: {
    radiusM: 3389500 // mean radius, used for all distances
  },

  map: {
    center: [18.4527, 77.4081], // Three Forks, [lat, lon east]
    zoom: 14,
    minZoom: 9,
    maxZoom: 18
  },

  /*
   * Walking model. Sources are listed next to each number and in the README.
   * Numbers marked TEAM ASSUMPTION have no published source; change them freely.
   */
  walking: {
    // Apollo planners assumed a 2.7 km/h average for suited walkbacks longer than an
    // hour (Apollo Lunar Surface Journal, "Lunar Gaits"). Measured on the Moon, not Mars.
    baseSpeedKmh: 2.7,
    slopeDivisorDeg: 15,     // TEAM ASSUMPTION: time multiplier = 1 + slope / slopeDivisorDeg
    assumedSlopeDeg: 5,      // TEAM ASSUMPTION: used where no elevation measurement exists
    unverifiedPenalty: 1.3   // TEAM ASSUMPTION: extra time on ground the rover never drove
  },

  slope: {
    cautionDeg: 15, // TEAM ASSUMPTION: warn before the limit (Apollo 15 crews walked ~17 degree slopes)
    limitDeg: 20,   // NASA exploration EVA suit capability: walking on slopes up to 20 degrees (EVA-EXP-0042 / EVA-EXP-0075)
    minSegmentM: 5  // shorter segments are too noisy to compute a grade from
  },

  eva: {
    airlockMin: 20,         // TEAM ASSUMPTION
    reserveFraction: 0.2,   // TEAM ASSUMPTION: keep 20% of every consumable
    // NASA exploration EVA concept of operations: traverses up to 2 km from the lander on foot.
    walkBackLimitKm: 2.0,
    // NASA's exploration suit is designed for EVAs of up to 8 hours (6 +/- 2 h).
    // Per-consumable margins are not published, so each one uses the 8 h design figure.
    consumables: [
      { id: 'oxygen', name: 'Oxygen', enduranceH: 8 },
      { id: 'battery', name: 'Battery', enduranceH: 8 },
      { id: 'cooling', name: 'Cooling water', enduranceH: 8 }
    ]
  },

  radiation: {
    // Curiosity RAD, Gale Crater, first ~300 sols: 0.64 +/- 0.12 mSv/day dose equivalent.
    // 0.64 / 24 h = 0.027 mSv/h. Galactic cosmic rays near solar maximum; a solar
    // particle event would add to this.
    surfaceDoseMsvPerDay: 0.64,
    uncertaintyMsvPerDay: 0.12,
    surfaceDoseMsvPerHour: 0.027,
    source: 'Hassler et al. 2014, Science 343, doi:10.1126/science.1244797 (Curiosity RAD, 0.64 ± 0.12 mSv/day)'
  },

  rover: {
    linkRadiusM: 25, // rover stops closer than this are treated as connected ground
    snapRadiusM: 60  // a stop this close to a rover waypoint counts as on proven ground
  },

  api: {
    nasaKey: 'DEMO_KEY', // works as is (30 requests/hour per visitor). A free key from https://api.nasa.gov raises the limit.
    spaceWeatherCacheMin: 60, // reuse the last DONKI answer for this long, so reloads don't use up the key
    trekTiles: 'https://trek.nasa.gov/tiles/Mars/EQ',
    geology: 'https://services.arcgis.com/nzS0F0zdNLvs7nc8/ArcGIS/rest/services/Mars_Geology_feature_layer/FeatureServer/0/query',
    marsRss: 'https://mars.nasa.gov/rss/api/',
    donki: 'https://api.nasa.gov/DONKI/notifications',
    spaceWeatherDays: 7
  }
};
