export const DEFAULT_SEARCH_RADIUS_METERS = 732;
export const STEP_LENGTH_METERS = 0.73;

export function calculateSearchRadiusMeters(schritteziel?: number | null): number {
  if (!schritteziel || schritteziel <= 0) {
    return DEFAULT_SEARCH_RADIUS_METERS;
  }
  return Math.round(schritteziel * STEP_LENGTH_METERS);
}

export function metersToSteps(meters: number): number {
  return Math.round(meters / STEP_LENGTH_METERS);
}
