/*
 * medaJezero.js — archived weather measured by Perseverance's MEDA station.
 *
 * NASA has no live public feed for MEDA. Data reaches the Planetary Data System
 * (PDS) in batches about three times a year, so this is the newest season
 * published, not today's weather. It ships with the app so the panel works offline.
 *
 * Source:   PDS Atmospheres Node, Mars 2020 MEDA bundle, sols 1740 to 1859 (the Release 16 batch)
 *           https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/
 * Files:    data_derived_env    WE__<sol>___________DER_PS__________________P01.CSV   (PRESSURE)
 *           data_calibrated_env WE__<sol>___________CAL_ATS_________________P01.CSV   (ATS_LOCAL_TEMP1..5)
 *           data_calibrated_env WE__<sol>___________CAL_TIRS________________P01.CSV   (GROUND_TEMP)
 * Method:   one-second readings averaged into one-minute bins (bins with fewer than
 *           20 readings dropped); min, max and mean taken over the bins. Air
 *           temperature is the mean of the five ATS sensors. Kelvin converted to °C.
 * Caveat:   MEDA does not record continuously (about 789 of 1,477 minutes per sol
 *           here), so the true extremes can fall outside these figures.
 * Where:    by these sols the rover had driven up and out toward Jezero's western rim,
 *           so the readings come from higher ground than the Three Forks habitat site
 *           (pressure there would read somewhat higher). Shown as "Jezero area".
 * Retrieved 2026-11-15.
 *
 * To add sols: repeat the method for the new files and append to `sols`.
 */
window.ARES = window.ARES || {};

ARES.medaArchive = {
  station: 'Perseverance MEDA',
  site: 'Jezero area, western rim',
  source: 'NASA PDS Atmospheres Node, Mars 2020 MEDA bundle (sols 1740 to 1859)',
  url: 'https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/',
  retrieved: '2026-11-15',
  sols: [
    { sol: 1853, earthDate: '2026-05-07', pressurePa: { min: 727, max: 756, mean: 743 }, airTempC: { min: -87.9, max: -30.1 }, groundTempC: { min: -86.3, max: -15.0 }, minutesMeasured: 810 },
    { sol: 1854, earthDate: '2026-05-08', pressurePa: { min: 722, max: 754, mean: 740 }, airTempC: { min: -87.6, max: -25.4 }, groundTempC: { min: -86.1, max: -14.9 }, minutesMeasured: 750 },
    { sol: 1855, earthDate: '2026-05-09', pressurePa: { min: 723, max: 753, mean: 739 }, airTempC: { min: -86.2, max: -26.5 }, groundTempC: { min: -85.6, max: -14.6 }, minutesMeasured: 780 },
    { sol: 1856, earthDate: '2026-05-10', pressurePa: { min: 724, max: 754, mean: 741 }, airTempC: { min: -84.2, max: -19.4 }, groundTempC: { min: -85.6, max: -14.0 }, minutesMeasured: 780 },
    { sol: 1857, earthDate: '2026-05-11', pressurePa: { min: 721, max: 752, mean: 739 }, airTempC: { min: -82.4, max: -21.0 }, groundTempC: { min: -81.3, max: -26.9 }, minutesMeasured: 780 },
    { sol: 1858, earthDate: '2026-05-12', pressurePa: { min: 724, max: 751, mean: 739 }, airTempC: { min: -81.7, max: -21.9 }, groundTempC: { min: -81.0, max: -27.1 }, minutesMeasured: 840 },
    { sol: 1859, earthDate: '2026-05-13', pressurePa: { min: 717, max: 751, mean: 736 }, airTempC: { min: -83.0, max: -23.7 }, groundTempC: { min: -85.0, max: -13.5 }, minutesMeasured: 780 }
  ]
};
