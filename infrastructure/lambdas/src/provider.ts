import {
  GetParameterCommand,
  SSMClient,
  type GetParameterCommandOutput,
} from "@aws-sdk/client-ssm";
import type { RouteRequest } from "@route-runner/contracts";
import { ServiceError, type Candidate, type Provider } from "./routing.js";
const parameters = new SSMClient({});
type ParameterSender = (
  command: GetParameterCommand,
  options: { abortSignal: AbortSignal },
) => Promise<Pick<GetParameterCommandOutput, "Parameter">>;
export function createCredentialLoader(
  send: ParameterSender = (command, options) =>
    parameters.send(command, options),
  name: () => string | undefined = () => process.env.ROUTING_PARAMETER_NAME,
  now: () => number = Date.now,
) {
  let cached: { name: string; value: string; expires: number } | undefined;
  return async (signal?: AbortSignal): Promise<string> => {
    signal?.throwIfAborted();
    const parameterName = name();
    if (!parameterName?.trim())
      throw new ServiceError(
        502,
        "SERVICE_CONFIGURATION",
        "Routing service is not configured.",
      );
    if (cached?.name === parameterName && cached.expires > now())
      return cached.value;
    const abortSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(3000)])
      : AbortSignal.timeout(3000);
    try {
      const result = await send(
        new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
        { abortSignal },
      );
      abortSignal.throwIfAborted();
      if (result.Parameter?.Type !== "SecureString") throw Error();
      const value = result.Parameter.Value?.trim();
      if (
        !value ||
        value === "UNCONFIGURED" ||
        /^[{\[\"]/.test(value) ||
        /\s/.test(value)
      )
        throw Error();
      cached = {
        name: parameterName,
        value,
        expires: now() + 300000,
      };
      return cached.value;
    } catch {
      if (signal?.aborted)
        throw new ServiceError(
          504,
          "DEADLINE_EXCEEDED",
          "Route generation took too long.",
        );
      throw new ServiceError(
        502,
        "SERVICE_CONFIGURATION",
        "Routing credential is unavailable.",
      );
    }
  };
}
export const credential = createCredentialLoader();
export class OrsProvider implements Provider {
  constructor(
    private key: (signal?: AbortSignal) => Promise<string> = credential,
    private fetcher: typeof fetch = fetch,
  ) {}
  async generateRoundTrip(
    request: RouteRequest,
    seed: number,
    signal: AbortSignal,
  ): Promise<Candidate> {
    return this.directions(
      {
        coordinates: [[request.start.longitude, request.start.latitude]],
        options: {
          round_trip: {
            length: request.distanceMetres,
            points: 3,
            seed: seed % 2147483647,
          },
        },
      },
      signal,
    );
  }
  async generateGuidedLoop(
    coordinates: [number, number][],
    signal: AbortSignal,
  ): Promise<Candidate> {
    return this.directions({ coordinates }, signal);
  }
  private async directions(
    payload: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<Candidate> {
    const key = await this.key(signal);
    signal.throwIfAborted();
    const response = await this.fetcher(
      "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson",
      {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          elevation: true,
          instructions: false,
        }),
        signal,
      },
    );
    if (!response.ok) {
      const retryHeader = response.headers.get("retry-after");
      const retry =
        retryHeader === null
          ? NaN
          : /^\d+$/.test(retryHeader.trim())
            ? Number(retryHeader)
            : Math.max(
                0,
                Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000),
              );
      throw new ServiceError(
        response.status === 429
          ? 429
          : response.status === 401 || response.status === 403
            ? 503
            : 502,
        response.status === 429
          ? "THROTTLED"
          : response.status === 401 || response.status === 403
            ? "PROVIDER_AUTH"
            : response.status < 500
              ? "UPSTREAM_REJECTED"
              : "UPSTREAM_FAILURE",
        response.status === 429
          ? "The routing service is busy. Please try again shortly."
          : "The routing provider could not complete this request.",
        Number.isFinite(retry) && retry >= 0 ? retry : undefined,
      );
    }
    let body: any;
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      let size = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 8000000) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(part.value);
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ServiceError(
        502,
        "UPSTREAM_INVALID",
        "The routing provider returned an unusable response.",
      );
    }
    const feature = body?.features?.[0];
    if (feature?.geometry?.type !== "LineString")
      throw new ServiceError(
        502,
        "UPSTREAM_INVALID",
        "The routing provider returned an unusable response.",
      );
    return {
      coordinates: feature.geometry.coordinates,
      distance: feature.properties?.summary?.distance,
      ascent: feature.properties?.ascent,
      descent: feature.properties?.descent,
      attribution:
        typeof body.metadata?.attribution === "string"
          ? body.metadata.attribution
          : "© openrouteservice | © OpenStreetMap contributors",
    };
  }
}
