// app/api/match/candidates/route.ts
import { NextResponse } from "next/server";
import type { Karrierelevel } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateSearchRadiusMeters, metersToSteps } from "@/lib/searchRadius";
import { filterCandidates, type Candidate, type MatchFilters } from "@/lib/matchFilters";

// Meeting points (Overpass) now live behind their own route —
// app/api/match/meeting-points/route.ts — so that changing a people-only
// filter (Branche, Position, Karrierelevel) never re-triggers an Overpass
// call. See that file and lib/meetingPoints.ts for the rest of the story.

// A `radius` override is user-controlled input. Reject non-finite/negative
// values outright (garbage in, 400 out — not a silent empty result set),
// and clamp anything absurdly large so it can't be used to build a huge
// Overpass `around:` query (app/api/match/meeting-points/route.ts) or hang
// the request. 15,000 m gives headroom above the largest radius the app's
// own UI can produce: a very generous 20,000-step goal is
// 20000 * 0.73 = 14,600 m (see lib/searchRadius.ts), so 15,000 m only ever
// clamps deliberately out-of-range input, never a legitimate step goal.
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
  const branche = url.searchParams.get("branche") ?? undefined;
  const position = url.searchParams.get("position") ?? undefined;
  const karrierelevelParam = url.searchParams.get("karrierelevel") ?? undefined;
  const radiusOverrideParam = url.searchParams.get("radius");

  const filters: MatchFilters = {
    branche,
    position,
    karrierelevel: karrierelevelParam as Karrierelevel | undefined,
  };

  const radiusResult = resolveRadiusMeters(radiusOverrideParam, currentUser.schritteziel);
  if (typeof radiusResult === "object") {
    return NextResponse.json({ error: radiusResult.error }, { status: 400 });
  }
  const radiusMeters = radiusResult;

  const origin = { lat: currentUser.lat, lng: currentUser.lng };

  const otherUsers = await prisma.user.findMany({
    where: { id: { not: currentUser.id }, lat: { not: null }, lng: { not: null } },
    select: {
      id: true,
      alias: true,
      lat: true,
      lng: true,
      branche: true,
      brancheVisible: true,
      position: true,
      karrierelevel: true,
    },
  });

  const candidates: Candidate[] = otherUsers.map((u) => ({
    id: u.id,
    alias: u.alias,
    lat: u.lat as number,
    lng: u.lng as number,
    branche: u.branche,
    brancheVisible: u.brancheVisible,
    position: u.position,
    karrierelevel: u.karrierelevel,
  }));

  const people = filterCandidates(candidates, origin, radiusMeters, filters).map((c) => ({
    id: c.id,
    alias: c.alias,
    distanceMeters: c.distanceMeters,
    distanceSteps: metersToSteps(c.distanceMeters),
    branche: c.brancheVisible ? c.branche : null,
    position: c.position,
    karrierelevel: c.karrierelevel,
    lat: c.lat,
    lng: c.lng,
  }));

  return NextResponse.json({ radiusMeters, origin, people });
}
