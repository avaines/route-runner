import type { Route } from "@route-runner/contracts";
export default function Profile({ route }: { route: Route }) {
  if (
    route.elevationQuality === "unavailable" ||
    !route.elevationProfile.length
  )
    return (
      <div className="profile">
        <h3>Elevation unavailable</h3>
        <p>
          There is no reliable elevation profile for this route. Hill preference
          may not apply.
        </p>
      </div>
    );
  const points = route.elevationProfile,
    min = Math.min(...points.map((p) => p.elevationMetres)),
    max = Math.max(...points.map((p) => p.elevationMetres)),
    distance = points[points.length - 1].distanceMetres || 1;
  const path = points
    .map(
      (p) =>
        `${(p.distanceMetres / distance) * 600},${100 - ((p.elevationMetres - min) / (max - min || 1)) * 80}`,
    )
    .join(" ");
  return (
    <div className="profile">
      <div className="section-heading">
        <h3>The ups and downs</h3>
        <span>
          {Math.round(min)}–{Math.round(max)} m elevation
        </span>
      </div>
      <svg
        viewBox="0 0 600 120"
        role="img"
        aria-label={`Elevation profile, from ${Math.round(min)} to ${Math.round(max)} metres`}
      >
        <polygon points={`0,120 ${path} 600,120`} fill="#e7efd8" />
        <polyline points={path} fill="none" stroke="#527047" strokeWidth="3" />
      </svg>
      <div className="profile-axis">
        <span>Start</span>
        <span>{(route.distanceMetres / 1000).toFixed(2)} km · Finish</span>
      </div>
    </div>
  );
}
