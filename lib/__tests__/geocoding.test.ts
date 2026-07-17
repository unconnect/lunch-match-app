// lib/__tests__/geocoding.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "@/lib/geocoding";

describe("geocodeAddress", () => {
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
});
