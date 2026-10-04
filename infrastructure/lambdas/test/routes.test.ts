import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRouteRequest, parseRouteResponse } from "@route-runner/contracts";
import { analyse, defaults, generate, ServiceError } from "../src/routing.js";
import { createHandler } from "../src/index.js";
import { fixtureProvider } from "../src/fixture.js";
import { OrsProvider } from "../src/provider.js";
const request = {
  start: { latitude: 53.8, longitude: -1.55 },
  distanceMetres: 5000,
  hillPreference: "flat" as const,
  seed: 1,
};
const signal = new AbortController().signal;
test("strict input bounds and unknown fields", () => {
  assert.equal(parseRouteRequest(request).distanceMetres, 5000);
  for (const invalid of [
    { ...request, extra: 1 },
    { ...request, distanceMetres: 999 },
    { ...request, distanceMetres: 30001 },
    { ...request, seed: -1 },
    { ...request, start: { latitude: NaN, longitude: 1 } },
    { ...request, start: { ...request.start, extra: 1 } },
  ])
    assert.throws(() => parseRouteRequest(invalid));
});
test("handler validates method, media, JSON and byte limits without calling provider", async () => {
  const handler = createHandler({
    async generateRoundTrip() {
      throw Error("must not call");
    },
  });
  for (const [event, status] of [
    [{ requestContext: { http: { method: "GET" } } }, 405],
    [{ requestContext: { http: { method: "POST" } } }, 415],
    [
      {
        requestContext: { http: { method: "POST" } },
        headers: { "content-type": "application/json" },
        body: "{",
      },
      400,
    ],
    [
      {
        requestContext: { http: { method: "POST" } },
        headers: { "content-type": "application/json" },
        body: " ".repeat(8193),
      },
      413,
    ],
  ] as const) {
    const result = await handler({ rawPath: "/api/routes", ...event });
    assert.equal(result.statusCode, status);
    assert.equal(result.headers["Cache-Control"], "no-store");
  }
});
test("distance boundary, closure and malformed provider geometry", async () => {
  const c = await fixtureProvider.generateRoundTrip(request, 1, signal);
  assert.ok(analyse({ ...c, distance: 5500 }, request));
  assert.equal(analyse({ ...c, distance: 5501 }, request), null);
  assert.equal(
    analyse({ ...c, coordinates: c.coordinates.slice(20) }, request),
    null,
  );
  assert.throws(
    () =>
      analyse(
        {
          ...c,
          coordinates: [
            [NaN, 0],
            [0, 0],
            [0, 0],
          ],
        },
        request,
      ),
    ServiceError,
  );
});
test("rejects long retraced out and back", () => {
  const c = {
    coordinates: [
      [-1.55, 53.8],
      [-1.55, 53.822483],
      [-1.55, 53.8],
    ],
    distance: 5000,
    attribution: "test",
  };
  assert.equal(analyse(c, request), null);
});
test("reverse loops are deduplicated and missing elevation is truthful", async () => {
  let count = 0;
  const c = await fixtureProvider.generateRoundTrip(request, 1, signal);
  const result = await generate(
    request,
    {
      async generateRoundTrip() {
        return {
          ...c,
          coordinates:
            ++count % 2
              ? c.coordinates.map((p) => p.slice(0, 2))
              : [...c.coordinates].reverse().map((p) => p.slice(0, 2)),
        };
      },
    },
    "test",
  );
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].ascentMetres, null);
  assert.deepEqual(result.routes[0].elevationProfile, []);
  assert.match(result.warnings.join(" "), /hill preference/);
  parseRouteResponse(result);
});
test("partial results survive throttling and scores remain deterministic", async () => {
  let calls = 0;
  const result = await generate(
    request,
    {
      async generateRoundTrip(r, s, signal) {
        if (++calls % 2) throw new ServiceError(429, "THROTTLED", "Busy", 10);
        return fixtureProvider.generateRoundTrip(r, s, signal);
      },
    },
    "test",
  );
  assert.ok(result.routes.length);
  assert.ok(result.warnings.length);
  const a = await generate(request, fixtureProvider, "a"),
    b = await generate(request, fixtureProvider, "b");
  assert.deepEqual(a.routes, b.routes);
  parseRouteResponse(a);
});
test("deadline cancels calls and returns504", async () => {
  await assert.rejects(
    generate(
      request,
      {
        generateRoundTrip(_r, _s, signal) {
          return new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(Error("abort")), {
              once: true,
            }),
          );
        },
      },
      "test",
      { ...defaults, deadlineMs: 10 },
    ),
    (e: unknown) => e instanceof ServiceError && e.status === 504,
  );
});
test("provider sends pedestrian loop with elevation and sanitises throttling", async () => {
  let payload: any;
  const c = await fixtureProvider.generateRoundTrip(request, 1, signal);
  const provider = new OrsProvider(
    async () => "secret",
    async (_url, init) => {
      payload = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({
          features: [
            {
              geometry: { type: "LineString", coordinates: c.coordinates },
              properties: {
                summary: { distance: 5000 },
                ascent: 20,
                descent: 20,
              },
            },
          ],
        }),
      );
    },
  );
  await provider.generateRoundTrip(request, 1, signal);
  assert.equal(payload.elevation, true);
  assert.equal(payload.options.round_trip.length, 5000);
  const bad = new OrsProvider(
    async () => "secret",
    async () =>
      new Response("private provider error", {
        status: 429,
        headers: { "retry-after": "12" },
      }),
  );
  await assert.rejects(
    bad.generateRoundTrip(request, 1, signal),
    (e: unknown) =>
      e instanceof ServiceError &&
      e.status === 429 &&
      e.retryAfter === 12 &&
      !e.message.includes("private"),
  );
});

