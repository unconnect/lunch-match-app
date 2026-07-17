import { describe, expect, it } from "vitest";
import {
  calculateSearchRadiusMeters,
  metersToSteps,
  DEFAULT_SEARCH_RADIUS_METERS,
} from "@/lib/searchRadius";

describe("calculateSearchRadiusMeters", () => {
  it("returns the default radius when no step goal is set", () => {
    expect(calculateSearchRadiusMeters(undefined)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
    expect(calculateSearchRadiusMeters(null)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
  });

  it("returns the default radius when the step goal is zero or negative", () => {
    expect(calculateSearchRadiusMeters(0)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
    expect(calculateSearchRadiusMeters(-100)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
  });

  it("derives the radius from the step goal at 0.73m per step", () => {
    expect(calculateSearchRadiusMeters(1000)).toBe(730);
    expect(calculateSearchRadiusMeters(2000)).toBe(1460);
  });
});

describe("metersToSteps", () => {
  it("converts meters back to an approximate step count", () => {
    expect(metersToSteps(730)).toBe(1000);
    expect(metersToSteps(0)).toBe(0);
  });
});
