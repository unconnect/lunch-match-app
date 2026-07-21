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
    // Recipient may accept/decline; sender may withdraw their own request.
    canRespond: matchRequest.toUserId === session.user.id,
    canWithdraw: matchRequest.fromUserId === session.user.id,
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

  // Terminal states: once a request is declined or withdrawn, it is closed —
  // no status change, meeting-point proposal, or new message. The client also
  // enforces this ("isClosed"), but the server is the authority.
  const isClosed = matchRequest.status === "DECLINED" || matchRequest.status === "WITHDRAWN";
  if (isClosed) {
    return NextResponse.json(
      { error: "Diese Anfrage ist abgeschlossen und kann nicht mehr geändert werden." },
      { status: 409 }
    );
  }

  if (parsed.data.status) {
    // A status change is only valid from OPEN (accept/decline/withdraw an
    // open request). This prevents flipping an already-accepted request, or
    // reviving a closed one, via a crafted request or a stale client tab.
    if (matchRequest.status !== "OPEN") {
      return NextResponse.json(
        { error: "Der Status dieser Anfrage kann nicht mehr geändert werden." },
        { status: 409 }
      );
    }

    // Enforce who may set which status: only the recipient can accept/decline,
    // only the sender can withdraw. This prevents a sender from forging the
    // recipient's acceptance.
    const isRecipient = matchRequest.toUserId === session.user.id;
    const isSender = matchRequest.fromUserId === session.user.id;
    const isResponse = parsed.data.status === "ACCEPTED" || parsed.data.status === "DECLINED";

    if (isResponse && !isRecipient) {
      return NextResponse.json(
        { error: "Nur die angefragte Person kann zu- oder absagen." },
        { status: 403 }
      );
    }
    if (parsed.data.status === "WITHDRAWN" && !isSender) {
      return NextResponse.json(
        { error: "Nur die anfragende Person kann die Anfrage zurückziehen." },
        { status: 403 }
      );
    }
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
