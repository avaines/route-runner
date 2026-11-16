import { expect, test } from "vitest";
import { nearestOnRoute, insertWaypoint } from "./waypoints";
import { fixtureResponse } from "./fixtures";
const route = fixtureResponse({
  start: { latitude: 0, longitude: 0 },
  distanceMetres: 5000,
  hillPreference: "flat",
  seed: 1,
}).routes[0];
route.geometry.coordinates = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
  [0, 0],
];
test("projects marker onto path segment rather than distant vertex", () => {
  expect(nearestOnRoute({ latitude: 0.1, longitude: 1 }, route).point).toEqual({
    latitude: 0,
    longitude: 1,
  });
});
test("inserts new waypoint in path order", () => {
  expect(
    insertWaypoint(
      [{ latitude: 2, longitude: 1 }],
      { latitude: 0, longitude: 1 },
      route,
    ),
  ).toEqual([
    { latitude: 0, longitude: 1 },
    { latitude: 2, longitude: 1 },
  ]);
});
