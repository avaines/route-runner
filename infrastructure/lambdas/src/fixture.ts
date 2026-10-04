import type { Provider } from "./routing.js";
export const fixtureProvider: Provider = {
  async generateRoundTrip(request, seed) {
    const r = request.distanceMetres / (2 * Math.PI),
      angle = ((seed % 360) * Math.PI) / 180,
      lat = request.start.latitude,
      lon = request.start.longitude,
      cos = Math.cos((lat * Math.PI) / 180);
    const coordinates = Array.from({ length: 121 }, (_, i) => {
      const t = (i / 120) * 2 * Math.PI;
      return [
        lon + (r * (Math.cos(t + angle) - Math.cos(angle))) / (111195 * cos),
        lat + (r * (Math.sin(t + angle) - Math.sin(angle))) / 111195,
        100 + 10 * Math.sin(t),
      ];
    });
    return {
      coordinates,
      distance: request.distanceMetres,
      ascent: 20,
      descent: 20,
      attribution: "SYNTHETIC DEMO — not a real running route",
    };
  },
};
