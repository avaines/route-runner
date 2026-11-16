import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, test, expect } from "vitest";
import App from "./App";
import { generateRoutes } from "./api";
import { fixtureResponse } from "./fixtures";
import type { RouteResponse } from "@route-runner/contracts";
vi.mock("./api", () => ({ generateRoutes: vi.fn() }));
const request = {
  start: { latitude: 53.8008, longitude: -1.5491 },
  distanceMetres: 5000,
  hillPreference: "balanced" as const,
  seed: 1,
};
test("denied location keeps manual placement available", async () => {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (_: unknown, fail: () => void) => fail() },
  });
  render(<App />);
  await userEvent.click(
    screen.getByRole("button", { name: /Use my location/ }),
  );
  expect(screen.getByText(/Location access was denied/)).toBeVisible();
  await userEvent.click(screen.getByText("Enter coordinates"));
  expect(screen.getByLabelText("Latitude")).toBeVisible();
});
test("generates custom route, saves and deletes favourite", async () => {
  vi.mocked(generateRoutes).mockImplementation(async (r) => fixtureResponse(r));
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Custom" }));
  await userEvent.clear(screen.getByLabelText("Distance in kilometres"));
  await userEvent.type(screen.getByLabelText("Distance in kilometres"), "7.25");
  await userEvent.click(screen.getByRole("button", { name: /Find my routes/ }));
  expect(await screen.findByText("7.25")).toBeVisible();
  expect(vi.mocked(generateRoutes).mock.calls.at(-1)?.[0].distanceMetres).toBe(
    7250,
  );
  await userEvent.click(screen.getByRole("button", { name: /Save this loop/ }));
  await userEvent.click(screen.getByRole("button", { name: /Saved routes/ }));
  expect(screen.getByText(/7.25 km loop/)).toBeVisible();
  await userEvent.click(
    screen.getByRole("button", { name: /Delete saved route/ }),
  );
  expect(screen.getByText(/No saved routes yet/)).toBeVisible();
});
test("ignores stale response after settings change", async () => {
  let finish!: (r: RouteResponse) => void;
  vi.mocked(generateRoutes).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /Find my routes/ }));
  await userEvent.click(screen.getByRole("button", { name: "10 km" }));
  finish(fixtureResponse(request));
  await waitFor(() =>
    expect(
      screen.queryByText("3 ways to make it home"),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: /Find my routes/ })).toBeEnabled();
});
test("retains previous success on failure", async () => {
  vi.mocked(generateRoutes)
    .mockResolvedValueOnce(fixtureResponse(request))
    .mockRejectedValueOnce(new Error("The route service is busy."));
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /Find my routes/ }));
  await screen.findByText("3 ways to make it home");
  await userEvent.click(
    screen.getByRole("button", { name: /Try different routes/ }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /previous routes are still shown/,
  );
  expect(screen.getByText("5.00")).toBeVisible();
});
test("unsupported favourite schema is explained and preserved", async () => {
  localStorage.setItem(
    "route-runner:favourites",
    JSON.stringify({ version: 99, items: [] }),
  );
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /Saved routes/ }));
  expect(screen.getByText(/unsupported format/)).toBeVisible();
  expect(
    JSON.parse(localStorage.getItem("route-runner:favourites")!).version,
  ).toBe(99);
});

test("run-via coordinates trigger rerouting and removal removes the constraint", async () => {
  vi.mocked(generateRoutes).mockImplementation(async (request) =>
    fixtureResponse(request),
  );
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: /Find my routes/ }));
  await screen.findByText("3 ways to make it home");
  await userEvent.click(screen.getByText("Enter run-via coordinates"));
  await userEvent.type(screen.getByLabelText("Run-via latitude"), "53.81");
  await userEvent.type(screen.getByLabelText("Run-via longitude"), "-1.54");
  await userEvent.click(
    screen.getByRole("button", { name: "Add these coordinates" }),
  );
  await waitFor(() =>
    expect(vi.mocked(generateRoutes).mock.calls.at(-1)?.[0].waypoints).toEqual([
      { latitude: 53.81, longitude: -1.54 },
    ]),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Remove run-via marker 1" }),
  );
  await waitFor(() =>
    expect(
      vi.mocked(generateRoutes).mock.calls.at(-1)?.[0].waypoints,
    ).toBeUndefined(),
  );
});
