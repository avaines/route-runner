import { test } from "node:test";
import assert from "node:assert/strict";
import type { RouteRequest } from "@route-runner/contracts";
import {
  defaults,
  generate,
  guidedWaypoints,
  metres,
  type Candidate,
  type Provider,
} from "../src/routing.js";
import { OrsProvider } from "../src/provider.js";
const request: RouteRequest = {
  start: { latitude: 53.8, longitude: -1.55 },
  distanceMetres: 5000,
  hillPreference: "flat",
  seed: 10,
};
// Dense pedestrian-path fixture with a gradual hill, rather than changing ascent alone.
function path(points: [number, number][], climb = 20, detour = 1): Candidate {
  const coordinates: number[][] = [];
  for (let leg = 1; leg < points.length; leg++)
    for (let j = 0; j < 30; j++) {
      const t = j / 30,
        fraction = (leg - 1 + t) / (points.length - 1);
      coordinates.push([
        points[leg - 1][0] + t * (points[leg][0] - points[leg - 1][0]),
        points[leg - 1][1] + t * (points[leg][1] - points[leg - 1][1]),
        100 + (climb / 2) * (1 - Math.cos(fraction * 2 * Math.PI)),
      ]);
    }
  coordinates.push([...points.at(-1)!, 100]);
  const distance =
    coordinates
      .slice(1)
      .reduce((sum, p, i) => sum + metres(coordinates[i], p), 0) * detour;
  return {
    coordinates,
    distance,
    ascent: climb,
    descent: climb,
    attribution: "Synthetic pedestrian-path fixture",
  };
}
const noRoundTrip: Provider["generateRoundTrip"] = async () => {
  throw Error("guided provider must not use random round trips");
};
test("eight elongated loops close exactly and cover all bearings with bounded jitter", () => {
  for (let direction = 0; direction < 8; direction++) {
    const points = guidedWaypoints(request, direction, 10);
    assert.equal(points.length, 5);
    assert.deepEqual(points[0], points.at(-1));
    const east =
        (points[2][0] - points[0][0]) *
        Math.cos((request.start.latitude * Math.PI) / 180),
      north = points[2][1] - points[0][1];
    const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
    const difference = ((bearing - direction * 45 + 540) % 360) - 180;
    assert.ok(Math.abs(difference) <= 2.6);
    assert.ok(Math.abs(path(points).distance - 5000) < 2);
    assert.ok(
      Math.abs(
        metres(points[1], points[3]) / metres(points[0], points[2]) - 0.45,
      ) < 0.001,
    );
  }
});
test("guided adaptive neighbourhoods rescale and bound concurrent calls", async () => {
  const seen: [number, number][][] = [];
  let active = 0,
    peak = 0;
  const result = await generate(
    request,
    {
      generateRoundTrip: noRoundTrip,
      async generateGuidedLoop(points) {
        seen.push(points);
        peak = Math.max(peak, ++active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return path(points, 20, 1.2);
      },
    },
    "guided",
  );
  assert.equal(seen.length, 16);
  assert.equal(peak, 2);
  assert.equal(result.routes.length, 3);
  assert.ok(result.routes.every((r) => Math.abs(r.distanceMetres - 5000) < 3));
  // Network inflation of20% should produce a second probe about5/6 as large.
  const far = seen.map((p) => metres(p[0], p[2])).sort((a, b) => a - b);
  assert.ok(Math.abs(far[0] / far.at(-1)! - 1 / 1.2) < 0.002);
});
test("guided calls honor a smaller shared attempt budget", async () => {
  let calls = 0;
  const result = await generate(
    request,
    {
      generateRoundTrip: noRoundTrip,
      async generateGuidedLoop(points) {
        calls++;
        return path(points, 20, 1.08);
      },
    },
    "limited",
    { ...defaults, maxAttempts: 5 },
  );
  assert.equal(calls, 5);
  assert.ok(result.routes.length > 0);
});
test("guided probes within preferred tolerance still explore eight nearby headings", async () => {
  let calls = 0;
  await generate(
    request,
    {
      generateRoundTrip: noRoundTrip,
      async generateGuidedLoop(points) {
        calls++;
        return path(points);
      },
    },
    "no-refinement",
  );
  assert.equal(calls, 16);
});
test("continuous scoring crosses the former5% cliff; balanced values distance over flatness", async () => {
  const flat = path(
    guidedWaypoints({ ...request, distanceMetres: 5255 }, 0, 10),
    5,
  );
  const moderate = path(guidedWaypoints(request, 2, 10), 50);
  const hilly = path(
    guidedWaypoints({ ...request, distanceMetres: 5245 }, 4, 10),
    150,
  );
  async function choose(preference: RouteRequest["hillPreference"]) {
    let i = 0;
    return generate(
      { ...request, hillPreference: preference },
      {
        async generateRoundTrip() {
          return [flat, moderate, hilly][i++ % 3];
        },
      },
      preference,
    );
  }
  const f = await choose("flat"),
    b = await choose("balanced"),
    h = await choose("hilly");
  assert.equal(f.routes[0].ascentMetres, 5);
  assert.ok(f.routes[0].distanceErrorPercent > 5);
  assert.ok(f.routes[0].warnings.some((w) => w.includes("5%")));
  assert.equal(b.routes[0].ascentMetres, 50);
  assert.equal(h.routes[0].ascentMetres, 150);
});
test("ORS guided request sends closed coordinates with elevation and no round_trip options", async () => {
  const points = guidedWaypoints(request, 0, 10);
  let payload: any,
    url = "";
  const provider = new OrsProvider(
    async () => "test",
    async (requestUrl, init) => {
      url = requestUrl.toString();
      payload = JSON.parse(init!.body as string);
      const c = path(points);
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: { type: "LineString", coordinates: c.coordinates },
              properties: {
                summary: { distance: c.distance },
                ascent: c.ascent,
                descent: c.descent,
              },
            },
          ],
        }),
      );
    },
  );
  const candidate = await provider.generateGuidedLoop(
    points,
    new AbortController().signal,
  );
  assert.equal(
    url,
    "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
  );
  assert.deepEqual(payload.coordinates, points);
  assert.equal(payload.elevation, true);
  assert.equal(payload.options, undefined);
  assert.equal(candidate.ascent, 20);
});

