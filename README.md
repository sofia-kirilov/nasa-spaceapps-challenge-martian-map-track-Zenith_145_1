# ARES — Marswalk EVA Planner

A buildless, offline-capable NASA Space Apps concept for a local Jezero Crater EVA. Open `index.html` directly, use VS Code Live Server, or serve this folder on GitHub Pages. No API keys, install, or build required. Optional Google Fonts fall back to system fonts when offline.

## Files

- `index.html`: semantic HUD, SVG tactical map, accessible controls and target drawer.
- `css/styles.css`: responsive slate/olive mission-control interface.
- `js/marsData.js`: five curated science contexts, four layer definitions, illustrative local polygons and origin.
- `js/app.js`: pan/zoom, layer opacity, route segment sampling, suit budgets, simulated telemetry and JSON export.
- `assets/jezero-delta.jpg`: bundled NASA Perseverance Mastcam-Z delta context photograph.
- `LICENSE`: Apache License 2.0 for original project code. NASA/partner imagery retains its original credits and usage terms.

## Try it

1. Inspect a numbered science marker or science card. Add a target from its drawer.
2. Select **Add waypoint**, then click terrain. Drag to pan, use +/- or the mouse wheel to zoom, and Recenter to reset. Escape ends placement.
3. **Return** appends the habitat; it does not retrace the outbound path. Review the straight return segment for hazards.
4. Toggle the four layers and adjust their opacity. Hiding a layer does not disable safety checks.
5. Load demo for a deliberately hazardous route, then Undo or Clear. Export downloads the plan and estimates as JSON.
6. Keyboard users can inspect targets with Tab/Enter and add them from the dialog, or focus the map and press Enter in placement mode to add its center. Arrow keys pan the map.

## Scientific integrity and NASA dataset provenance

**This is an educational planning simulation, not navigation or human-spaceflight software.** It demonstrates four NASA science data types, but it does not yet ingest four calibrated, georeferenced NASA science products. No claim of final challenge compliance or NASA endorsement is made. Target placements, habitat, local coordinates, contours, geology boundaries, slope and thermal/exposure polygons are illustrative. Real formation names are used for science context, not surveyed locations. The 4 × 3 km local sector cannot represent the full Perseverance traverse at surveyed scale.

| Layer / context | Primary reference | Prototype implementation |
| --- | --- | --- |
| Optical / high resolution | [JPL Mars Trek](https://trek.nasa.gov/mars/), [MRO HiRISE](https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/hirise/) | Procedural shaded relief referenced to HiRISE-style morphology; not an orbital mosaic or DEM. |
| Topography / slope | Mars Trek elevation products and HiRISE stereo DTMs | Illustrative contours and 19° / 23° exclusion polygons. >15° is a conservative scenario assumption supplied by the brief, not a NASA certified suit limit. |
| Geologic / mineralogy | [Sun & Stack, 2020, USGS SIM 3464](https://pubs.usgs.gov/publication/sim3464), [USGS Planetary Geologic Mapping](https://www.usgs.gov/centers/astrogeology-science-center/science/planetary-geologic-mapping), MRO CRISM context | Schematic clay-bearing delta and carbonate margin zones. No quantitative mineral abundance or GIS boundaries loaded. |
| Thermal / radiation | [Mars Odyssey THEMIS](https://science.nasa.gov/mission/2001-mars-odyssey/science/), [Curiosity RAD](https://science.nasa.gov/mission/msl-curiosity/science/instruments/rad/) | Soft ground and shelter analogues. No thermal inertia raster, solar-particle forecast, or validated shielding model. Thermal inertia alone cannot establish trafficability or radiation shelter. |
| Rover ground truth | [Perseverance raw gallery](https://mars.nasa.gov/mars2020/multimedia/raw-images/), [NASA delta context / PIA24485](https://science.nasa.gov/blog/studying-the-jezero-delta-from-a-distance/), [JPL delta science](https://www.jpl.nasa.gov/news/nasas-perseverance-rover-deciphers-ancient-history-of-martian-lake/) | Bundled curated Mastcam-Z photograph, credited NASA/JPL-Caltech/ASU/MSSS. This is a shared delta context image, not live imagery or a photograph at every target. A labeled procedural fallback remains if the local image is missing. |

## Model and units

Local SVG coordinates span 1,000 × 750 units; each unit is 4 meters. Approximate latitude/longitude uses Mars radius ~3,389.5 km (59,158 m per degree latitude) at 18.4447° N / 77.4508° E. This local plane is for demonstration only.

Routes use Euclidean segment lengths, sampled at intervals no greater than 10 m. The speed baseline is 600 m/h. Travel time is multiplied by `1 + slope/15` with a default modeled slope of 4°; soft terrain adds a 1.45 multiplier. Science stations add 15–30 minutes. Airlock operations add 20 minutes to a nonempty traverse. Paths are checked even if overlays are hidden. Sampling could miss features narrower than 10 m; no automatic safe rerouting or terrain mesh exists.

Modeled usable endurance from a full suit is oxygen 8 h, battery 7.5 h, cooling water 7 h. Reserves are linear with estimated duration. Alert at <20% remaining or >6 h EVA. These are design assumptions, not actual spacesuit specifications. Dose integrates modeled ambient rate (0.026 mSv/h), exposed zones (0.045), and hypothetical shelter (0.018) over travel and station time; airlock time is excluded. It is not a radiation risk forecast. Dose is a rate, not solar irradiance in W/m².

The fixed simulated Sol 1284 and start time 10:42:08 LMST are scenario values; LMST advances using a 1.02749 Earth/Mars time ratio. Temperature, pressure and relay are simulated. There is no connection to a rover, suit or relay. Science station sols are fictional human mission logs, not rover observation timestamps.

## Validation and next steps

JavaScript syntax and deterministic calculations are checked for empty routes, known distances, interior slope/exposure crossings, and budget overruns. Browser preview depends on local browser automation availability; see delivery notes for the actual verification performed.

For a science-ready submission, ingest and co-register HiRISE imagery/DTM, USGS GIS units and THEMIS raster products; derive slope from elevation; document product IDs, resolution and uncertainty; validate all hazard models. Check the official challenge rules and licensing terms before submission.
