// app/api/match/candidates/route.ts
import { NextResponse } from "next/server";
import type { Karrierelevel } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateSearchRadiusMeters,
  metersToSteps,
  DEFAULT_SEARCH_RADIUS_METERS,
} from "@/lib/searchRadius";
import { filterCandidates, type Candidate, type MatchFilters } from "@/lib/matchFilters";
import { coarsenCoordinates } from "@/lib/locationPrivacy";

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

  // deletedAt is filtered explicitly rather than relying on the fact that a
  // deleted row also has its coordinates cleared — the exclusion should not
  // depend on a side effect of how deletion happens to blank fields.
  const otherUsers = await prisma.user.findMany({
    where: {
      id: { not: currentUser.id },
      deletedAt: null,
      lat: { not: null },
      lng: { not: null },
    },
    select: {
      id: true,
      alias: true,
      lat: true,
      lng: true,
      schritteziel: true,
      locationPrecision: true,
      branche: true,
      brancheVisible: true,
      position: true,
      karrierelevel: true,
    },
  });

  // Each user's chosen locationPrecision governs how precise a coordinate we
  // may expose to others. We keep the exact point for distance/radius maths
  // (so matching quality is unaffected by a privacy choice), then coarsen only
  // the coordinate that leaves the server — the exact point never reaches
  // another user who chose POSTAL_CODE or CITY.
  const precisionById = new Map(otherUsers.map((u) => [u.id, u.locationPrecision]));

  // Each candidate's own search radius (their schritteziel × step length), so
  // the map can draw a circle showing how far *they* would walk — same maths
  // the current user's radius uses. Centred on the coarsened coordinate below,
  // it inherits the same locationPrecision behaviour and leaks nothing extra.
  const radiusById = new Map(otherUsers.map((u) => [u.id, calculateSearchRadiusMeters(u.schritteziel)]));

  // A candidate the current user already has an *active* (OPEN or ACCEPTED)
  // request with — in either direction — must not be re-requestable from the
  // match screen. Look those up once and map counterpart -> request id, so the
  // UI can disable re-requesting and link straight to the existing conversation.
  // Declined/withdrawn requests are closed and deliberately don't count, so a
  // person can be asked again after a closed request.
  const activeRequests = await prisma.matchRequest.findMany({
    where: {
      OR: [{ fromUserId: currentUser.id }, { toUserId: currentUser.id }],
      status: { in: ["OPEN", "ACCEPTED"] },
    },
    select: { id: true, fromUserId: true, toUserId: true },
    orderBy: { createdAt: "desc" },
  });
  const activeRequestByCounterpart = new Map<string, string>();
  for (const r of activeRequests) {
    const counterpart = r.fromUserId === currentUser.id ? r.toUserId : r.fromUserId;
    if (!activeRequestByCounterpart.has(counterpart)) {
      activeRequestByCounterpart.set(counterpart, r.id);
    }
  }

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

  const people = filterCandidates(candidates, origin, radiusMeters, filters).map((c) => {
    const shown = coarsenCoordinates({ lat: c.lat, lng: c.lng }, precisionById.get(c.id) ?? null);
    return {
      id: c.id,
      alias: c.alias,
      distanceMeters: c.distanceMeters,
      distanceSteps: metersToSteps(c.distanceMeters),
      branche: c.brancheVisible ? c.branche : null,
      position: c.position,
      karrierelevel: c.karrierelevel,
      lat: shown.lat,
      lng: shown.lng,
      radiusMeters: radiusById.get(c.id) ?? DEFAULT_SEARCH_RADIUS_METERS,
      activeRequestId: activeRequestByCounterpart.get(c.id) ?? null,
    };
  });

  return NextResponse.json({ radiusMeters, origin, people });
}
