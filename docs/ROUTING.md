# Guided route discovery and ranking

The adapter uses the [ORS pedestrian directions endpoint](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/).
The public API is unchanged. The backend now explores eight directions explicitly,
instead of hoping random round-trip seeds sample different parts of the network.

Each direction uses a closed elongated loop: the start, three intermediate points
on an ellipse, then the identical start. The ellipse has a minor/major ratio of
0.45. Directions are 45 degrees apart; the seed rotates the pattern by at most
2.5 degrees. Spherical coordinate projection handles poles and the date line.
The initial four-leg waypoint perimeter equals the target distance before the
routing provider follows the actual roads and paths.

Discovery runs in two phases. First, all eight primary directions are probed,
and each usable route remains eligible. After those requests finish, successful
raw probes are ranked for further exploration: flat chooses lowest ascent/km,
hilly chooses highest ascent/km, and balanced chooses smallest relative distance
error. Unknown ascent ranks last for flat/hilly; stable direction order breaks
ties. Raw probes outside the final distance tolerance can still guide search.

The best two distinct probe directions each receive four nearby probes at
-20, -7, +7 and +20 degrees. Each neighbourhood uses target/primary distance as
its waypoint scale, clamped to 0.5–1.5. Jobs alternate between the two
neighbourhoods so a reduced remaining budget can explore both. Every successful
response is analysed independently; good primary routes are never replaced.

There are **16 actual upstream calls maximum**: eight primary probes and up to
eight nearby probes, concurrency two in each phase, under the existing 20-second
deadline. Every call consumes the same shared attempt budget, with no hidden
retries. Phase two requires at least 500ms remaining and a finite positive
primary distance for scale correction. A failed phase-two request does not
remove any usable route.
Smaller configured budgets are respected and can reduce direction coverage.
Providers without guided support retain six seeded round trips and at most eight
calls, including one transient retry per candidate. Authentication, malformed
responses, throttling and Retry-After responses are never retried; authentication,
throttling and Retry-After halt new candidates. Partial useful results are retained.
SSM credential lookup composes the request deadline with a three-second bound.

Candidates must return within 50 m of the requested start and each other, stay
within 10% of target distance, and have plausible geometry length within 35% of
reported distance. Routes above 5% retain a visible warning, but no longer fall
into a separate ranking tier. This removes the discontinuity where a materially
hillier route at 4.9% error always beat a flat one at 5.1% error.

Scores (lower wins) start with absolute fractional distance error × 100,
repetition above 15% × 80, and tight reversal count × 2. Flat adds ascent/km × 2
and sustained steep-uphill fraction × 40. Balanced uses distance, repetition and
shape only; it does not penalise ascent monotonically. Hilly subtracts
min(ascent/km, 60). Unknown elevation adds 1000; when at least
three distinct known-elevation loops exist, unknown routes are excluded. Stable
geometry IDs break ties. Preferences rank available routes rather than promising
a globally optimal route or a specific amount of climbing.

Elevation requires complete 3D coordinates and nonnegative provider ascent and
descent. Otherwise metrics are null. Profiles resample at 25 m; scoring smooths
adjacent elevations and measures sustained grades over about 75 m. Full route
geometry is returned. Spatial coverage uses 15 m quantised cells sampled at most
10 m apart. Revisits separated by 40 m count repetition: above 40% rejects,
above 15% penalises. At least 80% overlap of the smaller coverage deduplicates,
including reversed loops. Nearby parallel paths and intersections can still be
conflated; this approximation and scoring weights need field calibration.

Regression measurements on synthetic pedestrian-path fixtures verify eight
primary orientations, a 0.45 aspect ratio, and initial waypoint perimeter within
2m of a 5km target. A fixture with 20% network-distance inflation is corrected to
within 3m on the nearby probes, using exactly 16 calls and peak concurrency two.
Tests verify phase one completes before preference-specific neighbourhood
selection, all four angular offsets, both-phase result retention, partial
budgets, failed probes, unknown elevation and deadline cancellation. Continuous
elevation fixtures verify different flat/balanced/hilly selections and removal
of the 5% ranking cliff. These are test results, not real-world accuracy or latency
claims. No private route geometry is included.

Routine logs include request ID, duration, actual attempt count, candidate and
rejection counts, selected count and failure categories. They omit exact
coordinates, full geometry, provider bodies and credentials.

The adaptive strategy responds to integration observations that small bearing
changes can cause sharply different path snapping. Uniform midpoint sampling
missed a nearby promising corridor. Concentrating the second phase around the
best observed primary directions is intended to explore that sensitivity. The
integrated private regression selected a 5.138km route with 63m ascent for the
flat preference, compared with roughly 93m from the earlier random-loop
approach. The reference route is about 4.93km with 51m ascent. This confirms a
material improvement for the reported case, while remaining a single local
regression rather than a general accuracy claim. No private coordinates or GPX
geometry are included in the repository.
