/*
 * marsData.js — what is on the map. Data only, no logic.
 *
 * To add a map layer: add one object to ARES.data.tileLayers.
 * To add a science stop: add one object to ARES.data.targets.
 */
window.ARES = window.ARES || {};

ARES.data = {
  scienceGoal: 'Read Jezero’s history in order: sample the igneous crater floor, then the lake-delta sediments laid on top of it, where signs of ancient life are most likely to be preserved.',

  /*
   * Mars Trek WMTS layers (https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars).
   * id            Trek layer ID, exactly as listed there
   * ext           'png' or 'jpg' — read it from the layer's WMTSCapabilities.xml, a wrong one returns 404
   * maxNativeZoom highest zoom the layer has tiles for
   * bounds        [south, west, north, east], omit for global layers
   * All were load-tested on 2026-11-14.
   */
  tileLayers: [
    {
      key: 'hirise',
      name: 'HiRISE image, 25 cm',
      detail: 'MRO HiRISE · optical',
      id: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
      ext: 'png',
      maxNativeZoom: 17,
      bounds: [18.3067994, 77.2229331, 18.669315, 77.583964],
      on: true,
      opacity: 100
    },
    {
      key: 'ctx',
      name: 'CTX image, 6 m',
      detail: 'MRO CTX · optical',
      id: 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0',
      ext: 'png',
      maxNativeZoom: 13,
      bounds: [18.2110274, 77.1604655, 18.7211945, 77.6991776],
      on: true,
      opacity: 100
    },
    {
      key: 'relief',
      name: 'Elevation, colour relief',
      detail: 'MGS MOLA + Mars Express HRSC · topographic, 200 m',
      id: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw',
      ext: 'jpg',
      maxNativeZoom: 8,
      on: false,
      opacity: 45
    },
    {
      key: 'themisDay',
      name: 'Day infrared',
      detail: 'Mars Odyssey THEMIS · thermal, 100 m',
      id: 'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018',
      ext: 'png',
      maxNativeZoom: 9,
      on: false,
      opacity: 50
    },
    {
      key: 'themisNight',
      name: 'Night infrared',
      detail: 'Mars Odyssey THEMIS · thermal, 100 m. Bright = rock, dark = loose dust',
      id: 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018',
      ext: 'png',
      maxNativeZoom: 9,
      on: false,
      opacity: 50
    }
  ],

  /*
   * Habitat site: Three Forks. Perseverance measured 1.2 degrees of tilt or less at
   * 30 stops here, and NASA chose it as the sample depot. The habitat sits about
   * 90 m west of the depot, on a waypoint where the rover measured 1.6 degrees.
   */
  habitat: { name: 'Habitat · Three Forks', lat: 18.45252, lon: 77.4072 },

  /*
   * Science stops. Each position is where Perseverance was parked on the sol it
   * drilled that sample (sample IDs carry the sol: M2020-490-11 = sol 490), taken
   * from the waypoint snapshot in roverTraverse.js. Names and rock types follow the
   * Mars 2020 sample table (Herd et al. 2025, PNAS).
   */
  targets: [
    {
      id: '01', name: 'Skinner Ridge', area: 'Hawksbill Gap · delta front', sol: 490,
      lat: 18.4589, lon: 77.40617, stopMin: 30,
      rock: 'Sedimentary (Shenandoah formation)',
      why: 'Layered, medium-grained delta rock. Perseverance cored samples Swift Run and Skyland here.',
      task: 'Photograph the layering and collect a core next to the rover’s drill holes for comparison.'
    },
    {
      id: '02', name: 'Amalik', area: 'Cape Nukshak · delta front', sol: 575,
      lat: 18.45073, lon: 77.40144, stopMin: 30,
      rock: 'Sedimentary, fine-grained (Shenandoah formation)',
      why: 'Fine-grained lake sediment, the rock type most likely to preserve organic material. Samples Shuyak and Mageik.',
      task: 'Sample the finest-grained bed and log its contact with the layer above.'
    },
    {
      id: '03', name: 'Observation Mountain', area: 'Cape Nukshak', sol: 634,
      lat: 18.45133, lon: 77.40126, stopMin: 15,
      rock: 'Regolith (megaripple)',
      why: 'Wind-blown sand and dust. Samples Atmo Mountain and Crosswind Lake. Tells crews what loose ground does to suits and seals.',
      task: 'Scoop regolith and note how deep boots sink.'
    },
    {
      id: '04', name: 'Three Forks depot', area: 'Delta base', sol: 663,
      lat: 18.45268, lon: 77.4081, stopMin: 15,
      rock: 'Sample depot',
      why: 'Perseverance laid 10 sealed sample tubes on the ground here as a backup cache.',
      task: 'Inspect the tubes after years on the surface and recover them.'
    },
    {
      id: '05', name: 'Sid', area: 'Crater floor · landing site', sol: 371,
      lat: 18.4439, lon: 77.45243, stopMin: 20,
      rock: 'Igneous (upper Máaz formation)',
      why: 'Blocky lava rock. Dating it fixes when the crater floor formed. Samples Hahonih and Atsah.',
      task: 'Survey the boulder field and collect a fresh rock face.'
    },
    {
      id: '06', name: 'Brac', area: 'Séítah South', sol: 262,
      lat: 18.43396, lon: 77.44302, stopMin: 30,
      rock: 'Igneous (Séítah formation)',
      why: 'Olivine-rich rock, likely the oldest unit the rover reached, later altered by water. Samples Salette and Coulettes.',
      task: 'Sample altered and unaltered olivine side by side.'
    },
    {
      id: '07', name: 'Issole', area: 'Séítah South', sol: 298,
      lat: 18.43266, lon: 77.44137, stopMin: 30,
      rock: 'Igneous (Séítah formation)',
      why: 'A layered, resistant ridge of the same olivine-rich unit. Samples Robine and Malay.',
      task: 'Measure layer thickness along the ridge.'
    },
    {
      id: '08', name: 'Rochette', area: 'Artuby Ridge', sol: 190,
      lat: 18.43074, lon: 77.44437, stopMin: 20,
      rock: 'Igneous (Máaz formation)',
      why: 'The first rock Perseverance cored successfully. Samples Montdenier and Montagnac.',
      task: 'Re-image the drill holes to see how they have weathered.'
    }
  ]
};
