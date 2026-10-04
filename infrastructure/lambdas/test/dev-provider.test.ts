import { test } from "node:test";
import assert from "node:assert/strict";
import { developmentProvider } from "../src/dev-provider.js";
import { fixtureProvider } from "../src/fixture.js";
import { OrsProvider } from "../src/provider.js";

test("ordinary development stays synthetic even with configured credentials", () => {
  assert.equal(
    developmentProvider(false, {
      ORS_API_KEY: "test",
      ALLOW_LIVE_PROVIDER: "yes",
    }),
    fixtureProvider,
  );
});
test("live development requires both explicit consent and a key", () => {
  assert.throws(() => developmentProvider(true, { ORS_API_KEY: "test" }));
  assert.throws(() =>
    developmentProvider(true, { ALLOW_LIVE_PROVIDER: "yes" }),
  );
  assert.ok(
    developmentProvider(true, {
      ORS_API_KEY: "test",
      ALLOW_LIVE_PROVIDER: "yes",
    }) instanceof OrsProvider,
  );
});
