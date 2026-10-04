import { vi, test, expect } from "vitest";
import { generateRoutes } from "./api";
import { fixtureResponse } from "./fixtures";
import { webcrypto } from "node:crypto";
test("sends precisely the UTF-8 bytes whose SHA256 digest is in the header", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const request = {
    start: { latitude: 53.8008, longitude: -1.5491 },
    distanceMetres: 5000,
    hillPreference: "balanced" as const,
    seed: 1,
  };
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => fixtureResponse(request),
  });
  vi.stubGlobal("fetch", fetcher);
  await generateRoutes(request, new AbortController().signal);
  const options = fetcher.mock.calls[0][1];
  expect(new TextDecoder().decode(options.body)).toBe(JSON.stringify(request));
  const digest = await webcrypto.subtle.digest("SHA-256", options.body);
  const expected = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  expect(options.headers["x-amz-content-sha256"]).toBe(expected);
  vi.unstubAllGlobals();
});
