import { parseRouteRequest } from "@route-runner/contracts";
import { OrsProvider } from "./provider.js";
import { generate } from "./routing.js";
if (process.env.ALLOW_LIVE_PROVIDER !== "yes" || !process.env.ORS_API_KEY)
  throw new Error(
    "Set ALLOW_LIVE_PROVIDER=yes and ORS_API_KEY securely to run the quota-consuming spike.",
  );
let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = parseRouteRequest(JSON.parse(input)),
  started = Date.now();
const result = await generate(
  request,
  new OrsProvider(async () => process.env.ORS_API_KEY!),
  "live-spike",
);
console.info(
  JSON.stringify(
    {
      durationMs: Date.now() - started,
      seed: result.seed,
      routes: result.routes.map((r) => ({
        distanceMetres: r.distanceMetres,
        ascentMetres: r.ascentMetres,
        warnings: r.warnings,
      })),
      warnings: result.warnings,
      attribution: result.attribution,
    },
    null,
    2,
  ),
);
