import type { Coordinates } from "@/lib/geo";
import { haversineDistanceMeters } from "@/lib/geo";
import type { MeetingPoint } from "@/lib/meetingPoints";

/**
 * Default extra reach, in steps, added to BOTH participants' radii when
 * looking for meeting points in the overlap of their search circles. A
 * user-adjustable filter on the detail page overrides it. Converted to
 * metres by the caller via STEP_LENGTH_METERS.
 */
export const DEFAULT_OVERLAP_TOLERANCE_STEPS = 1000;

/**
 * Do the two search circles overlap once each is widened by `toleranceMeters`?
 * Touching counts as overlap (<=). Cheap gate so the caller can skip Overpass
 * entirely when there is provably no shared reachable area.
 */
export function circlesOverlap(
  ownOrigin: Coordinates,
  ownRadiusMeters: number,
  cpOrigin: Coordinates,
  cpRadiusMeters: number,
  toleranceMeters: number
): boolean {
  const distance = haversineDistanceMeters(ownOrigin, cpOrigin);
  return distance <= ownRadiusMeters + cpRadiusMeters + 2 * toleranceMeters;
}

export interface SuggestionWithDistances extends MeetingPoint {
  distanceOwnMeters: number;
  distanceCounterpartMeters: number;
}

/**
 * Keep only points that lie inside BOTH widened radii, annotate each with the
 * walking distance to each participant, and rank by the worse of the two
 * distances ascending — the most comfortably reachable for both comes first.
 */
export function suggestionsInIntersection(
  points: MeetingPoint[],
  ownOrigin: Coordinates,
  ownRadiusMeters: number,
  cpOrigin: Coordinates,
  cpRadiusMeters: number,
  toleranceMeters: number
): SuggestionWithDistances[] {
  const ownLimit = ownRadiusMeters + toleranceMeters;
  const cpLimit = cpRadiusMeters + toleranceMeters;

  return points
    .map((point) => ({
      ...point,
      distanceOwnMeters: haversineDistanceMeters(ownOrigin, point),
      distanceCounterpartMeters: haversineDistanceMeters(cpOrigin, point),
    }))
    .filter(
      (point) =>
        point.distanceOwnMeters <= ownLimit && point.distanceCounterpartMeters <= cpLimit
    )
    .sort(
      (a, b) =>
        Math.max(a.distanceOwnMeters, a.distanceCounterpartMeters) -
        Math.max(b.distanceOwnMeters, b.distanceCounterpartMeters)
    );
}
