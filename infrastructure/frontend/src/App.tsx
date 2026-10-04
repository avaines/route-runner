import { useRef, useState } from "react";
import {
  LIMITS,
  validateRouteRequest,
  type RouteRequest,
  type RouteResponse,
  type HillPreference,
} from "@route-runner/contracts";
import { generateRoutes } from "./api";
import MapView from "./MapView";
import Profile from "./Profile";
import { readFavourites, writeFavourites, type Favourite } from "./favourites";
const defaultStart = { latitude: 53.8008, longitude: -1.5491 };
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
export default function App() {
  const [start, setStart] = useState(defaultStart),
    [distance, setDistance] = useState("5"),
    [custom, setCustom] = useState("7"),
    [hill, setHill] = useState<HillPreference>("balanced");
  const [response, setResponse] = useState<RouteResponse>(),
    [successRequest, setSuccessRequest] = useState<RouteRequest>(),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [locationStatus, setLocationStatus] = useState("");
  const [saved, setSaved] = useState(readFavourites),
    [showSaved, setShowSaved] = useState(false),
    [notice, setNotice] = useState("");
  const revision = useRef(0),
    active = useRef<AbortController | null>(null),
    locationRevision = useRef(0);
  const change = () => {
    revision.current++;
    active.current?.abort();
    setBusy(false);
    setError("");
  };
  const moveStart = (s: typeof start) => {
    change();
    locationRevision.current++;
    setStart(s);
  };
  async function generate(override?: RouteRequest) {
    if (busy) return;
    const request = override || {
      start,
      distanceMetres: Math.round(
        Number(distance === "custom" ? custom : distance) * 1000,
      ),
      hillPreference: hill,
      seed: newSeed(),
    };
    const valid = validateRouteRequest(request);
    if (!valid.success) {
      setError(
        `Choose a valid start and a distance between ${LIMITS.minDistanceMetres / 1000} and ${LIMITS.maxDistanceMetres / 1000} km.`,
      );
      return;
    }
    const current = ++revision.current;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await generateRoutes(request, controller.signal);
      if (current !== revision.current) return;
      setResponse(result);
      setSuccessRequest(request);
      setSelected(result.routes[0]?.id || "");
      setShowSaved(false);
      if (!result.routes.length)
        setError(
          "No suitable loops found. Try another distance or starting point.",
        );
    } catch (e) {
      if (current === revision.current)
        setError(
          controller.signal.aborted
            ? "Finding a route took too long. Please try again."
            : e instanceof Error
              ? e.message
              : "Could not generate routes.",
        );
    } finally {
      clearTimeout(timer);
      if (current === revision.current) setBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationStatus(
        "Location is unavailable. Place a pin on the map or enter coordinates.",
      );
      return;
    }
    const current = ++locationRevision.current;
    setLocationStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (current !== locationRevision.current) return;
        moveStart({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("Start updated to your location.");
      },
      () => {
        if (current === locationRevision.current)
          setLocationStatus(
            "Location access was denied or unavailable. Place a pin on the map or enter coordinates.",
          );
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }
  const route = response?.routes.find((r) => r.id === selected);
  function persist(items: Favourite[]) {
    try {
      writeFavourites(items);
      setSaved({ items, notice: "" });
      setNotice("Saved routes updated.");
    } catch {
      setNotice(
        "Could not save routes. Browser storage may be full or unavailable.",
      );
    }
  }
  function save() {
    if (!response || !successRequest || !route) return;
    persist([
      ...saved.items,
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        request: successRequest,
        response: { ...response, routes: [route] },
        routeId: route.id,
      },
    ]);
  }
  function open(item: Favourite) {
    change();
    locationRevision.current++;
    setResponse(item.response);
    setSuccessRequest(item.request);
    setSelected(item.routeId);
    setStart(item.request.start);
    setDistance("custom");
    setCustom(String(item.request.distanceMetres / 1000));
    setHill(item.request.hillPreference);
    setShowSaved(false);
    setNotice(
      `Saved ${new Date(item.createdAt).toLocaleDateString()}. Paths may have changed. Regenerate before running.`,
    );
  }
  return (
    <>
      <header>
        <a href="#" className="brand">
          <span aria-hidden="true">↗</span> route runner
          <span className="brand-dot">.</span>
        </a>
        <button
          className="saved-toggle"
          onClick={() => setShowSaved(!showSaved)}
        >
          ♡ Saved routes <span>{saved.items.length}</span>
        </button>
      </header>
      <main>
        <div className="intro">
          <span className="eyebrow">A LITTLE FURTHER. SOMEWHERE NEW.</span>
          <h1>Find your next loop.</h1>
          <p>Your distance. Your kind of hills. A different way home.</p>
        </div>
        <div className="planner">
          <aside className="controls">
            <div className="section-heading">
              <h2>Make it your run</h2>
              <span className="step">01 / PLAN</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
            >
              <fieldset>
                <legend>Start & finish</legend>
                <button type="button" className="location" onClick={locate}>
                  ⌖ Use my location
                </button>
                <p className="hint">Or tap the map to drop a pin.</p>
                <details>
                  <summary>Enter coordinates</summary>
                  <div className="coordinates">
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={
                          Number.isFinite(start.latitude) ? start.latitude : ""
                        }
                        onChange={(e) =>
                          moveStart({
                            ...start,
                            latitude: e.target.valueAsNumber,
                          })
                        }
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={
                          Number.isFinite(start.longitude)
                            ? start.longitude
                            : ""
                        }
                        onChange={(e) =>
                          moveStart({
                            ...start,
                            longitude: e.target.valueAsNumber,
                          })
                        }
                      />
                    </label>
                  </div>
                </details>
                <p className="hint" role="status">
                  {locationStatus ||
                    `Start: ${Number.isFinite(start.latitude) ? start.latitude.toFixed(4) : "—"}, ${Number.isFinite(start.longitude) ? start.longitude.toFixed(4) : "—"}`}
                </p>
              </fieldset>
              <fieldset>
                <legend>How far?</legend>
                <div className="segments">
                  {["3", "5", "10", "custom"].map((n) => (
                    <button
                      type="button"
                      key={n}
                      aria-pressed={distance === n}
                      onClick={() => {
                        change();
                        setDistance(n);
                      }}
                    >
                      {n === "custom" ? "Custom" : n + " km"}
                    </button>
                  ))}
                </div>
                {distance === "custom" && (
                  <label className="custom">
                    Distance in kilometres
                    <input
                      type="number"
                      min={LIMITS.minDistanceMetres / 1000}
                      max={LIMITS.maxDistanceMetres / 1000}
                      step="0.001"
                      required
                      value={custom}
                      onChange={(e) => {
                        change();
                        setCustom(e.target.value);
                      }}
                    />
                  </label>
                )}
                <p className="hint">
                  Aiming close, not exact. Every loop is a little different.
                </p>
              </fieldset>
              <fieldset>
                <legend>How do you feel about hills?</legend>
                <div className="hill-options">
                  {(
                    [
                      ["flat", "Easy on the hills", "Flattest available"],
                      ["balanced", "A little of everything", "Balanced"],
                      ["hilly", "Bring on the climb", "Hilly"],
                    ] as const
                  ).map(([value, title, subtitle]) => (
                    <label
                      key={value}
                      className={hill === value ? "hill active" : "hill"}
                    >
                      <input
                        type="radio"
                        name="hill"
                        value={value}
                        checked={hill === value}
                        onChange={() => {
                          change();
                          setHill(value);
                        }}
                      />
                      <span>
                        <strong>{title}</strong>
                        <small>{subtitle}</small>
                      </span>
                      <span aria-hidden="true">
                        {value === "flat"
                          ? "~"
                          : value === "balanced"
                            ? "⌁"
                            : "△"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="primary" disabled={busy} type="submit">
                {busy ? "Finding your loops…" : "Find my routes"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
              <p className="hint">
                Mixed roads & paths · Hills are relative to available routes.
              </p>
            </form>
          </aside>
          <div className="explore">
            <MapView
              start={start}
              onStart={moveStart}
              routes={response?.routes || []}
              selected={selected}
              onSelect={setSelected}
            />
            <div aria-live="polite" className="status">
              {busy && (
                <p>Exploring nearby loops. This can take up to 30 seconds.</p>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                  {response
                    ? " Your previous routes are still shown below."
                    : ""}
                </p>
              )}
              {notice && <p>{notice}</p>}
            </div>
            {showSaved ? (
              <section className="results">
                <div className="section-heading">
                  <h2>Your saved loops</h2>
                  {saved.items.length > 0 && (
                    <button onClick={() => persist([])}>Clear all</button>
                  )}
                </div>
                <p>Stored in this browser only. Paths and access may change.</p>
                {saved.notice && <p role="status">{saved.notice}</p>}
                {saved.items.length === 0 && (
                  <p>
                    No saved routes yet. Find a loop you like and save it here.
                  </p>
                )}
                {saved.items.map((item) => (
                  <article className="favourite" key={item.id}>
                    <button onClick={() => open(item)}>
                      {(item.response.routes[0].distanceMetres / 1000).toFixed(
                        2,
                      )}{" "}
                      km loop · {new Date(item.createdAt).toLocaleDateString()}
                    </button>
                    <button
                      aria-label={`Delete saved route from ${new Date(item.createdAt).toLocaleDateString()}`}
                      onClick={() =>
                        persist(saved.items.filter((s) => s.id !== item.id))
                      }
                    >
                      Delete
                    </button>
                  </article>
                ))}
              </section>
            ) : response ? (
              <section className="results">
                <div className="section-heading">
                  <h2>
                    {response.routes.length}{" "}
                    {response.routes.length === 1 ? "way" : "ways"} to make it
                    home
                  </h2>
                  <button disabled={busy} onClick={() => void generate()}>
                    Try different routes ↻
                  </button>
                </div>
                {response.warnings.map((warning, i) => (
                  <p className="warning" key={i}>
                    {warning}
                  </p>
                ))}
                <div className="route-cards">
                  {response.routes.map((r, i) => (
                    <button
                      key={r.id}
                      className={`route-card ${selected === r.id ? "selected" : ""}`}
                      aria-pressed={selected === r.id}
                      onClick={() => setSelected(r.id)}
                    >
                      <span className="eyebrow">
                        LOOP {String(i + 1).padStart(2, "0")}
                      </span>
                      <strong>
                        {(r.distanceMetres / 1000).toFixed(2)} <small>km</small>
                      </strong>
                      <span>
                        {r.ascentMetres === null
                          ? "Elevation unavailable"
                          : `${Math.round(r.ascentMetres)} m ascent`}
                      </span>
                      <small>
                        {Math.abs(r.distanceErrorPercent).toFixed(1)}% from
                        target
                      </small>
                      {r.warnings.map((w, j) => (
                        <small className="warning" key={j}>
                          {w}
                        </small>
                      ))}
                    </button>
                  ))}
                </div>
                {route && (
                  <>
                    <Profile route={route} />
                    {route.roadSummary.length > 0 && (
                      <p>
                        Along the way: {route.roadSummary.join(" · ")}. This is
                        not navigation.
                      </p>
                    )}
                    <button className="save" onClick={save}>
                      ♡ Save this loop
                    </button>
                  </>
                )}
                <p className="attribution">{response.attribution.text}</p>
              </section>
            ) : (
              <section className="empty">
                <span aria-hidden="true">↗</span>
                <h2>A good run starts with a little curiosity.</h2>
                <p>
                  Pick a start, choose your distance, and see where your next
                  loop takes you.
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
      <footer>
        Made for the miles ahead.
        <span>
          Check local access and conditions. Imagery does not establish path
          access or safety.
        </span>
      </footer>
      {import.meta.env.VITE_MOCK_API === "true" && (
        <div className="demo-banner">
          DEMO MODE · Synthetic routes, not suitable for running
        </div>
      )}
    </>
  );
}
