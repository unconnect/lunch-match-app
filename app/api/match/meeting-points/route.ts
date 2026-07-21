// app/api/match/meeting-points/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateSearchRadiusMeters } from "@/lib/searchRadius";
import { findMeetingPoints } from "@/lib/meetingPoints";

// Split out of app/api/match/candidates/route.ts so that changing a
// people-only filter (Branche, Position, Karrierelevel) never re-triggers
// an Overpass call — meeting points depend only on origin, radius, and the
// cuisine filter. See app/match-finden/page.tsx for the two separate
// useQuery calls that key off this split, and lib/meetingPoints.ts for the
// invariant this exists to protect.

// Kept identical to app/api/match/candidates/route.ts's radius handling —
// see the comment there for the max-radius justification. Duplicated
// rather than shared because both routes independently resolve the
// current user's default radius and this task's scope intentionally keeps
// each route self-contained.
const MAX_RADIUS_METERS = 15000;

function resolveRadiusMeters(
  radiusParam: string | null,
  schritteziel: number | null | undefined
): number | { error: string } {
  if (radiusParam == null) {
    return calculateSearchRadiusMeters(schritteziel);
  }
  const parsed = Number(radiusParam);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: "Ungültiger Radius." };
  }
  return Math.min(parsed, MAX_RADIUS_METERS);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, lat: true, lng: true, schritteziel: true },
  });
  if (!currentUser || currentUser.lat == null || currentUser.lng == null) {
    return NextResponse.json({ error: "Profil unvollständig: Standort fehlt." }, { status: 400 });
  }

  const url = new URL(request.url);
  const radiusOverrideParam = url.searchParams.get("radius");
  const kuecheParam = url.searchParams.get("kueche");

  const radiusResult = resolveRadiusMeters(radiusOverrideParam, currentUser.schritteziel);
  if (typeof radiusResult === "object") {
    return NextResponse.json({ error: radiusResult.error }, { status: 400 });
  }
  const radiusMeters = radiusResult;

  const origin = { lat: currentUser.lat, lng: currentUser.lng };
  const cuisineFilter = kuecheParam === "vegetarian" || kuecheParam === "vegan" ? kuecheParam : undefined;
  const meetingPoints = await findMeetingPoints(origin, radiusMeters, cuisineFilter);

  return NextResponse.json({ radiusMeters, meetingPoints });
}
