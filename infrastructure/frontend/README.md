# Route Runner frontend

React + TypeScript + Vite. Run from the repository with Node.js 22:

```sh
npm --prefix infrastructure/frontend ci
npm --prefix infrastructure/frontend run dev
npm --prefix infrastructure/frontend test
npm --prefix infrastructure/frontend run build
```

Build output is `dist/`. Build runs TypeScript validation; `npm run lint` also runs TypeScript validation. There is no client-side path router.

For offline provider development run the backend's `npm run dev` and use the default Vite `/api` proxy to `http://localhost:3001`. Alternatively set `VITE_MOCK_API=true` for bundled synthetic fixtures. Both are illustrative only and must not be used as running routes. The default frontend calls the real same-origin `/api/routes`; it never silently falls back to fabricated routes. Copy `.env.example` to a local ignored `.env.local` for overrides.

`VITE_GOOGLE_MAPS_API_KEY` enables the Google hybrid map. It is a public browser key: restrict referrers and APIs, enable the required Google project billing, and configure quotas before deployment. No routing credential belongs in a Vite variable. Without a Maps key the app provides an explicitly schematic preview and coordinate entry. Google map click and dragging the start marker support manual placement after geolocation denial. The browser asks for location only on a button click. Script/network failure preserves manual coordinate entry.

The shared contracts package validates requests and responses at runtime. The API client serializes JSON once and sends the same UTF-8 bytes it hashes using SHA-256. Browsers require HTTPS (or localhost) for Web Crypto and geolocation. Requests time out after 30 seconds; changing a setting cancels pending work and ignores stale responses. Prior successful routes remain visible after errors. Kilometre markers are interpolated along geometry, scaled to provider distance, and approximate.

Saved routes use `route-runner:favourites` in localStorage with schema version 1, creation date, request, selected route and attribution. Unsupported or invalid data is reported, not automatically migrated or overwritten on read. Explicit saves/deletes replace storage; browser storage failures are reported. Only explicit saves persist precise route locations. Saved geometry can be stale: reopening restores the original settings and “Try different routes” regenerates it.

Live Google rendering, provider storage/attribution terms and CloudFront signing require release validation. The Google script uses its quarterly channel; provider-hosted JavaScript cannot be pinned by the npm lockfile. Map loader documentation: https://developers.google.com/maps/documentation/javascript/load-maps-js-api

## Build note

The locked Rollup 4.64.0 stalls while tree-shaking this module graph (reproduced on Node 22.5.1, 22.22.0 and 24.1.0). `vite.config.ts` temporarily disables tree-shaking; production bundling and minification remain enabled. The current production JavaScript is approximately 207 kB (66 kB gzip), plus an unloaded 1 kB synthetic fixture chunk. Remove the workaround only after an upstream upgrade builds successfully with tree-shaking restored. Dependency audit reports zero known vulnerabilities at implementation time.
