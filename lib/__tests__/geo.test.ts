import { describe, expect, it } from "vitest";
import { haversineDistanceMeters } from "@/lib/geo";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters({ lat: 52.52, lng: 13.405 }, { lat: 52.52, lng: 13.405 })).toBe(0);
  });

  it("returns approximately 111km per degree of longitude at the equator", () => {
    const distance = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(distance).toBeGreaterThan(111000);
    expect(distance).toBeLessThan(111400);
  });

  it("returns approximately 111km per degree of latitude", () => {
    const distance = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(distance).toBeGreaterThan(111000);
    expect(distance).toBeLessThan(111400);
  });
});
