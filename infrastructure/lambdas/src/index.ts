import { randomUUID } from "node:crypto";
import { LIMITS, parseRouteRequest } from "@route-runner/contracts";
import { defaults, generate, ServiceError, type Provider } from "./routing.js";
import { OrsProvider } from "./provider.js";
interface Event {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}
function config() {
  const c = { ...defaults, weights: { ...defaults.weights } };
  const names = {
    ROUTE_CANDIDATES: "candidates",
    PROVIDER_CONCURRENCY: "concurrency",
    MAX_PROVIDER_ATTEMPTS: "maxAttempts",
    REQUEST_DEADLINE_MS: "deadlineMs",
  } as const;
  for (const [env, key] of Object.entries(names)) {
    if (process.env[env]) {
      const n = Number(process.env[env]);
      if (
        !Number.isInteger(n) ||
        n < 1 ||
        n >
          { candidates: 8, concurrency: 2, maxAttempts: 16, deadlineMs: 20000 }[
            key
          ]
      )
        throw new ServiceError(
          502,
          "SERVICE_CONFIGURATION",
          "Routing configuration is invalid.",
        );
      c[key] = n;
    }
  }
  // One explicit calibration object keeps tunable policy separate from provider options.
  if (process.env.ROUTE_CALIBRATION_JSON) {
    try {
      const values: unknown = JSON.parse(process.env.ROUTE_CALIBRATION_JSON);
      if (!values || typeof values !== "object" || Array.isArray(values))
        throw Error();
      for (const [key, value] of Object.entries(values)) {
        if (key === "weights") {
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw Error();
          for (const [weight, number] of Object.entries(value)) {
            if (
              !(weight in c.weights) ||
              typeof number !== "number" ||
              !Number.isFinite(number) ||
              number < 0 ||
              number > 1000
            )
              throw Error();
            c.weights[weight as keyof typeof c.weights] = number;
          }
        } else {
          if (
            ![
              "snapMetres",
              "preferredError",
              "maxError",
              "repeatedSoft",
              "repeatedMax",
              "duplicateOverlap",
            ].includes(key) ||
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value <= 0 ||
            value > (key === "snapMetres" ? 100 : 1)
          )
            throw Error();
          (c as unknown as Record<string, unknown>)[key] = value;
        }
      }
      if (c.preferredError > c.maxError || c.repeatedSoft > c.repeatedMax)
        throw Error();
    } catch {
      throw new ServiceError(
        502,
        "SERVICE_CONFIGURATION",
        "Routing calibration is invalid.",
      );
    }
  }
  return c;
}
export function createHandler(provider: Provider = new OrsProvider()) {
  return async (event: Event) => {
    const requestId = randomUUID(),
      headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      respond = (statusCode: number, value: unknown) => ({
        statusCode,
        headers,
        body: JSON.stringify(value),
      });
    try {
      const method = event.requestContext?.http?.method,
        path = event.rawPath;
      if (path === "/api/health" && (method === "GET" || method === "HEAD"))
        return {
          statusCode: 200,
          headers,
          body: method === "HEAD" ? "" : JSON.stringify({ status: "ok" }),
        };
      if (path !== "/api/routes")
        return respond(404, {
          error: {
            code: "NOT_FOUND",
            message: "Endpoint not found.",
            requestId,
          },
        });
      if (method !== "POST") {
        headers.Allow = "POST";
        throw new ServiceError(
          405,
          "METHOD_NOT_ALLOWED",
          "Use POST to generate routes.",
        );
      }
      const normalized = Object.fromEntries(
        Object.entries(event.headers ?? {}).map(([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      );
      if (
        !/^application\/json(?:\s*;|$)/i.test(normalized["content-type"] ?? "")
      )
        throw new ServiceError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Send an application/json request.",
        );
      if ((event.body?.length ?? 0) > LIMITS.maxBodyBytes * 2)
        throw new ServiceError(
          413,
          "BODY_TOO_LARGE",
          "Request body is too large.",
        );
      const body = Buffer.from(
        event.body ?? "",
        event.isBase64Encoded ? "base64" : "utf8",
      );
      if (body.length > LIMITS.maxBodyBytes)
        throw new ServiceError(
          413,
          "BODY_TOO_LARGE",
          "Request body is too large.",
        );
      let request;
      try {
        request = parseRouteRequest(JSON.parse(body.toString("utf8")));
      } catch (e) {
        throw new ServiceError(
          400,
          "INVALID_REQUEST",
          e instanceof SyntaxError
            ? "Request must contain valid JSON."
            : (e as Error).message,
        );
      }
      return respond(
        200,
        await generate(request, provider, requestId, config()),
      );
    } catch (e) {
      const error =
        e instanceof ServiceError
          ? e
          : new ServiceError(
              502,
              "UPSTREAM_FAILURE",
              "Route generation is temporarily unavailable.",
            );
      if (error.retryAfter) headers["Retry-After"] = String(error.retryAfter);
      return respond(error.status === 503 ? 502 : error.status, {
        error: { code: error.code, message: error.message, requestId },
      });
    }
  };
}
export const handler = createHandler();
