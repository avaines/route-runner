import { useEffect, useRef, useState } from "react";
import type { Route, RouteRequest } from "@route-runner/contracts";
type Start = RouteRequest["start"];
let loading: Promise<void> | undefined;
function loadMaps(key: string) {
  if (window.google?.maps) return Promise.resolve();
  if (!loading)
    loading = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              "Satellite imagery timed out. Use Enter coordinates to set your start.",
            ),
          ),
        15000,
      );
      (window as unknown as Record<string, unknown>).routeRunnerMapReady =
        () => {
          clearTimeout(timeout);
          resolve();
        };
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=quarterly&loading=async&callback=routeRunnerMapReady`;
      script.async = true;
      script.onerror = () =>
        reject(
          new Error(
            "Satellite imagery could not load. Use Enter coordinates to set your start.",
          ),
        );
      document.head.append(script);
    });
  return loading;
}
export function kilometreMarkers(route: Route) {
  const points = route.geometry.coordinates;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1], points[i]],
      r = Math.PI / 180;
    const h =
      Math.sin(((b[1] - a[1]) * r) / 2) ** 2 +
      Math.cos(a[1] * r) *
        Math.cos(b[1] * r) *
        Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    lengths.push(
      lengths[i - 1] + 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)),
    );
  }
  const total = lengths[lengths.length - 1];
  if (!total) return [];
  const result: { lat: number; lng: number; label: string }[] = [];
  let i = 1;
  for (let km = 1; km * 1000 < route.distanceMetres; km++) {
    const target = ((km * 1000) / route.distanceMetres) * total;
    while (i < lengths.length - 1 && lengths[i] < target) i++;
    const f = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1] || 1);
    result.push({
      lat: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f,
      lng: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
      label: String(km),
    });
  }
  return result;
}
export default function MapView({
  start,
  onStart,
  routes,
  selected,
  onSelect,
}: {
  start: Start;
  onStart: (s: Start) => void;
  routes: Route[];
  selected?: string;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<google.maps.Map | null>(null),
    handlers = useRef({ onStart, onSelect });
  handlers.current = { onStart, onSelect };
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  useEffect(() => {
    if (!key) return;
    let active = true;
    loadMaps(key)
      .then(() => {
        if (!active || !container.current) return;
        map.current = new google.maps.Map(container.current, {
          center: { lat: start.latitude, lng: start.longitude },
          zoom: 14,
          mapTypeId: "hybrid",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: "cooperative",
        });
        map.current.addListener("click", (event: google.maps.MapMouseEvent) => {
          if (event.latLng)
            handlers.current.onStart({
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            });
        });
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (
      !ready ||
      !map.current ||
      !Number.isFinite(start.latitude) ||
      !Number.isFinite(start.longitude)
    )
      return;
    const m = map.current;
    const startMarker = new google.maps.Marker({
      map: m,
      position: { lat: start.latitude, lng: start.longitude },
      draggable: true,
      title: "Start and finish — drag to move",
      label: "S",
    });
    startMarker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
      if (event.latLng)
        handlers.current.onStart({
          latitude: event.latLng.lat(),
          longitude: event.latLng.lng(),
        });
    });
    const lines = routes.map((route) => {
      const line = new google.maps.Polyline({
        map: m,
        path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        strokeColor: route.id === selected ? "#dafd6e" : "#ffffff",
        strokeOpacity: route.id === selected ? 1 : 0.6,
        strokeWeight: route.id === selected ? 6 : 3,
        zIndex: route.id === selected ? 2 : 1,
      });
      line.addListener("click", () => handlers.current.onSelect(route.id));
      return line;
    });
    const route = routes.find((r) => r.id === selected);
    const markers = route
      ? kilometreMarkers(route).map(
          (p) =>
            new google.maps.Marker({
              map: m,
              position: p,
              label: p.label,
              title: `Approximately ${p.label} km`,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: "#ffffff",
                fillOpacity: 1,
                strokeColor: "#183d33",
                strokeWeight: 2,
              },
            }),
        )
      : [];
    if (route) {
      const bounds = new google.maps.LatLngBounds();
      route.geometry.coordinates.forEach(([lng, lat]) =>
        bounds.extend({ lat, lng }),
      );
      bounds.extend({ lat: start.latitude, lng: start.longitude });
      m.fitBounds(bounds, 50);
    } else m.panTo({ lat: start.latitude, lng: start.longitude });
    return () => {
      startMarker.setMap(null);
      lines.forEach((l) => l.setMap(null));
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [ready, start, routes, selected]);
  const preview = routes.find((r) => r.id === selected);
  const coords = preview?.geometry.coordinates || [];
  const minLng = Math.min(...coords.map((p) => p[0])),
    maxLng = Math.max(...coords.map((p) => p[0])),
    minLat = Math.min(...coords.map((p) => p[1])),
    maxLat = Math.max(...coords.map((p) => p[1]));
  const project = (lng: number, lat: number) =>
    `${30 + ((lng - minLng) / (maxLng - minLng || 1)) * 540},${270 - ((lat - minLat) / (maxLat - minLat || 1)) * 240}`;
  return (
    <section className="map" aria-label="Route map">
      <div ref={container} className="map-canvas" />
      {(!key || error) && (
        <div className="map-placeholder">
          <div className="contours" aria-hidden="true">
            ◎
          </div>
          {preview && (
            <svg
              className="schematic"
              viewBox="0 0 600 300"
              role="img"
              aria-label="Schematic route preview, not a geographic map"
            >
              <polyline
                points={coords.map((p) => project(p[0], p[1])).join(" ")}
                fill="none"
                stroke="#41673b"
                strokeWidth="5"
              />
              {kilometreMarkers(preview).map((p) => (
                <text
                  key={p.label}
                  x={project(p.lng, p.lat).split(",")[0]}
                  y={project(p.lng, p.lat).split(",")[1]}
                  fill="#183d33"
                  fontSize="14"
                >
                  {p.label} km
                </text>
              ))}
            </svg>
          )}
          <span className="eyebrow">YOUR NEXT ADVENTURE</span>
          {!preview && (
            <h2>
              A new loop.
              <br />A fresh perspective.
            </h2>
          )}
          <p>
            {preview
              ? "Schematic preview only · Satellite map unavailable"
              : error ||
                "Satellite map is not configured. Use Enter coordinates to set your start; route generation remains available."}
          </p>
        </div>
      )}
      <div className="map-caption">
        {key && !error
          ? "Satellite · Tap the map to place your start"
          : "Map preview unavailable"}
        <span>Roads & paths</span>
      </div>
    </section>
  );
}
