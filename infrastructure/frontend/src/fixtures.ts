import type { RouteRequest, RouteResponse } from "@route-runner/contracts";
// Synthetic loops for UI development only: these are not pedestrian routes.
export function fixtureResponse(request: RouteRequest): RouteResponse {
  const seed = request.seed ?? 1;
  return {
    schemaVersion: 1,
    requestId: "demo-" + seed,
    seed,
    requestedDistanceMetres: request.distanceMetres,
    warnings: ["Demo routes are synthetic. Do not use them for running."],
    attribution: {
      routingProvider: "Synthetic demo",
      text: "Illustrative geometry — no routing provider contacted",
    },
    routes: [0, 1, 2].map((index) => {
      const distance = request.distanceMetres * (1 + index * 0.015),
        radius = distance / (2 * Math.PI),
        phase = ((seed % 360) * Math.PI) / 180 + index * 2.1;
      const coordinates: [number, number][] = Array.from(
        { length: 101 },
        (_, i) => {
          const a = (i / 100) * Math.PI * 2 + phase;
          return [
            request.start.longitude +
              ((Math.cos(a) - Math.cos(phase)) * radius) /
                (111320 * Math.cos((request.start.latitude * Math.PI) / 180)),
            request.start.latitude +
              ((Math.sin(a) - Math.sin(phase)) * radius) / 111320,
          ];
        },
      );
      const ascent = 30 + index * 25;
      return {
        id: "demo-" + seed + "-" + index,
        distanceMetres: Math.round(distance),
        ascentMetres: ascent,
        descentMetres: ascent,
        distanceErrorPercent: index * 1.5,
        elevationQuality: "available" as const,
        geometry: { type: "LineString" as const, coordinates },
        elevationProfile: coordinates.map((_, i) => ({
          distanceMetres: (distance * i) / 100,
          elevationMetres:
            80 + (ascent / 2) * (1 - Math.cos((i / 100) * Math.PI * 2)),
        })),
        warnings: [],
        roadSummary: [],
      };
    }),
  };
}
