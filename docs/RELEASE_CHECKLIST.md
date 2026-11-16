# Release validation

This checklist separates a locally tested build from a validated live service.
Implementation does not establish route quality, provider permissions, or production readiness.

## Provider experiment — pending

Use an authorised openrouteservice credential and agreed public test starts in
West Yorkshire. Do not record personal start locations or credentials in fixtures,
logs, screenshots, or reports. Live calls consume the subscription's quota.

- Test 3, 5 and 10 km requests across several road/path networks and multiple seeds.
- Confirm hosted `foot-walking` round trips with elevation in the same request.
- Record actual distance, ascent, closure, repetition, plausibility, elapsed time,
  provider attempts and attribution; test each hill preference.
- Calibrate scoring and overlap thresholds against inspected real routes.
- Confirm quota and concurrency limits for the chosen subscription, including the
  amplification from multiple candidates per user request.
- Review current provider terms for overlays on Google Maps and browser favourites.
- If output is consistently poor, document another provider before adding bespoke
  pathfinding.

Documentation checked on 4 October 2026:

- [Current ORS backend documentation](https://giscience.github.io/openrouteservice/).
  The older specifications repository linked in the specification is archived.
- [Hosted API restrictions](https://openrouteservice.org/restrictions/) list a
  100 km maximum for round-trip requests. This does not establish route quality
  or the subscription's request quota.
- [ORS terms](https://account.heigit.org/info/tos) require direct review: automated
  text extraction did not expose the current terms. No storage or overlay
  permission is inferred from that failure.
- [Google Maps JavaScript policies](https://developers.google.com/maps/documentation/javascript/policies)
  require visible attribution and publicly accessible terms and privacy policies.
  Review the terms applicable to the actual billing account before release.

## Deployment preparation — pending operator inputs

- Verify AWS account, application region and remote-state access. The state bucket
  region and application region may differ.
- Confirm GitHub repository/environment OIDC trust and deployment role permissions.
- Populate the Terraform-created routing parameter manually in SSM; never pass its value through Terraform
  variables, checked-in files or frontend configuration.
- Configure the Google browser key with API and website restrictions, including
  separate local development restrictions. Confirm billing and quotas.
- Decide notification recipients and billing thresholds; alerts are not spending caps.
- Choose whether the public app needs authentication before wider availability.
- Review the Terraform plan before the user performs deployment.

## Deployed acceptance — pending

- Generate a real route through CloudFront with a correctly hashed POST body.
- Missing and incorrect payload hashes fail; unsigned direct Lambda URL requests fail.
- Anonymous direct S3 reads fail. API errors remain JSON, without an HTML fallback.
- Inspect Google satellite imagery, full route geometry, kilometre markers and
  elevation on a mobile device. Verify attribution remains visible.
- Deny geolocation and choose a start manually. Test throttling, missing elevation,
  timeout, partial results and preserving a previous result after failure.
- Verify favourites reload/delete correctly and comply with provider terms.
- Check logs and bundles for credentials and precise route data.
- Demonstrate a repeat deployment, rollback to retained frontend/backend artifacts,
  and the reserved-concurrency-zero kill switch.
- Measure generation latency, errors and upstream usage against the proposed targets.