test("guided deadline cancels active calls and does not start later directions", async () => {
  let calls = 0,
    aborted = 0;
  await assert.rejects(
    generate(
      request,
      {
        generateRoundTrip: noRoundTrip,
        generateGuidedLoop(_points, signal) {
          calls++;
          return new Promise((_, reject) =>
            signal.addEventListener(
              "abort",
              () => {
                aborted++;
                reject(Error("cancelled"));
              },
              { once: true },
            ),
          );
        },
      },
      "guided-deadline",
      { ...defaults, deadlineMs: 5 },
    ),
  );
  assert.equal(calls, 2);
  assert.equal(aborted, 2);
});
test("guided refinement size is clamped for extreme provider distance error", async () => {
  for (const [inflation, expectedScale] of [
    [3, 0.5],
    [0.2, 1.5],
  ]) {
    const pointsSeen: [number, number][][] = [];
    await assert.rejects(
      generate(
        request,
        {
          generateRoundTrip: noRoundTrip,
          async generateGuidedLoop(points) {
            pointsSeen.push(points);
            return path(points, 20, inflation);
          },
        },
        "clamp",
        { ...defaults, candidates: 1, maxAttempts: 2 },
      ),
    );
    assert.equal(pointsSeen.length, 2);
    assert.ok(
      Math.abs(
        metres(pointsSeen[1][0], pointsSeen[1][2]) /
          metres(pointsSeen[0][0], pointsSeen[0][2]) -
          expectedScale,
      ) < 0.001,
    );
  }
});

function bearing(points: [number, number][]) {
  const east =
      (points[2][0] - points[0][0]) *
      Math.cos((request.start.latitude * Math.PI) / 180),
    north = points[2][1] - points[0][1];
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}
test("both primary and adaptive candidates remain eligible", async () => {
  for (const bestCall of [1, 9]) {
    let calls = 0;
    const result = await generate(
      request,
      {
        generateRoundTrip: noRoundTrip,
        async generateGuidedLoop(points) {
          calls++;
          return path(points, calls === bestCall ? 5 : 150);
        },
      },
      "both-phases",
      { ...defaults, concurrency: 1 },
    );
    assert.equal(calls, 16);
    assert.equal(result.routes[0].ascentMetres, 5);
  }
});
test("two-phase exploration selects preference-specific probes then their angular neighbourhoods", async () => {
  for (const preference of ["flat", "hilly", "balanced"] as const) {
    const seen: [number, number][][] = [];
    let completed = 0;
    await generate(
      { ...request, hillPreference: preference },
      {
        generateRoundTrip: noRoundTrip,
        async generateGuidedLoop(points) {
          const index = seen.length;
          seen.push(points);
          if (index >= 8)
            assert.ok(completed >= 8, "all primary probes must finish first");
          await new Promise((resolve) => setTimeout(resolve, 1));
          completed++;
          return path(
            points,
            index < 8 ? 10 + index * 20 : 30,
            index === 3 || index === 4 ? 1 : 1.08,
          );
        },
      },
      preference,
    );
    assert.equal(seen.length, 16);
    const expected =
      preference === "flat"
        ? [0, 1]
        : preference === "hilly"
          ? [7, 6]
          : [3, 4].sort(
              (a, b) =>
                Math.abs(path(seen[a]).distance - 5000) -
                Math.abs(path(seen[b]).distance - 5000),
            );
    for (let i = 0; i < 8; i++) {
      const delta =
        ((bearing(seen[8 + i]) - bearing(seen[expected[i % 2]]) + 540) % 360) -
        180;
      assert.ok(Math.abs(delta - [-20, -7, 7, 20][Math.floor(i / 2)]) < 0.2);
    }
  }
});

test("failed primary directions are skipped and unknown elevation ranks last for flat exploration", async () => {
  const seen: [number, number][][] = [];
  await generate(
    request,
    {
      generateRoundTrip: noRoundTrip,
      async generateGuidedLoop(points) {
        const index = seen.length;
        seen.push(points);
        if (index === 0) throw Error("provider network failure");
        const c = path(points, index === 2 ? 5 : 40);
        return index === 1 ? { ...c, ascent: undefined } : c;
      },
    },
    "partial-primary",
    { ...defaults, concurrency: 1 },
  );
  assert.equal(seen.length, 16);
  const delta = ((bearing(seen[8]) - bearing(seen[2]) + 540) % 360) - 180;
  assert.ok(Math.abs(delta + 20) < 0.2);
});
