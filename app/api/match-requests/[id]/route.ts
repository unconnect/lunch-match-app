// app/api/match-requests/[id]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { updateMatchRequestSchema } from "@/lib/validation/matchRequest";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const counterpart = matchRequest.fromUserId === session.user.id ? matchRequest.toUser : matchRequest.fromUser;

  return NextResponse.json({
    id: matchRequest.id,
    status: matchRequest.status,
    type: matchRequest.type,
    counterpartAlias: counterpart.alias,
    meetingPointName: matchRequest.meetingPointName,
    meetingPointLat: matchRequest.meetingPointLat,
    meetingPointLng: matchRequest.meetingPointLng,
    canRespond: matchRequest.toUserId === session.user.id,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateMatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let meetingPointUpdate = {};
  if (parsed.data.meetingPointQuery) {
    const geocoded = await geocodeAddress(parsed.data.meetingPointQuery);
    if (!geocoded) {
      return NextResponse.json(
        { error: "Treffpunkt konnte nicht gefunden werden. Bitte präzisiere die Angabe." },
        { status: 422 }
      );
    }
    meetingPointUpdate = {
      meetingPointName: parsed.data.meetingPointQuery,
      meetingPointLat: geocoded.lat,
      meetingPointLng: geocoded.lng,
    };
  }

  const updated = await prisma.matchRequest.update({
    where: { id: matchRequest.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...meetingPointUpdate,
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
