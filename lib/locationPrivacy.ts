// lib/locationPrivacy.ts
import type { LocationPrecision } from "@prisma/client";
import type { Coordinates } from "@/lib/geo";

// How many decimal places of latitude/longitude a user's chosen precision
// exposes to other participants. Fewer decimals = coarser location.
// At Berlin's latitude: 2 decimals ≈ 1.1 km (postal-code area),
// 1 decimal ≈ 11 km (city). EXACT exposes the full point.
const PRECISION_DECIMALS: Record<LocationPrecision, number | null> = {
  EXACT: null,
  POSTAL_CODE: 2,
  CITY: 1,
};

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Reduce a coordinate's fidelity to what the owner's privacy level permits,
 * before it is exposed to another user. The exact point must never leave the
 * server for a user who chose POSTAL_CODE or CITY precision.
 */
export function coarsenCoordinates(
  coord: Coordinates,
  precision: LocationPrecision | null
): Coordinates {
  const decimals = precision ? PRECISION_DECIMALS[precision] : null;
  if (decimals === null) {
    return { lat: coord.lat, lng: coord.lng };
  }
  return { lat: roundTo(coord.lat, decimals), lng: roundTo(coord.lng, decimals) };
}
