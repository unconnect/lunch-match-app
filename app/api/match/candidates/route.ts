// app/api/match/candidates/route.ts
import { NextResponse } from "next/server";
import type { Karrierelevel } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateSearchRadiusMeters, metersToSteps } from "@/lib/searchRadius";
import { filterCandidates, type Candidate, type MatchFilters } from "@/lib/matchFilters";
import { findMeetingPoints } from "@/lib/meetingPoints";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!currentUser || currentUser.lat == null || currentUser.lng == null) {
    return NextResponse.json({ error: "Profil unvollständig: Standort fehlt." }, { status: 400 });
  }

  const url = new URL(request.url);
  const branche = url.searchParams.get("branche") ?? undefined;
  const position = url.searchParams.get("position") ?? undefined;
  const karrierelevelParam = url.searchParams.get("karrierelevel") ?? undefined;
  const kuecheParam = url.searchParams.get("kueche");
  const radiusOverrideParam = url.searchParams.get("radius");

  const filters: MatchFilters = {
    branche,
    position,
    karrierelevel: karrierelevelParam as Karrierelevel | undefined,
  };

  const radiusMeters = radiusOverrideParam
    ? Number(radiusOverrideParam)
    : calculateSearchRadiusMeters(currentUser.schritteziel);

  const origin = { lat: currentUser.lat, lng: currentUser.lng };

  const otherUsers = await prisma.user.findMany({
    where: { id: { not: currentUser.id }, lat: { not: null }, lng: { not: null } },
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

  const cuisineFilter = kuecheParam === "vegetarian" || kuecheParam === "vegan" ? kuecheParam : undefined;
  const meetingPoints = await findMeetingPoints(origin, radiusMeters, cuisineFilter);

  return NextResponse.json({ radiusMeters, origin, people, meetingPoints });
}
