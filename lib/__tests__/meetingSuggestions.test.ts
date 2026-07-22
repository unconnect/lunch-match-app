import { describe, expect, it } from "vitest";
import {
  circlesOverlap,
  suggestionsInIntersection,
  DEFAULT_OVERLAP_TOLERANCE_STEPS,
} from "@/lib/meetingSuggestions";
import type { MeetingPoint } from "@/lib/meetingPoints";

// Two origins ~1.4 km apart in Berlin. At this latitude 0.01° lng ≈ 730 m,
// so lng deltas give predictable, roughly east-west distances.
const own = { lat: 52.52, lng: 13.4 };
const cp = { lat: 52.52, lng: 13.42 }; // ~1360 m east of `own`

describe("DEFAULT_OVERLAP_TOLERANCE_STEPS", () => {
  it("is 1000 steps", () => {
    expect(DEFAULT_OVERLAP_TOLERANCE_STEPS).toBe(1000);
  });
});

describe("circlesOverlap", () => {
  it("returns true when the circles clearly overlap", () => {
    // 1000 + 1000 = 2000 m of combined radius vs ~1360 m apart.
    expect(circlesOverlap(own, 1000, cp, 1000, 0)).toBe(true);
  });

  it("returns true when the circles nearly touch (sum ≈ distance)", () => {
    // 680 + 680 = 1360 ≈ distance (~1353-1367 m) → touching counts as overlap (<=).
    expect(circlesOverlap(own, 680, cp, 680, 0)).toBe(true);
  });

  it("returns false when the circles are disjoint", () => {
    expect(circlesOverlap(own, 300, cp, 300, 0)).toBe(false);
  });

  it("becomes true at the tolerance boundary", () => {
    // 300 + 300 = 600 m combined; ~1360 m apart → disjoint without tolerance.
    expect(circlesOverlap(own, 300, cp, 300, 0)).toBe(false);
    // Adding 2 * 400 = 800 m widens combined reach to 1400 m > 1360 → overlap.
    expect(circlesOverlap(own, 300, cp, 300, 400)).toBe(true);
  });
});

describe("suggestionsInIntersection", () => {
  // A point at own+0.01 lng sits ~730 m east of own, ~630 m west of cp.
  const between: MeetingPoint = { id: "mid", name: "Mitte", lat: 52.52, lng: 13.41 };
  // A point at own's location: inside own, but ~1360 m from cp.
  const nearOwn: MeetingPoint = { id: "own", name: "Bei mir", lat: 52.52, lng: 13.4 };

  it("keeps a point inside both widened radii", () => {
    const result = suggestionsInIntersection([between], own, 1000, cp, 1000, 0);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mid");
  });

  it("drops a point inside only one radius", () => {
    // nearOwn is within own's 1000 m but ~1360 m from cp (> 1000 m).
    const result = suggestionsInIntersection([nearOwn], own, 1000, cp, 1000, 0);
    expect(result).toHaveLength(0);
  });

  it("annotates each suggestion with both distances", () => {
    const [s] = suggestionsInIntersection([between], own, 1000, cp, 1000, 0);
    expect(s.distanceOwnMeters).toBeGreaterThan(600);
    expect(s.distanceOwnMeters).toBeLessThan(850);
    expect(s.distanceCounterpartMeters).toBeGreaterThan(500);
    expect(s.distanceCounterpartMeters).toBeLessThan(750);
  });

  it("ranks by max(distOwn, distCp) ascending", () => {
    const balanced: MeetingPoint = { id: "balanced", name: "Ausgewogen", lat: 52.52, lng: 13.41 };
    const lopsided: MeetingPoint = { id: "lopsided", name: "Schief", lat: 52.52, lng: 13.406 };
    const result = suggestionsInIntersection([lopsided, balanced], own, 1000, cp, 1000, 0);
    // balanced is roughly equidistant (max ~677); lopsided is close to own but
    // far from cp (max ~947, still within cp's 1000 m radius) → balanced ranks
    // first.
    expect(result.map((s) => s.id)).toEqual(["balanced", "lopsided"]);
  });

  it("brings in a point that only qualifies once tolerance is raised", () => {
    // nearOwn is ~1360 m from cp; with cpRadius 1000 it fails, but a 400 m
    // tolerance widens cp's reach to 1400 m → it now qualifies.
    const strict = suggestionsInIntersection([nearOwn], own, 2000, cp, 1000, 0);
    expect(strict).toHaveLength(0);
    const loose = suggestionsInIntersection([nearOwn], own, 2000, cp, 1000, 400);
    expect(loose).toHaveLength(1);
  });
});
