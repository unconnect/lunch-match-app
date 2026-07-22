// app/api/match-requests/[id]/meeting-suggestions/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { coarsenCoordinates } from "@/lib/locationPrivacy";
import { calculateSearchRadiusMeters, STEP_LENGTH_METERS } from "@/lib/searchRadius";
import { findMeetingPoints } from "@/lib/meetingPoints";
import {
  circlesOverlap,
  suggestionsInIntersection,
  DEFAULT_OVERLAP_TOLERANCE_STEPS,
} from "@/lib/meetingSuggestions";

// Kept local and identical to the other match routes' cap — see the note in
// app/api/match/meeting-points/route.ts. Not shared, by design.
const MAX_RADIUS_METERS = 15000;

// Bound the tolerance so a crafted or fat-fingered value can't request an
// enormous Overpass area. 20000 steps ≈ 14.6 km, already near MAX_RADIUS.
const MAX_TOLERANCE_STEPS = 20000;

function resolveToleranceSteps(param: string | null): number | { error: string } {
  if (param == null) return DEFAULT_OVERLAP_TOLERANCE_STEPS;
  // An empty string (e.g. `?toleranceSteps=`) becomes Number("") === 0, i.e.
  // tolerance 0 — a valid, stricter search — not the default. Only a fully
  // absent param (handled above) uses the default.
  const parsed = Number(param);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: "Ungültige Toleranz." };
  }
  return Math.min(parsed, MAX_TOLERANCE_STEPS);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const toleranceResult = resolveToleranceSteps(new URL(request.url).searchParams.get("toleranceSteps"));
  if (typeof toleranceResult === "object") {
    return NextResponse.json({ error: toleranceResult.error }, { status: 400 });
  }
  const toleranceMeters = toleranceResult * STEP_LENGTH_METERS;

  const currentUser = matchRequest.fromUserId === session.user.id ? matchRequest.fromUser : matchRequest.toUser;
  const counterpart = matchRequest.fromUserId === session.user.id ? matchRequest.toUser : matchRequest.fromUser;

  // Either side missing a location means no intersection can be computed.
  // The current user missing one is already blocked upstream, but guard both.
  if (currentUser.lat == null || currentUser.lng == null || counterpart.lat == null || counterpart.lng == null) {
    return NextResponse.json({ suggestions: [], reason: "counterpart-no-location" });
  }

  const ownOrigin = { lat: currentUser.lat, lng: currentUser.lng };
  // The counterpart's exact point must never leave the server — coarsen to
  // their chosen precision. The intersection is computed against the coarser
  // point; that may widen it, which is acceptable and intended.
  const cpOrigin = coarsenCoordinates(
    { lat: counterpart.lat, lng: counterpart.lng },
    counterpart.locationPrecision
  );

  const ownRadiusMeters = calculateSearchRadiusMeters(currentUser.schritteziel);
  const cpRadiusMeters = calculateSearchRadiusMeters(counterpart.schritteziel);

  if (!circlesOverlap(ownOrigin, ownRadiusMeters, cpOrigin, cpRadiusMeters, toleranceMeters)) {
    return NextResponse.json({ suggestions: [], reason: "no-overlap" });
  }

  // Query around the current user's origin with the widened own-radius. Every
  // point in the lens is within (ownRadius + tolerance) of ownOrigin, so a
  // single call contains the whole intersection — except when
  // (ownRadius + tolerance) exceeds MAX_RADIUS_METERS, where the query disk is
  // capped at MAX_RADIUS_METERS and the lens is truncated to that cap. That only
  // happens at extreme step goals and only drops points far beyond walking
  // range, so the result stays correct (no wrong point is ever returned).
  // No cuisine filter — the detail page has none.
  const queryRadiusMeters = Math.min(ownRadiusMeters + toleranceMeters, MAX_RADIUS_METERS);
  const candidates = await findMeetingPoints(ownOrigin, queryRadiusMeters);

  const suggestions = suggestionsInIntersection(
    candidates,
    ownOrigin,
    ownRadiusMeters,
    cpOrigin,
    cpRadiusMeters,
    toleranceMeters
  );

  return NextResponse.json({
    suggestions,
    reason: suggestions.length > 0 ? null : "none-found",
  });
}
