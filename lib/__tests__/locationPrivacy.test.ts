import { describe, expect, it } from "vitest";
import { coarsenCoordinates } from "@/lib/locationPrivacy";

describe("coarsenCoordinates", () => {
  const exact = { lat: 52.5219814, lng: 13.4136358 };

  it("returns the exact coordinate for EXACT precision", () => {
    expect(coarsenCoordinates(exact, "EXACT")).toEqual(exact);
  });

  it("returns the exact coordinate when precision is null", () => {
    expect(coarsenCoordinates(exact, null)).toEqual(exact);
  });

  it("rounds to ~1km grid for POSTAL_CODE (2 decimals)", () => {
    expect(coarsenCoordinates(exact, "POSTAL_CODE")).toEqual({ lat: 52.52, lng: 13.41 });
  });

  it("rounds to ~11km grid for CITY (1 decimal)", () => {
    expect(coarsenCoordinates(exact, "CITY")).toEqual({ lat: 52.5, lng: 13.4 });
  });

  it("snaps nearby exact points in the same cell to the same coarse point", () => {
    const a = coarsenCoordinates({ lat: 52.5219, lng: 13.4132 }, "POSTAL_CODE");
    const b = coarsenCoordinates({ lat: 52.5245, lng: 13.4105 }, "POSTAL_CODE");
    // 52.5219 -> 52.52, 52.5245 -> 52.52; 13.4132 -> 13.41, 13.4105 -> 13.41
    expect(a).toEqual({ lat: 52.52, lng: 13.41 });
    expect(b).toEqual({ lat: 52.52, lng: 13.41 });
  });

  it("does not mutate the input", () => {
    const input = { lat: 52.5219814, lng: 13.4136358 };
    coarsenCoordinates(input, "CITY");
    expect(input).toEqual({ lat: 52.5219814, lng: 13.4136358 });
  });
});
