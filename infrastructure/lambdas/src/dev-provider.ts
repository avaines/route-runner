import { OrsProvider } from "./provider.js";
import { fixtureProvider } from "./fixture.js";

export function developmentProvider(live: boolean, env: NodeJS.ProcessEnv) {
  if (!live) return fixtureProvider;
  if (env.ALLOW_LIVE_PROVIDER !== "yes" || !env.ORS_API_KEY?.trim()) {
    throw new Error(
      "Live development requires ALLOW_LIVE_PROVIDER=yes and ORS_API_KEY in .env.local.",
    );
  }
  const key = env.ORS_API_KEY.trim();
  return new OrsProvider(async () => key);
}
