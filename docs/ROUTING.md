# Initial routing model (uncalibrated)

The adapter follows the current [ORS directions documentation](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/).
Live round-trip/elevation compatibility is a release gate. Synthetic fixtures only
verify our processing, not path access, quality or safety.

Up to six deterministic candidates, concurrency two, eight maximum attempts,
20-second deadline. One immediate retry of transient server/network errors per
candidate is permitted; authentication, malformed data and throttling are not
retried. Throttling/authentication and any Retry-After response stop new candidates.
Retry-After accepts seconds and HTTP dates; no immediate retry bypasses it. Partial useful routes win
over failures. Deadline aborts upstream HTTP. Secret lookup has its own 3s bound.

Candidates must close within 50m of the requested point and themselves, be within
10% distance, and have plausible geometry length within 35% of reported distance.
Prefer ≤ 5% error before ranking; warn above 5%. Full unsimplified coordinates are
returned. Elevation requires complete 3D coordinates and nonnegative provider
ascent/descent. Otherwise metrics are null, never zero. Profile resamples at 25m;
terrain scoring averages adjacent samples and measures sustained grade over 75m.

Spatial coverage uses 15m quantised cells sampled at≤ 10m. Repeated visits separated
by 40m along the path count repeated distance; > 40% rejects, > 15% penalises.
Similarity≥ 80% of the smaller coverage deduplicates including reversed routes.
This is a spatial approximation: nearby parallel paths, intersections and very
short retraces can be conflated. It needs live calibration and is not road-edge
identity. Sparse/dense fixture and out-and-back tests guard basic failures.

Scores (lower wins) start with absolute fractional distance error×100,
repetition above 15%×80, and tight reversal count×2. Flat adds ascent/km×2 and
sustained steep fraction×40. Balanced adds ascent/km×0.3. Hilly subtracts
min(ascent/km,60). Unknown elevation adds 1000, so known routes rank first within
each distance tier. When at least three distinct elevation-known loops exist,
unknown-elevation loops are excluded before ranking. Stable geometry IDs break ties. These explicit weights are
initial unvalidated values, not a scientific terrain suitability model. Distinct
unknown routes can fill remaining slots with warnings. If all lack elevation the
response says the hill preference could not be applied.

No exact coordinates, provider bodies or secrets are logged. Request logs include
request ID, attempt/candidate/rejection/selected counts and failure categories.
