import type { Karrierelevel } from "@prisma/client";
import { haversineDistanceMeters, type Coordinates } from "@/lib/geo";

export interface Candidate {
  id: string;
  alias: string | null;
  lat: number;
  lng: number;
  branche: string | null;
  brancheVisible: boolean;
  position: string | null;
  karrierelevel: Karrierelevel | null;
}

export interface CandidateWithDistance extends Candidate {
  distanceMeters: number;
}

export interface MatchFilters {
  branche?: string;
  position?: string;
  karrierelevel?: Karrierelevel;
}

export function filterCandidates(
  candidates: Candidate[],
  origin: Coordinates,
  radiusMeters: number,
  filters: MatchFilters = {}
): CandidateWithDistance[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      distanceMeters: haversineDistanceMeters(origin, { lat: candidate.lat, lng: candidate.lng }),
    }))
    .filter((candidate) => candidate.distanceMeters <= radiusMeters)
    .filter((candidate) => !filters.branche || (candidate.brancheVisible && candidate.branche === filters.branche))
    .filter((candidate) => !filters.position || candidate.position === filters.position)
    .filter((candidate) => !filters.karrierelevel || candidate.karrierelevel === filters.karrierelevel);
}
