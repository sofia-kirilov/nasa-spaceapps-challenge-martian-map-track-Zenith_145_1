# Jezero EVA planner

A buildless Jezero Crater planning concept for the Three Forks habitat using NASA Mars Trek tiles and the bundled Perseverance traverse. Serve this folder with VS Code Live Server or another static server. No install or build is required. Leaflet 1.9.4 and fallback fonts are bundled locally; the existing system fonts and color palette are preserved.

The top bar contains the title, simulated suit oxygen, the live Jezero local true solar clock (LTST), and **Return to base**. Route safety verdicts and warning alerts live at the top of **Plan**. One panel contains **Plan**, **Stops**, **Log**, **Conditions** and **Layers**. It sits beside the map in landscape and above it in portrait or on phones. Controls and science-marker touch targets are at least 64 px. Tabs support arrow keys, Home and End.

This is an educational planning tool. The values in js/marsData.js, js/config.js and js/roverTraverse.js are unchanged. Position and suit readings during navigation are simulations.

## EVA workflow

1. **Plan and start:** add science stops or custom waypoints, review the safety verdict, then choose **Start Route**. Empty plans and routes with breached safety limits cannot start. Caution routes retain their warnings. Starting locks route editing and shows progress, the next waypoint, remaining distance/time and a position marker on the map. The simulation runs at one EVA minute per second, including modeled airlock and science-stop time. Pause/resume it or drag **Simulation elapsed** to inspect a point on the active path. **End navigation** unlocks the original plan.
2. **Return to base:** while navigating, press the top-bar button to calculate and immediately start the fastest walking route from the current simulated position to the habitat. No manual position selection is needed. At a measured traverse segment, both ends of that segment are considered using the existing walking-time and slope model. Red lines show the return path; warnings remain in Plan. Exact off-graph connectors are included and flagged as unverified. Off-traverse positions outside the snap radius return an unavailable notice and pause the simulation at the current position. At the habitat, RTB reports that you are already home. The original science plan stays saved. Return walking ETA excludes science stops and airlock operations.
3. **Send to HUD:** opens a visor overlay with a route preview, simulated oxygen at the active position, return status and distance to the next stop. Before navigation, the position is the habitat and oxygen is 100%. Choose **Close HUD View** or press Escape to restore the planner and keyboard focus. Return warnings use the configured slope and consumable-reserve limits.
4. **Sample log:** choose a stop in **Log**, type observations or use **Start dictation**, stop and review the transcript, then choose **Save sample log**. Each saved entry has a **Delete** button. Successful deletions persist immediately; failed writes retain the saved entry and show a notice. Notes, drafts and the active session use localStorage and export with the plan. Reload restores the simulation paused. Dictation stores text, not raw audio.
5. **Offline speech fallback:** dictation uses browser-native `window.SpeechRecognition || window.webkitSpeechRecognition`. Network errors show **Speech recognition unavailable offline — tap to type** with a **Type a note** button. Drafts remain available; typing and saving work offline. Browser speech services may require a connection and microphone permission.

Source snapshots, route references, map view, layer preferences, logs and drafts use versioned localStorage keys. Fresh science sources take precedence over cached source copies. Corrupt, blocked or full storage is reported without stopping the planner. Browser storage remains specific to the origin and device; export a backup when needed.

## Preparing for offline use

Open the app once on **localhost or HTTPS** and wait for **Offline app ready**. A service worker caches the app shell, source scripts and the locally bundled Leaflet files. Explore the map layers and zoom levels you need while connected; successfully fetched tiles are cached as you view them. The tile cache is bounded to the most recent 240 unique requests. Unvisited or evicted tiles require a connection, and storage remains subject to browser quotas. The first view is requested again after the worker takes control so its tiles can be cached.

