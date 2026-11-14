# ARES — Marswalk EVA Planner

A buildless Jezero Crater planning concept using NASA Mars Trek tiles and the bundled Perseverance traverse. Serve this folder with VS Code Live Server or another static server. No install or build is required. Leaflet 1.9.4 is bundled locally; optional Google Fonts fall back to system fonts.

This is an educational planning tool. Walking speed, slope thresholds, suit limits and radiation assumptions remain exactly as supplied in js/config.js. Crew controls do not modify the scientific source files.

## Crew controls

1. **EMERGENCY RTB (Return to Base):** select your actual waypoint in **Crew position · manual**, then press the red button. The default is the planned endpoint; the application has no live position feed. The red overlay shows the fastest walking route between the snapped endpoints on the existing rover graph, weighted by the existing slope and walking-time model. The original EVA plan remains available. Walking ETA excludes science stops and airlock operations. Exact connections to the rover graph are included in distance/time and marked unverified. Positions outside the configured snap radius produce an explicit unavailable result. Recorded slopes still trigger the configured warning and danger states; fastest does not imply terrain clearance. Dismiss the overlay to return to the plan view.
2. **Glove-Friendly UI:** the persistent toggle enlarges controls and science markers to at least 60 px touch targets, increases HUD typography and strengthens amber/red warnings. It also enlarges map zoom controls, layer labels, sliders and dialog controls.
3. **Geological sample log:** choose a science target or a custom route waypoint. Use **Start voice note**, speak, **Stop dictation**, review the transcript, then **Save sample log**. You can also type observations. Logs contain the waypoint name, coordinates and a timestamp; drafts persist as you type. Route **Log** buttons and the science drawer open the corresponding sample log. The JSON plan export includes saved logs, drafts and the active return route. Dictation stores text, not raw audio.
4. **Offline caching:** source map/target/traverse snapshots, the editable route, map center/zoom, layer visibility/opacity, glove preference, logs and drafts use versioned localStorage keys. Successfully loaded source data always wins over cached copies. Saved route references resolve against current science targets on reload. Corrupt, blocked or full storage is reported without stopping the planner.

Speech recognition needs a supported browser and microphone permission. It may send audio to the browser's recognition service and may need a connection; typed logs work offline. See [SpeechRecognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Preparing for offline use

Open the app once on **localhost or HTTPS** and wait for **Offline app ready**. A service worker caches the app shell, source scripts and the locally bundled Leaflet files. Explore the map layers and zoom levels you need while connected; successfully fetched tiles are cached as you view them. The tile cache is bounded to the most recent 240 unique requests. Unvisited or evicted tiles require a connection, and storage remains subject to browser quotas. The first view is requested again after the worker takes control so its tiles can be cached.

Opening index.html directly still allows local data storage where the browser permits it, but service-worker offline page/tile caching requires localhost or HTTPS. Browser-local data is specific to the origin and device and may be cleared by browser settings. Export the plan for a portable backup. See [Service Worker API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

Live MEDA weather, DONKI notifications, USGS point lookups and raw rover photos remain network features. Old weather and space-weather notifications are never replayed as live readings. The source snapshot contains the existing map and waypoint data verbatim; it does not replace them with illustrative terrain.

## Existing planner

Inspect numbered science markers or cards, add science stops from their drawer, or use **Add waypoint** to place custom stops. **Return** appends the habitat using the existing planner. **Undo**, **Clear**, **Load example**, layer blending and **Export plan (JSON)** retain their original behavior. Hiding a layer does not disable route checks.

The original planner follows the recorded rover graph between snapped stops and marks off-path legs unverified. Its route estimates, safety flags, consumable calculations and original source values are unchanged. The emergency router is separate and optimizes walking time rather than the original planner's distance weights.

## Files and data sources

| File | Purpose |
| --- | --- |
| js/marsData.js | Authoritative map-layer definitions, habitat and science targets; unchanged by the crew update. |
| js/roverTraverse.js | Authoritative Perseverance waypoint snapshot, elevations, tilts and provenance; unchanged. |
| js/config.js | Original model and API configuration; unchanged. |
| js/geo.js / js/planner.js | Existing geometry, graph and EVA calculations; unchanged. |
| js/nasaApi.js | Existing NASA / USGS live requests; unchanged. |
| js/crewRouter.js | Time-weighted return routing using the existing graph and assumptions. |
| js/offlineAssets.js / sw.js | localStorage persistence, source snapshots and offline app/tile caching. |
| js/speechNotes.js / js/sampleLog.js | Speech lifecycle, waypoint notes, draft persistence and saved logs. |
| js/app.js / index.html / css/styles.css | Map, crew controls, HUD, inspection drawer and export integration. |
| assets/vendor/ | Existing Leaflet version bundled for offline use, with its BSD license. |

The source files retain their dataset identifiers, exact positions and provenance. Primary services include [NASA Mars Trek](https://trek.nasa.gov/mars/), the [Perseverance waypoint feed](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json), the [USGS global geologic map](https://pubs.usgs.gov/publication/sim3464), and [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/). Consult the current source files for the precise products, retrieval metadata and model assumptions.

## Checks

With Node.js installed, run:

~~~text
node tests/run-tests.js
node tests/crew-tests.js
node tests/offline-tests.js
~~~

These cover the existing scientific calculations, time-weighted return routing, exact endpoint connectors, source immutability, cached-source precedence, corrupt/blocked/full storage, sample persistence, speech result ownership, offline shell/data availability and bounded tile caching. Speech tests use a mock recognizer; microphone hardware and the browser's external speech service require a manual check. Offline-cache tests use an in-memory Cache Storage implementation.

Original project code is Apache-2.0. Bundled Leaflet uses BSD-2-Clause (assets/vendor/LICENSE-Leaflet). NASA and partner imagery retains its original credits and usage terms.
