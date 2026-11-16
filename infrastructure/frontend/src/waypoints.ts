import type { Route, RouteRequest } from "@route-runner/contracts";
export type Point = RouteRequest["start"];
// Project onto segments, rather than vertices, to avoid jumps on sparsely sampled paths.
export function nearestOnRoute(point: Point, route: Route) {
  const coords = route.geometry.coordinates;
  let best = { point, position: 0, distance: Infinity };
  const scale = Math.cos((point.latitude * Math.PI) / 180);
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [coords[i - 1], coords[i]];
    const dx = (b[0] - a[0]) * scale,
      dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.longitude - a[0]) * scale * dx + (point.latitude - a[1]) * dy) /
          (dx * dx + dy * dy || 1),
      ),
    );
    const projected = {
      longitude: a[0] + (b[0] - a[0]) * t,
      latitude: a[1] + dy * t,
    };
    const distance =
      ((point.longitude - projected.longitude) * scale) ** 2 +
      (point.latitude - projected.latitude) ** 2;
    if (distance < best.distance)
      best = { point: projected, position: i - 1 + t, distance };
  }
  return best;
}
export function insertWaypoint(points: Point[], point: Point, route?: Route) {
  if (!route) return [...points, point];
  const position = nearestOnRoute(point, route).position;
  const index = points.findIndex(
    (existing) => nearestOnRoute(existing, route).position > position,
  );
  const next = [...points];
  next.splice(index < 0 ? next.length : index, 0, point);
  return next;
}
