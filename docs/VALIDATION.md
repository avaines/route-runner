# Local build validation

Checked 4 October 2026. No live routing requests, AWS plan/apply or deployment were run.

| Check | Result |
| --- | --- |
| Backend TypeScript validation | Passed |
| Backend focused tests | 17 passed |
| Backend bundled CommonJS build and handler health smoke | Passed |
| Frontend TypeScript validation | Passed |
| Frontend workflow and exact-byte hashing tests | 6 passed |
| Frontend production build | Passed |
| npm vulnerability audits, both packages | Zero reported at validation time |
| Terraform init with backend disabled | Passed; downloaded public providers only |
| Terraform validation and recursive format check | Passed |
| GitHub Actions YAML parsing | Passed |
| Patch whitespace checks | Passed |
| Tracked credential/environment/state/plan filename check | No matching files |

Browser verification used the local synthetic backend through the Vite proxy.
Generation returned three routes; saving, reloading and reopening a favourite
preserved its geometry and settings. The planner was inspected at narrow mobile
and desktop widths. The compiled production frontend also generated routes
through its local preview proxy. No Google key was configured, so the schematic
fallback was inspected, not satellite imagery or live Google interactions.

The frontend's Rollup 4.64.0 tree-shaking step stalled across the tested Node
versions. `build.rollupOptions.treeshake=false` is a documented temporary
workaround. Bundling and minification succeed; the main JavaScript bundle is
approximately 207 kB (66 kB gzip). Revisit after an upstream fix is verified.

The tests and synthetic preview validate application behaviour, not provider
routing quality, actual path access, terms, deployed signing, performance or
rollback. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for outstanding gates.

## First live provider smoke test — 4 October 2026

After local credentials and explicit live-mode opt-in were supplied, one balanced
5 km request from the specification's public central Leeds start (seed 1729)
completed in 501 ms. Six upstream attempts produced five usable candidates,
one rejection and three selected routes, with no upstream failures:

| Distance | Ascent | Distance fallback warning |
| --- | --- | --- |
| 5,173.1 m | 91.7 m | No |
| 5,402.1 m | 55.7 m | Yes, outside 5% |
| 4,654.9 m | 74.5 m | Yes, outside 5% |

The hosted provider accepted pedestrian round-trip requests with elevation and
returned attribution. This is one compatibility smoke test, not completion of the
multi-site, multi-distance, hill-preference calibration or field plausibility gate.
No AWS deployment was performed during this test.
