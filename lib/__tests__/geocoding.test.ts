// lib/__tests__/geocoding.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress, __resetThrottleForTests } from "@/lib/geocoding";

describe("geocodeAddress", () => {
  beforeEach(() => {
    // The throttle's "last request" timestamp is module-level state shared
    // across every test in this file. Without resetting it, each test after
    // the first would inherit a recent timestamp and genuinely block on the
    // real ~1s Nominatim throttle. Reset before each test so tests stay fast
    // and independent of execution order.
    __resetThrottleForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns coordinates parsed from the Nominatim response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "52.5200066", lon: "13.4049540" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodeAddress("Alexanderplatz, Berlin");

    expect(result).toEqual({ lat: 52.5200066, lng: 13.404954 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("nominatim.openstreetmap.org/search"),
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": expect.any(String) }) })
    );
  });

  it("returns null when there are no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );

    expect(await geocodeAddress("nonexistent place xyz")).toBeNull();
  });

  it("returns null when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));

    expect(await geocodeAddress("Berlin")).toBeNull();
  });

  it("returns null when fetch rejects with a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    expect(await geocodeAddress("Berlin")).toBeNull();
  });

  it("returns null when the response has non-numeric coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: "not-a-number", lon: "13.4" }],
      })
    );

    expect(await geocodeAddress("Berlin")).toBeNull();
  });

  it("throttles requests to at most 1 per second", async () => {
    // Use a fresh module instance so this test's rate-limit state isn't
    // polluted by (or doesn't pollute) the other tests in this file.
    vi.resetModules();
    vi.useFakeTimers();

    try {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ lat: "52.5", lon: "13.4" }],
      });
      vi.stubGlobal("fetch", fetchMock);

      const { geocodeAddress: freshGeocodeAddress } = await import("@/lib/geocoding");

      const first = freshGeocodeAddress("first query");
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const second = freshGeocodeAddress("second query");
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await Promise.all([first, second]);
    } finally {
      vi.useRealTimers();
      vi.resetModules();
    }
  });
});
