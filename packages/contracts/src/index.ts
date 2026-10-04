export const LIMITS = {
  minDistanceMetres: 1000,
  maxDistanceMetres: 30000,
  maxBodyBytes: 8192,
} as const;
export type HillPreference = "flat" | "balanced" | "hilly";
export interface RouteRequest {
  start: { latitude: number; longitude: number };
  distanceMetres: number;
  hillPreference: HillPreference;
  seed?: number;
}
export interface Route {
  id: string;
  distanceMetres: number;
  ascentMetres: number | null;
  descentMetres: number | null;
  distanceErrorPercent: number;
  elevationQuality: "available" | "unavailable";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  elevationProfile: { distanceMetres: number; elevationMetres: number }[];
  warnings: string[];
  roadSummary: string[];
}
export type RouteOption = Route;
export interface RouteResponse {
  schemaVersion: 1;
  requestId: string;
  seed: number;
  requestedDistanceMetres: number;
  routes: Route[];
  warnings: string[];
  attribution: { routingProvider: string; text: string };
}
export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const strings = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((v) => typeof v === "string");
function assert(
  condition: unknown,
  message = "Invalid response from route service.",
): asserts condition {
  if (!condition) throw new Error(message);
}
export function parseRouteRequest(x: unknown): RouteRequest {
  assert(object(x), "Request must be an object.");
  assert(
    Object.keys(x).every((k) =>
      ["start", "distanceMetres", "hillPreference", "seed"].includes(k),
    ),
    "Unexpected request field.",
  );
  assert(
    object(x.start) &&
      Object.keys(x.start).every((k) => ["latitude", "longitude"].includes(k)),
    "Invalid start.",
  );
  assert(
    finite(x.start.latitude) &&
      Math.abs(x.start.latitude) <= 90 &&
      finite(x.start.longitude) &&
      Math.abs(x.start.longitude) <= 180,
    "Choose a valid starting location.",
  );
  assert(
    finite(x.distanceMetres) &&
      Number.isInteger(x.distanceMetres) &&
      x.distanceMetres >= LIMITS.minDistanceMetres &&
      x.distanceMetres <= LIMITS.maxDistanceMetres,
    "Distance must be between 1 and 30 km in whole metres.",
  );
  assert(
    ["flat", "balanced", "hilly"].includes(x.hillPreference as string),
    "Choose a supported hill preference.",
  );
  assert(
    x.seed === undefined ||
      (finite(x.seed) &&
        Number.isInteger(x.seed) &&
        x.seed >= 0 &&
        x.seed <= 4294967295),
    "Invalid seed.",
  );
  return x as unknown as RouteRequest;
}
export function validateRouteRequest(x: unknown) {
  try {
    return { success: true as const, data: parseRouteRequest(x) };
  } catch (e) {
    return { success: false as const, error: (e as Error).message };
  }
}
export function parseRouteResponse(x: unknown): RouteResponse {
  assert(object(x) && x.schemaVersion === 1 && typeof x.requestId === "string");
  assert(
    finite(x.seed) &&
      Number.isInteger(x.seed) &&
      x.seed >= 0 &&
      x.seed <= 4294967295 &&
      finite(x.requestedDistanceMetres) &&
      x.requestedDistanceMetres > 0,
  );
  assert(
    strings(x.warnings) &&
      object(x.attribution) &&
      typeof x.attribution.routingProvider === "string" &&
      typeof x.attribution.text === "string",
  );
  assert(
    Array.isArray(x.routes) && x.routes.length >= 1 && x.routes.length <= 3,
  );
  for (const r of x.routes) {
    assert(
      object(r) &&
        typeof r.id === "string" &&
        finite(r.distanceMetres) &&
        r.distanceMetres > 0 &&
        finite(r.distanceErrorPercent),
    );
    assert(
      object(r.geometry) &&
        r.geometry.type === "LineString" &&
        Array.isArray(r.geometry.coordinates) &&
        r.geometry.coordinates.length >= 3,
    );
    assert(
      r.geometry.coordinates.every(
        (c: unknown) =>
          Array.isArray(c) &&
          c.length === 2 &&
          finite(c[0]) &&
          Math.abs(c[0]) <= 180 &&
          finite(c[1]) &&
          Math.abs(c[1]) <= 90,
      ),
    );
    assert(
      strings(r.warnings) &&
        strings(r.roadSummary) &&
        Array.isArray(r.elevationProfile),
    );
    if (r.elevationQuality === "unavailable")
      assert(
        r.ascentMetres === null &&
          r.descentMetres === null &&
          r.elevationProfile.length === 0,
      );
    else {
      assert(
        r.elevationQuality === "available" &&
          finite(r.ascentMetres) &&
          r.ascentMetres >= 0 &&
          finite(r.descentMetres) &&
          r.descentMetres >= 0 &&
          r.elevationProfile.length >= 2,
      );
      assert(
        r.elevationProfile[0].distanceMetres === 0 &&
          Math.abs(
            r.elevationProfile.at(-1).distanceMetres - r.distanceMetres,
          ) < 1,
      );
      let previous = -1;
      for (const p of r.elevationProfile) {
        assert(
          object(p) &&
            finite(p.distanceMetres) &&
            p.distanceMetres >= 0 &&
            p.distanceMetres > previous &&
            finite(p.elevationMetres),
        );
        previous = p.distanceMetres;
      }
    }
  }
  return x as unknown as RouteResponse;
}
