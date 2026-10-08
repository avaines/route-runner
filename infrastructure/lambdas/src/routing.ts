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
  generateGuidedLoop?(
    coordinates: [number, number][],
    signal: AbortSignal,
  ): Promise<Candidate>;
  generateRoundTrip(
    request: RouteRequest,
    seed: number,
    signal: AbortSignal,
  ): Promise<Candidate>;
}
export const defaults = {
  candidates: 8,
  concurrency: 2,
  maxAttempts: 16,
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
  // ORS should route via the anchors in order, with the same snapping allowance as start.
  let waypointIndex = 0;
  for (const point of request.waypoints ?? []) {
    const coordinate = [point.longitude, point.latitude];
    while (
      waypointIndex < c.length &&
      metres(c[waypointIndex], coordinate) > config.snapMetres
    )
      waypointIndex++;
    if (waypointIndex === c.length) return null;
  }
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
/** Start is the near end of an elongated ellipse; bearing selects its far end.
 * The four straight legs have perimeter target before street-network detours.
 */
export function guidedWaypoints(
  request: RouteRequest,
  direction: number,
  seed: number,
  scale = 1,
  bearingOffsetDegrees = 0,
): [number, number][] {
  const jitter = (((seed >>> 0) / 4294967295 - 0.5) * Math.PI) / 36;
  const bearing =
    (direction * Math.PI) / 4 + jitter + (bearingOffsetDegrees * Math.PI) / 180;
  const major =
    (request.distanceMetres / (4 * Math.sqrt(1 + 0.45 ** 2))) * scale;
  const minor = major * 0.45;
  const origin: [number, number] = [
    request.start.longitude,
    request.start.latitude,
  ];
  // Spherical destinations remain valid near poles and across the date line.
  const destination = (forward: number, across: number): [number, number] => {
    const east = forward * Math.sin(bearing) + across * Math.cos(bearing);
    const north = forward * Math.cos(bearing) - across * Math.sin(bearing);
    const angle = Math.atan2(east, north),
      arc = Math.hypot(east, north) / 6371000;
    const lat = (origin[1] * Math.PI) / 180,
      lon = (origin[0] * Math.PI) / 180;
    const latitude = Math.asin(
      Math.sin(lat) * Math.cos(arc) +
        Math.cos(lat) * Math.sin(arc) * Math.cos(angle),
    );
    const longitude =
      lon +
      Math.atan2(
        Math.sin(angle) * Math.sin(arc) * Math.cos(lat),
        Math.cos(arc) - Math.sin(lat) * Math.sin(latitude),
      );
    return [
      (((longitude * 180) / Math.PI + 540) % 360) - 180,
      (latitude * 180) / Math.PI,
    ];
  };
  const generated = [
    destination(major, minor),
    destination(2 * major, 0),
    destination(major, -minor),
  ];
  const via: [number, number][] = (request.waypoints ?? []).map((point) => [
    point.longitude,
    point.latitude,
  ]);
  if (!via.length) return [origin, ...generated, [...origin]];
  // At most20 ordered interleavings for three generated and three user anchors.
  // Keep both orders and select the smallest added straight-line detour.
  let best: [number, number][] = [],
    bestDistance = Infinity;
  const visit = (
    g: number,
    v: number,
    points: [number, number][],
    distance: number,
  ) => {
    if (g === generated.length && v === via.length) {
      const total = distance + metres(points.at(-1)!, origin);
      if (total < bestDistance) {
        bestDistance = total;
        best = [...points, [...origin]];
      }
      return;
    }
    if (g < generated.length)
      visit(
        g + 1,
        v,
        [...points, generated[g]],
        distance + metres(points.at(-1)!, generated[g]),
      );
    if (v < via.length)
      visit(
        g,
        v + 1,
        [...points, via[v]],
        distance + metres(points.at(-1)!, via[v]),
      );
  };
  visit(0, 0, [origin], 0);
  return best;
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
  const guided = provider.generateGuidedLoop?.bind(provider);
  const candidateCount = guided
    ? config.candidates
    : Math.min(config.candidates, 6);
  const attemptLimit = guided
    ? config.maxAttempts
    : Math.min(config.maxAttempts, 8);
  const canCall = () =>
    !stop && !controller.signal.aborted && attempts < attemptLimit;
  const enoughTime = () => Date.now() - started < config.deadlineMs - 500;
  const failureFor = (e: unknown) =>
    e instanceof ServiceError
      ? e
      : new ServiceError(
          controller.signal.aborted ? 504 : 502,
          controller.signal.aborted ? "DEADLINE_EXCEEDED" : "UPSTREAM_FAILURE",
          "Route generation could not finish.",
        );
  const recordFailure = (error: unknown) => {
    const failure = failureFor(error);
    failures.push(failure);
    if (
      ["PROVIDER_AUTH", "SERVICE_CONFIGURATION"].includes(failure.code) ||
      failure.status === 429 ||
      failure.retryAfter !== undefined
    )
      stop = true;
    return failure;
  };
  const accept = (candidate: Candidate) => {
    const result = analyse(candidate, request, config);
    if (result) {
      results.push(result);
      attributions.add(candidate.attribution);
    } else rejected++;
  };
  try {
    if (guided) {
      const probes: { index: number; candidate: Candidate }[] = [];
      const runPhase = async <T>(
        jobs: T[],
        run: (job: T) => Promise<void>,
        refinement = false,
      ) => {
        let cursor = 0;
        await Promise.all(
          Array.from({ length: config.concurrency }, async () => {
            while (
              cursor < jobs.length &&
              canCall() &&
              (!refinement || enoughTime())
            ) {
              const job = jobs[cursor++];
              attempts++;
              try {
                await run(job);
              } catch (error) {
                recordFailure(error);
              }
            }
          }),
        );
      };
      await runPhase(
        Array.from({ length: candidateCount }, (_, index) => index),
        async (index) => {
          const candidate = await bounded(
            guided(guidedWaypoints(request, index, seed), controller.signal),
            controller.signal,
          );
          // Raw distance/ascent can guide exploration even if the loop misses tolerance.
          if (Number.isFinite(candidate.distance) && candidate.distance > 0)
            probes.push({ index, candidate });
          accept(candidate);
        },
      );
      const explorationScore = ({ candidate }: (typeof probes)[number]) => {
        const error =
          Math.abs(candidate.distance - request.distanceMetres) /
          request.distanceMetres;
        if (request.hillPreference === "balanced") return error;
        if (!Number.isFinite(candidate.ascent) || candidate.ascent! < 0)
          return Infinity;
        const climb = candidate.ascent! / (candidate.distance / 1000);
        return request.hillPreference === "flat" ? climb : -climb;
      };
      const promising = probes
        .sort(
          (a, b) =>
            explorationScore(a) - explorationScore(b) || a.index - b.index,
        )
        .slice(0, 2);
      // Interleave the two neighbourhoods so reduced budgets still explore both.
      const jobs = [-20, -7, 7, 20].flatMap((offset) =>
        promising.map((probe) => ({ probe, offset })),
      );
      await runPhase(
        jobs,
        async ({ probe, offset }) => {
          const scale = Math.max(
            0.5,
            Math.min(1.5, request.distanceMetres / probe.candidate.distance),
          );
          const candidate = await bounded(
            guided(
              guidedWaypoints(request, probe.index, seed, scale, offset),
              controller.signal,
            ),
            controller.signal,
          );
          accept(candidate);
        },
        true,
      );
    } else {
      if (request.waypoints?.length)
        throw new ServiceError(
          422,
          "WAYPOINTS_UNSUPPORTED",
          "This routing provider cannot shape routes through waypoints.",
        );
      await Promise.all(
        Array.from({ length: config.concurrency }, async () => {
          while (next < candidateCount && canCall()) {
            const index = next++,
              derived = (seed + Math.imul(index, 2654435761)) >>> 0;
            for (
              let retry = 0;
              retry < 2 && canCall() && (retry === 0 || enoughTime());
              retry++
            ) {
              attempts++;
              try {
                accept(
                  await bounded(
                    provider.generateRoundTrip(
                      request,
                      derived,
                      controller.signal,
                    ),
                    controller.signal,
                  ),
                );
                break;
              } catch (error) {
                const failure = recordFailure(error);
                if (
                  failure.retryAfter !== undefined ||
                  failure.status < 500 ||
                  failure.status === 504 ||
                  [
                    "PROVIDER_AUTH",
                    "SERVICE_CONFIGURATION",
                    "UPSTREAM_INVALID",
                    "UPSTREAM_REJECTED",
                  ].includes(failure.code)
                )
                  break;
              }
            }
          }
        }),
      );
    }
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
            : 0)
    );
  };
  pool.sort(
    (a, b) => score(a) - score(b) || a.route.id.localeCompare(b.route.id),
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
