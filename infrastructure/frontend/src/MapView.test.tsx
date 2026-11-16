import { act, render, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import MapView from "./MapView";
import { fixtureResponse } from "./fixtures";

test("map mode, route clicks and bounded editing handles emit waypoint changes", async () => {
  type Listener = (...args: any[]) => void;
  const lines: Overlay[] = [],
    markers: Overlay[] = [];
  class Overlay {
    listeners: Record<string, Listener> = {};
    pathListeners: Record<string, Listener> = {};
    constructor(public options: any) {}
    addListener(name: string, listener: Listener) {
      this.listeners[name] = listener;
    }
    setMap() {}
    getPath() {
      return {
        addListener: (name: string, listener: Listener) => {
          this.pathListeners[name] = listener;
        },
        getAt: () => ({ lat: () => 53.81, lng: () => -1.54 }),
      };
    }
  }
  let map!: Overlay;
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
  vi.stubGlobal("google", {
    maps: {
      Map: class extends Overlay {
        constructor(...args: any[]) {
          super(args[1]);
          map = this;
        }
        fitBounds() {}
        panTo() {}
      },
      Polyline: class extends Overlay {
        constructor(options: any) {
          super(options);
          lines.push(this);
        }
      },
      Marker: class extends Overlay {
        constructor(options: any) {
          super(options);
          markers.push(this);
        }
      },
      LatLngBounds: class {
        extend() {}
      },
      SymbolPath: { CIRCLE: 0 },
    },
  });
  const request = {
    start: { latitude: 53.8008, longitude: -1.5491 },
    distanceMetres: 5000,
    hillPreference: "balanced" as const,
    seed: 1,
  };
  const route = fixtureResponse(request).routes[0];
  const onAdd = vi.fn(),
    onStart = vi.fn(),
    onMove = vi.fn();
  const props = {
    start: request.start,
    onStart,
    routes: [route],
    selected: route.id,
    onSelect: vi.fn(),
    waypoints: [request.start],
    addingWaypoint: true,
    onAddWaypoint: onAdd,
    onMoveWaypoint: onMove,
    busy: false,
  };
  const view = render(<MapView {...props} />);
  await waitFor(() => expect(lines.length).toBeGreaterThan(0));
  const event = { latLng: { lat: () => 53.81, lng: () => -1.54 } };
  map.listeners.click(event);
  expect(onAdd).toHaveBeenCalledWith({ latitude: 53.81, longitude: -1.54 });
  expect(onStart).not.toHaveBeenCalled();
  const full = lines.find((line) => line.options.strokeOpacity === 1)!;
  expect(full.options.editable).not.toBe(true);
  full.listeners.click(event);
  const guide = lines.find((line) => line.options.editable)!;
  expect(guide.options.path).toHaveLength(5);
  vi.useFakeTimers();
  guide.pathListeners.insert_at(1);
  guide.pathListeners.set_at(1);
  guide.pathListeners.set_at(1);
  expect(onAdd).toHaveBeenCalledTimes(2);
  act(() => vi.advanceTimersByTime(250));
  expect(onAdd).toHaveBeenCalledTimes(3);
  markers
    .find((marker) => marker.options.title?.startsWith("Run via"))!
    .listeners.dragend(event);
  expect(onMove).toHaveBeenCalledWith(0, { latitude: 53.81, longitude: -1.54 });
  guide.pathListeners.set_at(1);
  view.unmount();
  act(() => vi.advanceTimersByTime(250));
  expect(onAdd).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
