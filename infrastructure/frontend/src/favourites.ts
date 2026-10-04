import {
  parseRouteRequest,
  parseRouteResponse,
  type RouteRequest,
  type RouteResponse,
} from "@route-runner/contracts";
export type Favourite = {
  id: string;
  createdAt: string;
  request: RouteRequest;
  response: RouteResponse;
  routeId: string;
};
const KEY = "route-runner:favourites";
export function readFavourites(): { items: Favourite[]; notice: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { items: [], notice: "" };
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !Array.isArray(saved.items))
      return {
        items: [],
        notice:
          "Saved routes use an unsupported format. They have not been changed.",
      };
    const items: Favourite[] = saved.items.map((item: Favourite) => {
      if (
        typeof item.id !== "string" ||
        !Number.isFinite(Date.parse(item.createdAt)) ||
        typeof item.routeId !== "string"
      )
        throw new Error();
      const request = parseRouteRequest(item.request),
        response = parseRouteResponse(item.response);
      if (!response.routes.some((route) => route.id === item.routeId))
        throw new Error();
      return { ...item, request, response };
    });
    return { items, notice: "" };
  } catch {
    return {
      items: [],
      notice:
        "Saved routes could not be read. Browser storage may be unavailable or damaged.",
    };
  }
}
export function writeFavourites(items: Favourite[]) {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, items }));
}
