// app/api/match-requests/[id]/meeting-point-proposals/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { geocodeAddress } from "@/lib/geocoding";
import { createProposalSchema } from "@/lib/validation/meetingPointProposal";
import { COUNTERPART_DELETED_ERROR, isCounterpartDeleted } from "@/lib/accountDeletion";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  if (isCounterpartDeleted(matchRequest, session.user.id)) {
    return NextResponse.json({ error: COUNTERPART_DELETED_ERROR }, { status: 409 });
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

  const userId = session.user.id;

  // Cheap conflict check before geocoding: `geocodeAddress` serializes every
  // caller through a process-wide 1 req/s queue, so a call made only to be
  // rejected below delays geocoding for everyone. Advisory only — the
  // transaction re-checks authoritatively.
  const ownPending = await prisma.meetingPointProposal.findFirst({
    where: { matchRequestId: matchRequest.id, status: "PENDING", proposedById: userId },
    select: { id: true },
  });
  if (ownPending) {
    return NextResponse.json(
      { error: "Dein Vorschlag wartet noch auf eine Antwort." },
      { status: 409 }
    );
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

  // Enforce the one-pending invariant and handle "counter" atomically.
  let result: { proposal: { id: string } } | { conflict: "own" | "raced" };
  try {
    result = await prisma.$transaction(async (tx) => {
      const pending = await tx.meetingPointProposal.findFirst({
        where: { matchRequestId: matchRequest.id, status: "PENDING" },
      });
      if (pending) {
        if (pending.proposedById === userId) {
          return { conflict: "own" as const };
        }
        // Counter: supersede the counterpart's pending proposal. Status-guarded
        // like the accept path — the counterpart can accept the very proposal
        // we're superseding, and an unguarded update would overwrite that
        // ACCEPTED row while the match request keeps the agreed point.
        const superseded = await tx.meetingPointProposal.updateMany({
          where: { id: pending.id, status: "PENDING" },
          data: { status: "SUPERSEDED", resolvedAt: new Date() },
        });
        if (superseded.count !== 1) {
          return { conflict: "raced" as const };
        }
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
  } catch (error) {
    // The partial unique index on (matchRequestId) WHERE status = 'PENDING' is
    // what actually serializes two simultaneous proposals: READ COMMITTED lets
    // both transactions above read "no pending row" and both insert.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      result = { conflict: "raced" };
    } else {
      throw error;
    }
  }

  if ("conflict" in result) {
    return NextResponse.json(
      {
        error:
          result.conflict === "own"
            ? "Dein Vorschlag wartet noch auf eine Antwort."
            : "Der Vorschlag hat sich gerade geändert. Bitte lade die Seite neu.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: result.proposal.id });
}
