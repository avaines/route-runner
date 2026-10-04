import { createHash } from "node:crypto";
import type {
  Route,
  RouteRequest,
  RouteResponse,
} from "@route-runner/contracts";
export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export interface Candidate {
  coordinates: number[][];
  distance: number;
  ascent?: number;
  descent?: number;
  attribution: string;
}
export interface Provider {
  generateRoundTrip(
    request: RouteRequest,
    seed: number,
    signal: AbortSignal,
  ): Promise<Candidate>;
}
export const defaults = {
  candidates: 6,
  concurrency: 2,
  maxAttempts: 8,
  deadlineMs: 20000,
  snapMetres: 50,
  preferredError: 0.05,
  maxError: 0.1,
  repeatedSoft: 0.15,
  repeatedMax: 0.4,
  duplicateOverlap: 0.8,
  weights: {
    distance: 100,
    repeated: 80,
    reversal: 2,
    flatAscent: 2,
    flatSteep: 40,
    balancedAscent: 0.3,
    hillyAscent: 1,
    hillyCap: 60,
  },
};
export type Config = typeof defaults;
export const metres = (a: number[], b: number[]) => {
  const rad = Math.PI / 180;
  const dlat = (b[1] - a[1]) * rad,
    dlon = (b[0] - a[0]) * rad;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a[1] * rad) *
              Math.cos(b[1] * rad) *
              Math.sin(dlon / 2) ** 2,
        ),
      ),
    )
  );
};
interface Scored {
  route: Route;
  edges: Set<string>;
  repeated: number;
  steep: number;
  reversals: number;
}
export function analyse(
  candidate: Candidate,
  request: RouteRequest,
  config = defaults,
): Scored | null {
  const { coordinates: c, distance: d } = candidate;
  if (
    !Number.isFinite(d) ||
    d <= 0 ||
    !Array.isArray(c) ||
    c.length < 3 ||
    c.length > 100000 ||
    c.some(
      (p) =>
        !Array.isArray(p) ||
        p.length < 2 ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  )
    throw new ServiceError(
      502,
      "UPSTREAM_INVALID",
      "The routing provider returned an unusable route.",
    );
  const start = [request.start.longitude, request.start.latitude],
    error = Math.abs(d - request.distanceMetres) / request.distanceMetres;
  if (
    error > config.maxError + 1e-10 ||
    metres(c[0], start) > config.snapMetres ||
    metres(c.at(-1)!, start) > config.snapMetres ||
    metres(c[0], c.at(-1)!) > config.snapMetres
  )
    return null;
  const lengths = [0];
  for (let i = 1; i < c.length; i++)
    lengths.push(lengths[i - 1] + metres(c[i - 1], c[i]));
  const total = lengths.at(-1)!;
  if (total <= 0 || Math.abs(total - d) / d > 0.35)
    throw new ServiceError(
      502,
      "UPSTREAM_INVALID",
      "The route geometry and distance disagree.",
    );
  // Sample each physical segment independently at <=10m, quantising midpoints into 15m cells.
  // Undirected spatial coverage deduplicates reversed paths and tolerates different vertex density.
  const edges = new Set<string>(),
    visits = new Map<
      string,
      { last: number; passes: number; length: number }
    >();
  let repeatedLength = 0,
    reversals = 0;
  const cos = Math.max(0.01, Math.cos((start[1] * Math.PI) / 180));
  for (let i = 1; i < c.length; i++) {
    const len = lengths[i] - lengths[i - 1],
      count = Math.max(1, Math.ceil(len / 10));
    for (let j = 0; j < count; j++) {
      const t = (j + 0.5) / count;
      const x = (c[i - 1][0] + (c[i][0] - c[i - 1][0]) * t) * 111195 * cos,
        y = (c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t) * 111195;
      const key = `${Math.round(x / 15)},${Math.round(y / 15)}`;
      edges.add(key);
      const at = lengths[i - 1] + t * len,
        visit = visits.get(key);
      if (visit) {
        if (at - visit.last > 40) visit.passes++;
        visit.last = at;
        visit.length += len / count;
      } else visits.set(key, { last: at, passes: 1, length: len / count });
    }
    if (i > 1) {
      const a = [(c[i - 1][0] - c[i - 2][0]) * cos, c[i - 1][1] - c[i - 2][1]],
        b = [(c[i][0] - c[i - 1][0]) * cos, c[i][1] - c[i - 1][1]];
      const norm = Math.hypot(...a) * Math.hypot(...b);
      if (norm > 0 && (a[0] * b[0] + a[1] * b[1]) / norm < -0.85) reversals++;
    }
  }
  for (const visit of visits.values())
    repeatedLength += (visit.length * (visit.passes - 1)) / visit.passes;
  const repeated = repeatedLength / total;
  if (repeated > config.repeatedMax) return null;
  const available =
    c.every((p) => Number.isFinite(p[2])) &&
    Number.isFinite(candidate.ascent) &&
    candidate.ascent! >= 0 &&
    Number.isFinite(candidate.descent) &&
    candidate.descent! >= 0;
  const profile: Route["elevationProfile"] = [];
  let steep = 0;
  if (available) {
    let index = 1;
    for (let at = 0; at < total; at += 25) {
      while (index < c.length - 1 && lengths[index] < at) index++;
      const span = lengths[index] - lengths[index - 1];
      const t = span ? (at - lengths[index - 1]) / span : 0;
      profile.push({
        distanceMetres: (at * d) / total,
        elevationMetres: c[index - 1][2] + t * (c[index][2] - c[index - 1][2]),
      });
    }
    profile.push({ distanceMetres: d, elevationMetres: c.at(-1)![2] });
    const smoothed = profile.map(
      (_, i) =>
        profile
          .slice(Math.max(0, i - 1), i + 2)
          .reduce((sum, p) => sum + p.elevationMetres, 0) /
        profile.slice(Math.max(0, i - 1), i + 2).length,
    );
    for (let i = 3; i < profile.length; i++)
      if (
        (smoothed[i] - smoothed[i - 3]) /
          (profile[i].distanceMetres - profile[i - 3].distanceMetres) >
        0.06
      )
        steep += profile[i].distanceMetres - profile[i - 1].distanceMetres;
  }
  const warnings = [];
  if (error > config.preferredError)
    warnings.push(
      `Distance is more than ${config.preferredError * 100}% from your target.`,
    );
  if (metres(c[0], start) > 5)
    warnings.push("Start snapped to a nearby road or path.");
  if (repeated > config.repeatedSoft)
    warnings.push("This route repeats some sections.");
  if (!available) warnings.push("Elevation is unavailable for this route.");
  return {
    route: {
      id: createHash("sha256")
        .update([...edges].sort().join(";"))
        .digest("hex")
        .slice(0, 16),
      distanceMetres: d,
      ascentMetres: available ? candidate.ascent! : null,
      descentMetres: available ? candidate.descent! : null,
      distanceErrorPercent:
        ((d - request.distanceMetres) / request.distanceMetres) * 100,
      elevationQuality: available ? "available" : "unavailable",
      geometry: { type: "LineString", coordinates: c.map((p) => [p[0], p[1]]) },
      elevationProfile: profile,
      warnings,
      roadSummary: [],
    },
    edges,
    repeated,
    steep: steep / d,
    reversals,
  };
}
const overlap = (a: Set<string>, b: Set<string>) =>
  [...a].filter((x) => b.has(x)).length / Math.min(a.size, b.size);
async function bounded<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let listener: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    listener = () =>
      reject(
        new ServiceError(
          504,
          "DEADLINE_EXCEEDED",
          "Route generation took too long.",
        ),
      );
    if (signal.aborted) listener();
    else signal.addEventListener("abort", listener, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", listener);
  }
}
export async function generate(
  request: RouteRequest,
  provider: Provider,
  requestId: string,
  config = defaults,
): Promise<RouteResponse> {
  const started = Date.now();
  const seed = request.seed ?? Math.floor(Math.random() * 4294967296),
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), config.deadlineMs);
  const results: Scored[] = [],
    failures: ServiceError[] = [],
    attributions = new Set<string>();
  let next = 0,
    attempts = 0,
    rejected = 0,
    stop = false;
  try {
    await Promise.all(
      Array.from({ length: config.concurrency }, async () => {
        while (
          next < config.candidates &&
          !controller.signal.aborted &&
          !stop
        ) {
          const index = next++;
          const derived = (seed + Math.imul(index, 2654435761)) >>> 0;
          for (
            let retry = 0;
            retry < 2 &&
            (retry === 0 || Date.now() - started < config.deadlineMs - 500) &&
            !stop &&
            !controller.signal.aborted &&
            attempts < config.maxAttempts;
            retry++
          ) {
            attempts++;
            try {
              const candidate = await bounded(
                provider.generateRoundTrip(request, derived, controller.signal),
                controller.signal,
              );
              const result = analyse(candidate, request, config);
              if (result) {
                results.push(result);
                attributions.add(candidate.attribution);
              } else rejected++;
              break;
            } catch (e) {
              const failure =
                e instanceof ServiceError
                  ? e
                  : new ServiceError(
                      controller.signal.aborted ? 504 : 502,
                      controller.signal.aborted
                        ? "DEADLINE_EXCEEDED"
                        : "UPSTREAM_FAILURE",
                      "Route generation could not finish.",
                    );
              failures.push(failure);
              if (
                failure.code === "PROVIDER_AUTH" ||
                failure.code === "SERVICE_CONFIGURATION" ||
                failure.status === 429 ||
                failure.retryAfter !== undefined
              )
                stop = true;
              if (
                failure.retryAfter !== undefined ||
                failure.status < 500 ||
                failure.status === 504 ||
                failure.code === "PROVIDER_AUTH" ||
                failure.code === "UPSTREAM_INVALID" ||
                failure.code === "UPSTREAM_REJECTED" ||
                failure.code === "SERVICE_CONFIGURATION" ||
                retry === 1
              )
                break;
            }
          }
        }
      }),
    );
  } finally {
    clearTimeout(timer);
  }
  const known = results.filter((r) => r.route.elevationQuality === "available");
  const distinctKnown: Scored[] = [];
  for (const candidate of [...known].sort((a, b) =>
    a.route.id.localeCompare(b.route.id),
  )) {
    if (
      distinctKnown.every(
        (existing) =>
          overlap(existing.edges, candidate.edges) < config.duplicateOverlap,
      )
    )
      distinctKnown.push(candidate);
  }
  const pool = distinctKnown.length >= 3 ? known : results;
  const w = config.weights;
  const score = (r: Scored) => {
    const ascent =
      (r.route.ascentMetres ?? 0) / (r.route.distanceMetres / 1000);
    return (
      (Math.abs(r.route.distanceErrorPercent) / 100) * w.distance +
      Math.max(0, r.repeated - config.repeatedSoft) * w.repeated +
      r.reversals * w.reversal +
      (r.route.elevationQuality === "unavailable"
        ? 1000
        : request.hillPreference === "flat"
          ? ascent * w.flatAscent + r.steep * w.flatSteep
          : request.hillPreference === "hilly"
            ? -Math.min(ascent, w.hillyCap) * w.hillyAscent
            : ascent * w.balancedAscent)
    );
  };
  pool.sort(
    (a, b) =>
      Number(
        Math.abs(a.route.distanceErrorPercent) > config.preferredError * 100,
      ) -
        Number(
          Math.abs(b.route.distanceErrorPercent) > config.preferredError * 100,
        ) ||
      score(a) - score(b) ||
      a.route.id.localeCompare(b.route.id),
  );
  const selected: Scored[] = [];
  for (const r of pool)
    if (
      selected.length < 3 &&
      selected.every((s) => overlap(s.edges, r.edges) < config.duplicateOverlap)
    )
      selected.push(r);
  console.info(
    JSON.stringify({
      requestId,
      durationMs: Date.now() - started,
      attempts,
      candidates: results.length,
      rejected,
      selected: selected.length,
      failures: failures.map((f) => f.code),
    }),
  );
  if (!selected.length) {
    if (controller.signal.aborted)
      throw new ServiceError(
        504,
        "DEADLINE_EXCEEDED",
        "Route generation took too long. Please try again.",
      );
    if (failures.length && !rejected)
      throw failures.find((f) => f.status === 429) ?? failures[0];
    throw new ServiceError(
      422,
      "NO_USABLE_ROUTE",
      "No suitable loop was found. Try a different distance or starting point.",
    );
  }
  const warnings = [];
  if (failures.length || controller.signal.aborted)
    warnings.push(
      "Some route attempts could not finish; available routes are shown.",
    );
  if (!known.length)
    warnings.push(
      "Elevation was unavailable, so the hill preference could not be applied.",
    );
  return {
    schemaVersion: 1,
    requestId,
    seed,
    requestedDistanceMetres: request.distanceMetres,
    routes: selected.map((r) => r.route),
    warnings,
    attribution: {
      routingProvider: "openrouteservice",
      text: [...attributions].join(" | "),
    },
  };
}
