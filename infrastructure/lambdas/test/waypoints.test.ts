import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS,
  parseRouteRequest,
  type RouteRequest,
} from "@route-runner/contracts";
import {
  analyse,
  generate,
  guidedWaypoints,
  ServiceError,
} from "../src/routing.js";
import { fixtureProvider } from "../src/fixture.js";
const request: RouteRequest = {
  start: { latitude: 53.8, longitude: -1.55 },
  distanceMetres: 5000,
  hillPreference: "flat",
  seed: 10,
};
const signal = new AbortController().signal;
test("waypoint contract accepts zero through three ordered coordinates and rejects invalid input", () => {
  assert.equal(LIMITS.maxWaypoints, 3);
  assert.deepEqual(
    parseRouteRequest({ ...request, waypoints: [] }).waypoints,
    [],
  );
  const valid = [
    { latitude: 0, longitude: 180 },
    { latitude: 90, longitude: 0 },
    { latitude: -90, longitude: -180 },
  ];
  assert.deepEqual(
    parseRouteRequest({ ...request, waypoints: valid }).waypoints,
    valid,
  );
  for (const waypoints of [
    null,
    {},
    [...valid, valid[0]],
    [{ latitude: NaN, longitude: 1 }],
    [{ latitude: 91, longitude: 0 }],
    [{ latitude: 0, longitude: 181 }],
    [{ latitude: 1 }],
    [{ latitude: 1, longitude: 1, unexpected: 1 }],
    [null],
  ])
    assert.throws(() => parseRouteRequest({ ...request, waypoints }));
});
test("shaping anchors retain their exact ordered positions through all orientations and rescaling", () => {
  const waypoints = [
    { latitude: 53.805, longitude: -1.549 },
    { latitude: 53.804, longitude: -1.545 },
    { latitude: 53.802, longitude: -1.548 },
  ];
  for (const direction of [0, 3, 7])
    for (const scale of [0.5, 1, 1.5]) {
      const points = guidedWaypoints(
        { ...request, waypoints },
        direction,
        10,
        scale,
        20,
      );
      assert.equal(points.length, 8);
      assert.deepEqual(points[0], points.at(-1));
      let previous = -1;
      for (const point of waypoints) {
        const index = points.findIndex(
          (p) => p[0] === point.longitude && p[1] === point.latitude,
        );
        assert.ok(index > previous);
        previous = index;
      }
    }
  assert.deepEqual(
    guidedWaypoints({ ...request, waypoints: [] }, 2, 10),
    guidedWaypoints(request, 2, 10),
  );
});
test("all guided calls include user anchors and returned routes must visit them in order", async () => {
  const candidate = await fixtureProvider.generateRoundTrip(
    request,
    10,
    signal,
  );
  const waypoints = [25, 60].map((index) => ({
    longitude: candidate.coordinates[index][0],
    latitude: candidate.coordinates[index][1],
  }));
  const shaped = { ...request, waypoints };
  let calls = 0;
  const result = await generate(
    shaped,
    {
      async generateRoundTrip() {
        throw Error("must use guided");
      },
      async generateGuidedLoop(points) {
        calls++;
        for (const point of waypoints)
          assert.ok(
            points.some(
              (p) => p[0] === point.longitude && p[1] === point.latitude,
            ),
          );
        assert.deepEqual(points[0], points.at(-1));
        return candidate;
      },
    },
    "waypoints",
  );
  assert.equal(calls, 16);
  assert.equal(result.routes.length, 1);
  assert.ok(analyse(candidate, shaped));
  assert.equal(
    analyse(candidate, { ...shaped, waypoints: [...waypoints].reverse() }),
    null,
  );
  assert.equal(
    analyse(candidate, {
      ...shaped,
      waypoints: [{ latitude: 53.9, longitude: -1.55 }],
    }),
    null,
  );
});
test("waypoints cannot be silently ignored by roundtrip-only providers", async () => {
  let calls = 0;
  await assert.rejects(
    generate(
      { ...request, waypoints: [{ latitude: 53.805, longitude: -1.55 }] },
      {
        async generateRoundTrip(r, seed, signal) {
          calls++;
          return fixtureProvider.generateRoundTrip(r, seed, signal);
        },
      },
      "unsupported",
    ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 422 &&
      error.code === "WAYPOINTS_UNSUPPORTED",
  );
  assert.equal(calls, 0);
});