test("hill preference changes ranking among distinct loops", async () => {
  const provider = {
    async generateRoundTrip(r: typeof request, seed: number) {
      const c = await fixtureProvider.generateRoundTrip(r, seed, signal);
      return { ...c, ascent: seed === 1 ? 5 : 200 };
    },
  };
  const flat = await generate(request, provider, "flat");
  const hilly = await generate(
    { ...request, hillPreference: "hilly" },
    provider,
    "hilly",
  );
  assert.equal(flat.routes[0].ascentMetres, 5);
  assert.equal(hilly.routes[0].ascentMetres, 200);
});
test("sampling density changes and reversed geometry do not manufacture options", async () => {
  const c = await fixtureProvider.generateRoundTrip(request, 1, signal);
  let calls = 0;
  const dense = c.coordinates.flatMap((p, i) =>
    i === c.coordinates.length - 1
      ? [p]
      : [p, p.map((v, j) => (v + c.coordinates[i + 1][j]) / 2)],
  );
  const result = await generate(
    request,
    {
      async generateRoundTrip() {
        return {
          ...c,
          coordinates: ++calls % 2 ? dense : [...c.coordinates].reverse(),
        };
      },
    },
    "density",
  );
  assert.equal(result.routes.length, 1);
});
test("authentication stops queued work without retry", async () => {
  let calls = 0;
  await assert.rejects(
    generate(
      request,
      {
        async generateRoundTrip() {
          calls++;
          throw new ServiceError(502, "PROVIDER_AUTH", "Unavailable");
        },
      },
      "auth",
    ),
  );
  assert.equal(calls, 2);
});
test("deadline returns even when a substitute provider ignores cancellation", async () => {
  await assert.rejects(
    generate(
      request,
      {
        generateRoundTrip() {
          return new Promise(() => {});
        },
      },
      "deadline",
      { ...defaults, deadlineMs: 5 },
    ),
    (e: unknown) => e instanceof ServiceError && e.status === 504,
  );
});
test("transient failure retries never exceed eight attempts", async () => {
  let calls = 0;
  await assert.rejects(
    generate(
      request,
      {
        async generateRoundTrip() {
          calls++;
          throw new ServiceError(502, "UPSTREAM_FAILURE", "Unavailable");
        },
      },
      "attempts",
    ),
  );
  assert.equal(calls, 8);
});

test("Retry-After on transient failure stops new work and is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    generate(
      request,
      {
        async generateRoundTrip() {
          calls++;
          throw new ServiceError(502, "UPSTREAM_FAILURE", "Wait", 60);
        },
      },
      "retry-after",
    ),
  );
  assert.equal(calls, 2);
});
test("provider parses HTTP-date Retry-After without exposing provider text", async () => {
  const provider = new OrsProvider(
    async () => "secret",
    async () =>
      new Response("private", {
        status: 503,
        headers: { "retry-after": new Date(Date.now() + 60000).toUTCString() },
      }),
  );
  await assert.rejects(
    provider.generateRoundTrip(request, 1, signal),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.retryAfter !== undefined &&
      error.retryAfter >= 59 &&
      error.retryAfter <= 60,
  );
});
test("three distinct known elevation routes exclude more accurate unknown routes", async () => {
  let calls = 0;
  const result = await generate(
    request,
    {
      async generateRoundTrip(r, seed, signal) {
        const c = await fixtureProvider.generateRoundTrip(r, seed, signal);
        return ++calls <= 3
          ? { ...c, distance: 5400 }
          : { ...c, ascent: undefined, descent: undefined };
      },
    },
    "known",
  );
  assert.equal(result.routes.length, 3);
  assert.ok(
    result.routes.every((route) => route.elevationQuality === "available"),
  );
});
test("duplicate known loops do not exclude useful distinct unknown loops", async () => {
  let calls = 0;
  const result = await generate(
    request,
    {
      async generateRoundTrip(r, seed, signal) {
        const known = ++calls <= 3;
        const c = await fixtureProvider.generateRoundTrip(
          r,
          known ? 1 : seed,
          signal,
        );
        return known ? c : { ...c, ascent: undefined, descent: undefined };
      },
    },
    "known-duplicates",
  );
  assert.equal(result.routes.length, 3);
  assert.ok(
    result.routes.some((route) => route.elevationQuality === "unavailable"),
  );
});