Opening index.html directly still allows local data storage where the browser permits it, but service-worker offline page/tile caching requires localhost or HTTPS. Browser-local data is specific to the origin and device and may be cleared by browser settings. Export the plan for a portable backup. See [Service Worker API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

Live MEDA weather, DONKI notifications, USGS point lookups and raw rover photos remain network features. Old weather and space-weather notifications are never replayed as live readings. The source snapshot contains the existing map and waypoint data verbatim; it does not replace them with illustrative terrain.

## Existing planner

Inspect numbered science markers or cards, add science stops from their drawer, or use **Add waypoint** to place custom stops. **Return to habitat** appends the habitat using the existing planner. **Undo**, **Clear** and layer blending retain their original behavior. **Export plan (JSON)** downloads `jezero-eva-plan.json` titled “Jezero EVA plan”. Internal `ARES` namespaces and `ares.*` storage keys remain unchanged. Hiding a layer does not disable route checks.

The original planner follows the recorded rover graph between snapped stops and marks off-path legs unverified. Its route estimates, safety flags, consumable calculations and original source values are unchanged. Verdicts distinguish an empty plan (**No plan yet**), complete routes within all limits (**Go**), unfinished return legs or caution flags (**Go with caution**) and actual time, slope or walk-back limit breaches (**No-go**). An unfinished route still requires a return leg before it is a complete approved plan. Solar start-now guidance stays separate from terrain and suit verdicts. The emergency router is separate and optimizes walking time rather than the original planner's distance weights.

## Files and data sources

| File | Purpose |
| --- | --- |
| js/marsData.js | Authoritative map-layer definitions, habitat and science targets; unchanged by the crew update. |
| js/roverTraverse.js | Authoritative Perseverance waypoint snapshot, elevations, tilts and provenance; unchanged. |
| js/config.js | Original model and API configuration; unchanged. |
| js/geo.js / js/planner.js | Existing geometry, graph and EVA calculations, plus draft-aware verdict classification. |
| js/nasaApi.js | Existing NASA / USGS live requests; unchanged. |
| js/crewRouter.js / js/navigation.js | Time-weighted current-position return routing and a persistent, pausable EVA simulation. |
| js/offlineAssets.js / sw.js | localStorage persistence, source snapshots and offline app/tile caching. |
| js/speechNotes.js / js/sampleLog.js | Speech lifecycle, waypoint notes, draft persistence and saved logs. |
| js/app.js / index.html / css/styles.css | Map, crew controls, tabbed panel, inspection drawer and export integration. |
| js/hud.js | Visor modal, route preview and estimated telemetry using existing planner and return results. |
| js/solarClock.js | Existing solar-time calculations mounted in the mission status bar. |
| js/panels.js | Accessible tab switching and top-bar oxygen mirroring. |
| assets/fonts/ | Locally bundled Roboto and Roboto Mono fallback fonts and their SIL Open Font Licenses. |
| assets/vendor/ | Existing Leaflet version bundled for offline use, with its BSD license. |

The source files retain their dataset identifiers, exact positions and provenance. Primary services include [NASA Mars Trek](https://trek.nasa.gov/mars/), the [Perseverance waypoint feed](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json), the [USGS global geologic map](https://pubs.usgs.gov/publication/sim3464), and [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/). Consult the current source files for the precise products, retrieval metadata and model assumptions.

## Terrain: slope layer and 3D view

`data/jezeroElevation.js` holds a 4.5 km square of the USGS / NASA CTX elevation model (Mars 2020 TRN CTX DTM mosaic, 20 m per pixel, averaged to 40 m cells) centred on the habitat. The file header gives the source file, the pixel window and the method.

- **Check against the rover:** `node tests/terrain-tests.js` compares the grid with the elevation Perseverance measured at each of its stops inside the area. On 169 stops the mean difference is 0.3 m and the mean absolute difference 2.0 m.
- **Slope guidance layer** (Layers tab): yellow from 10°, orange from the caution angle, red from the suit slope limit.
- **Map readout:** tapping the map gives the model's elevation and slope there, before the geology lookup returns.
- **3D view** (button on the map): the same grid as a surface you can rotate, tilt and zoom, coloured by elevation or by slope, with the route, stops, habitat and the simulated crew position on it. Drawn on a plain canvas by `js/terrain3d.js`; no 3D library.
- **Limits:** 40 m cells cannot show rocks, ledges or small scarps, so this is terrain guidance and not a hazard map. The route check itself still uses rover-measured slope along the rover's path; it does not yet route around steep cells.

## Visor: start, pause and voice

The visor has its own **Start route** and **Pause / Resume** buttons, which press the same controls as the Plan tab, and a line showing the navigation status. Position comes from the simulation in `js/navigation.js`.

**Voice command** listens for one short phrase from a fixed list: "start", "pause", "resume", "status", "return to base", "close". The visor shows and speaks the answer. Speech recognition is the browser's own; in most browsers it needs an internet connection and it is not available in Firefox, in which case the button says so and the buttons still work. A flight suit would recognise speech on board. `js/visorControls.js` holds the command list.

## Archived Perseverance weather

`data/medaJezero.js` holds seven sols (1853 to 1859, May 2026) of Perseverance MEDA readings from the NASA PDS Atmospheres Node: air temperature, ground temperature and pressure, each as a daily range. NASA has no live MEDA feed; the archive is updated about three times a year. The file header lists the exact source files and how the ranges were computed. By these sols the rover was on higher ground toward Jezero's western rim, so the Conditions tab labels the readings "Jezero area, western rim" and "not live". The Curiosity fallback is labelled "Gale Crater weather · not Jezero".

## Checks

With Node.js installed, run:

~~~text
node tests/run-tests.js
node tests/crew-tests.js
node tests/offline-tests.js
node tests/panels-tests.js
node tests/hud-tests.js
node tests/navigation-tests.js
node tests/app-tests.js
~~~

These cover scientific calculations, return routing from stops and mid-segment positions, route locking, progress, pause/resume, RTB arrival, active suit estimates, reload recovery, source immutability, sample save/delete persistence, storage failures, browser speech errors and late results, offline caching, accessible tabs and HUD lifecycle. Speech tests use mock recognizers; microphone hardware and the browser's speech service need a manual check. Browser visual QA requires a working browser automation connection.

Original project code is Apache-2.0. Bundled Leaflet uses BSD-2-Clause (assets/vendor/LICENSE-Leaflet). NASA and partner imagery retains its original credits and usage terms.
