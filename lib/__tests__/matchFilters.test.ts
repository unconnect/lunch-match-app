import { describe, expect, it } from "vitest";
import { Karrierelevel } from "@prisma/client";
import { filterCandidates, type Candidate } from "@/lib/matchFilters";

const origin = { lat: 52.52, lng: 13.405 };

const nearVisible: Candidate = {
  id: "near-visible",
  alias: "Nahe Person",
  lat: 52.5205,
  lng: 13.4055,
  branche: "IT",
  brancheVisible: true,
  position: "Entwicklerin",
  karrierelevel: Karrierelevel.ANGESTELLT,
};

const farAway: Candidate = {
  id: "far-away",
  alias: "Ferne Person",
  lat: 53.0,
  lng: 14.0,
  branche: "IT",
  brancheVisible: true,
  position: "Entwicklerin",
  karrierelevel: Karrierelevel.ANGESTELLT,
};

const nearHiddenBranche: Candidate = {
  id: "near-hidden-branche",
  alias: "Verdeckte Person",
  lat: 52.5206,
  lng: 13.4051,
  branche: "IT",
  brancheVisible: false,
  position: "Managerin",
  karrierelevel: Karrierelevel.LEITEND,
};

describe("filterCandidates", () => {
  it("excludes candidates outside the radius", () => {
    const result = filterCandidates([nearVisible, farAway], origin, 1000);
    expect(result.map((c) => c.id)).toEqual(["near-visible"]);
  });

  it("includes distanceMeters on each result", () => {
    const result = filterCandidates([nearVisible], origin, 1000);
    expect(result[0].distanceMeters).toBeGreaterThanOrEqual(0);
    expect(result[0].distanceMeters).toBeLessThan(1000);
  });

  it("excludes a branche match when brancheVisible is false", () => {
    const result = filterCandidates([nearHiddenBranche], origin, 1000, { branche: "IT" });
    expect(result).toEqual([]);
  });

  it("filters by karrierelevel", () => {
    const result = filterCandidates([nearVisible, nearHiddenBranche], origin, 1000, {
      karrierelevel: Karrierelevel.LEITEND,
    });
    expect(result.map((c) => c.id)).toEqual(["near-hidden-branche"]);
  });

  it("returns an empty list when there are no candidates", () => {
    expect(filterCandidates([], origin, 1000)).toEqual([]);
  });
});
