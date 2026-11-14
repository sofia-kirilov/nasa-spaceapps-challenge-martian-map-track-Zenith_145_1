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

  // Walking model. PLANNING ASSUMPTIONS, not NASA suit specifications.
  walking: {
    baseSpeedKmh: 2.5,       // flat, firm ground, suited
    slopeDivisorDeg: 15,     // time multiplier = 1 + slope / slopeDivisorDeg
    assumedSlopeDeg: 5,      // used where no elevation measurement exists
    unverifiedPenalty: 1.3   // extra time on ground the rover never drove
  },

  slope: {
    cautionDeg: 15,
    limitDeg: 20,
    minSegmentM: 5 // shorter segments are too noisy to compute a grade from
  },

  eva: {
    airlockMin: 20,
    reserveFraction: 0.2,   // keep 20% of every consumable
    walkBackLimitKm: 2.0,   // farthest allowed straight-line distance from the habitat
    consumables: [
      { id: 'oxygen', name: 'Oxygen', enduranceH: 8 },
      { id: 'battery', name: 'Battery', enduranceH: 7.5 },
      { id: 'cooling', name: 'Cooling water', enduranceH: 7 }
    ]
  },

  radiation: {
    surfaceDoseMsvPerHour: 0.027,
    source: 'Curiosity RAD average surface dose (about 0.64 mSv/day, Hassler et al. 2014). Verify before citing.'
  },

  rover: {
    linkRadiusM: 25, // rover stops closer than this are treated as connected ground
    snapRadiusM: 60  // a stop this close to a rover waypoint counts as on proven ground
  },

  api: {
    nasaKey: 'DEMO_KEY', // 30 requests/hour. Get a free key at https://api.nasa.gov and paste it here.
    trekTiles: 'https://trek.nasa.gov/tiles/Mars/EQ',
    geology: 'https://services.arcgis.com/nzS0F0zdNLvs7nc8/ArcGIS/rest/services/Mars_Geology_feature_layer/FeatureServer/0/query',
    marsRss: 'https://mars.nasa.gov/rss/api/',
    donki: 'https://api.nasa.gov/DONKI/notifications',
    spaceWeatherDays: 7
  }
};
