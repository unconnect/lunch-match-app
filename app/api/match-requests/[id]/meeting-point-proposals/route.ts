// app/api/match-requests/[id]/meeting-point-proposals/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { geocodeAddress } from "@/lib/geocoding";
import { createProposalSchema } from "@/lib/validation/meetingPointProposal";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  if (matchRequest.status === "DECLINED" || matchRequest.status === "WITHDRAWN") {
    return NextResponse.json(
      { error: "Diese Anfrage ist abgeschlossen und kann nicht mehr geändert werden." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = createProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve to a concrete point; geocode free text.
  let point: { name: string; lat: number; lng: number };
  if ("query" in parsed.data) {
    const geocoded = await geocodeAddress(parsed.data.query);
    if (!geocoded) {
      return NextResponse.json(
        { error: "Treffpunkt konnte nicht gefunden werden. Bitte präzisiere die Angabe." },
        { status: 422 }
      );
    }
    point = { name: parsed.data.query, lat: geocoded.lat, lng: geocoded.lng };
  } else {
    point = { name: parsed.data.name, lat: parsed.data.lat, lng: parsed.data.lng };
  }

  const userId = session.user.id;

  // Enforce the one-pending invariant and handle "counter" atomically.
  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.meetingPointProposal.findFirst({
      where: { matchRequestId: matchRequest.id, status: "PENDING" },
    });
    if (pending) {
      if (pending.proposedById === userId) {
        return { conflict: true as const };
      }
      // Counter: supersede the counterpart's pending proposal.
      await tx.meetingPointProposal.update({
        where: { id: pending.id },
        data: { status: "SUPERSEDED", resolvedAt: new Date() },
      });
    }
    const proposal = await tx.meetingPointProposal.create({
      data: {
        matchRequestId: matchRequest.id,
        proposedById: userId,
        name: point.name,
        lat: point.lat,
        lng: point.lng,
      },
    });
    return { proposal };
  });

  if ("conflict" in result) {
    return NextResponse.json(
      { error: "Dein Vorschlag wartet noch auf eine Antwort." },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: result.proposal.id });
}
