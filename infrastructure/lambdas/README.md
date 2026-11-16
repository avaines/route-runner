# Route Lambda

Node.js 22, TypeScript, bundled CommonJS `dist/index.js` with `index.handler`.

```
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

The default development HTTP server binds localhost:3001 and uses synthetic circular
fixtures. Its routes are not navigable. Vite proxies `/api`.
For intentional live local development, populate `.env.local` with `ORS_API_KEY`
and `ALLOW_LIVE_PROVIDER=yes`, then run `npm run dev:live` instead. This command
loads that file explicitly and uses the real provider; requests consume quota.
The bundle includes dependencies; deploy the contents of `dist`, including its
CommonJS package.json. No dependencies download during invocation.

Production requires `ROUTING_PARAMETER_NAME`; store the plain ORS API key (no JSON wrapper) in an SSM Parameter Store `SecureString` through a secure operator process.
Terraform creates an UNSET placeholder; populate the plain key manually in SSM.
The backend requests decryption and rejects non-SecureString parameters. Values
are cached for five minutes. Fetches time out after three seconds. No key belongs
in Terraform variables or frontend configuration.

Optional bounded configuration: `ROUTE_CANDIDATES` (1–8, default8),
`PROVIDER_CONCURRENCY` (1–2, default2), `MAX_PROVIDER_ATTEMPTS` (1–16, default16),
`REQUEST_DEADLINE_MS` (1–20000, default20000). Distance limits are shared contract
constants, keeping both clients consistent. Geometry/scoring calibration defaults
are centralized in `src/routing.ts`. Optional `ROUTE_CALIBRATION_JSON` accepts
`snapMetres`, `preferredError`, `maxError`, `repeatedSoft`, `repeatedMax`,
`duplicateOverlap`, and a partial `weights` object using keys in the defaults.
Values are validated; distance/repetition fractions must be ordered. See
docs/ROUTING.md before changing these uncalibrated settings.

`npm run spike` is explicitly live and quota consuming. It requires
`ALLOW_LIVE_PROVIDER=yes` and `ORS_API_KEY` supplied securely through environment,
and a contract request JSON on stdin. Output contains summary metrics, not precise
geometry. Do not run it in normal CI. A private local regression route informed
guided discovery but is excluded from version control. Broader route quality,
quota/terms and latency remain release checks. The provider adapter uses the fixed ORS foot-walking GeoJSON URL,
guided closed waypoint loops, elevation=true, instructions=false. Round-trip
length/points/seed remain supported for fallback providers. Surface tags and
road summaries are intentionally not assumed available.

Route shaping accepts optional `waypoints` (up to three ordered latitude/longitude
objects). Guided requests merge these fixed anchors with generated loop points,
preserving order and exact start/finish closure. Scaling changes only generated
points. Returned routes must visit every anchor in order within the same 50 m
snapping tolerance used for the start; impossible constraints return no usable
route. A provider without guided support returns 422 instead of ignoring anchors.
No waypoint coordinates are logged. Omitting waypoints or sending an empty list
preserves automatic route generation.
