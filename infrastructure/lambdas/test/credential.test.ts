import { test } from "node:test";
import assert from "node:assert/strict";
import { createCredentialLoader } from "../src/provider.js";
import { ServiceError } from "../src/routing.js";

test("SSM decrypts SecureString and caches until five-minute refresh", async () => {
  let clock = 1000,
    calls = 0;
  const loader = createCredentialLoader(
    async (command, options) => {
      calls++;
      assert.deepEqual(command.input, {
        Name: "/route-runner/dev/routing",
        WithDecryption: true,
      });
      assert.ok(options.abortSignal instanceof AbortSignal);
      return {
        Parameter: {
          Type: "SecureString",
          Value: calls === 1 ? " first-key\n" : "rotated-key",
        },
      };
    },
    () => "/route-runner/dev/routing",
    () => clock,
  );
  assert.equal(await loader(), "first-key");
  clock += 299999;
  assert.equal(await loader(), "first-key");
  assert.equal(calls, 1);
  clock++;
  assert.equal(await loader(), "rotated-key");
  assert.equal(calls, 2);
});
test("SSM parameter name changes invalidate cached credentials", async () => {
  let name = "/first",
    calls = 0;
  const loader = createCredentialLoader(
    async () => ({
      Parameter: { Type: "SecureString", Value: String(++calls) },
    }),
    () => name,
  );
  assert.equal(await loader(), "1");
  name = "/second";
  assert.equal(await loader(), "2");
});
test("missing name never calls SSM", async () => {
  const loader = createCredentialLoader(
    async () => {
      throw Error("must not call");
    },
    () => undefined,
  );
  await assert.rejects(
    loader(),
    (e: unknown) =>
      e instanceof ServiceError && e.code === "SERVICE_CONFIGURATION",
  );
});
test("missing, plaintext and malformed credential values fail closed", async () => {
  for (const Parameter of [
    undefined,
    { Type: "String" as const, Value: "private" },
    { Type: "SecureString" as const, Value: "" },
    { Type: "SecureString" as const, Value: "UNCONFIGURED" },
    { Type: "SecureString" as const, Value: "   " },
    { Type: "SecureString" as const, Value: '{"apiKey":"old-format"}' },
    { Type: "SecureString" as const, Value: "key\nwith-newline" },
    { Type: "SecureString" as const, Value: '{"apiKey":42}' },
    { Type: "SecureString" as const, Value: "{invalid" },
  ]) {
    const loader = createCredentialLoader(
      async () => ({ Parameter }),
      () => "/configured",
    );
    await assert.rejects(
      loader(),
      (e: unknown) =>
        e instanceof ServiceError &&
        e.message === "Routing credential is unavailable.",
    );
  }
});
test("SSM failures are sanitised and do not serve expired cached values", async () => {
  let clock = 0,
    calls = 0;
  const loader = createCredentialLoader(
    async () => {
      if (++calls > 1) throw Error("AccessDenied: private value and ARN");
      return { Parameter: { Type: "SecureString", Value: "cached" } };
    },
    () => "/configured",
    () => clock,
  );
  assert.equal(await loader(), "cached");
  clock = 300000;
  await assert.rejects(
    loader(),
    (e: unknown) =>
      e instanceof ServiceError &&
      e.message === "Routing credential is unavailable." &&
      !e.message.includes("private"),
  );
});
test("SSM lookup honors request cancellation", async () => {
  const controller = new AbortController();
  const loader = createCredentialLoader(
    async (_command, { abortSignal }) =>
      new Promise((_, reject) =>
        abortSignal.addEventListener(
          "abort",
          () => reject(Error("private upstream detail")),
          { once: true },
        ),
      ),
    () => "/configured",
  );
  const pending = loader(controller.signal);
  controller.abort();
  await assert.rejects(
    pending,
    (e: unknown) => e instanceof ServiceError && e.status === 504,
  );
});
