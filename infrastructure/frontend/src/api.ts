import {
  parseRouteRequest,
  parseRouteResponse,
  type RouteRequest,
  type RouteResponse,
} from "@route-runner/contracts";
export async function generateRoutes(
  request: RouteRequest,
  signal: AbortSignal,
): Promise<RouteResponse> {
  parseRouteRequest(request);
  if (import.meta.env.VITE_MOCK_API === "true")
    return (await import("./fixtures")).fixtureResponse(request);
  const bytes = new TextEncoder().encode(JSON.stringify(request));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const response = await fetch("/api/routes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-amz-content-sha256": hash,
    },
    body: bytes,
    signal,
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The route service returned an unreadable response. Please try again.",
    );
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: "Check your start and distance, then try again.",
      422: "No suitable loop found. Try a different distance or start.",
      429: "The route service is busy. Please wait before trying again.",
      502: "The routing provider is unavailable. Please try again shortly.",
      504: "Finding a route took too long. Please try again.",
    };
    throw new Error(
      messages[response.status] ||
        "We could not generate a route. Please try again.",
    );
  }
  try {
    return parseRouteResponse(data);
  } catch {
    throw new Error(
      "The route service returned incomplete route data. Please try again.",
    );
  }
}
