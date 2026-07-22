// app/api/match-requests/[id]/meeting-point-proposals/[proposalId]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { respondProposalSchema } from "@/lib/validation/meetingPointProposal";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; proposalId: string } }
) {
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
  const parsed = respondProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const proposal = await prisma.meetingPointProposal.findUnique({
    where: { id: params.proposalId },
  });
  if (!proposal || proposal.matchRequestId !== matchRequest.id) {
    return NextResponse.json({ error: "Vorschlag nicht gefunden" }, { status: 404 });
  }
  if (proposal.status !== "PENDING") {
    return NextResponse.json(
      { error: "Dieser Vorschlag wurde bereits beantwortet." },
      { status: 409 }
    );
  }
  // Only the counterpart (not the proposer) may accept or reject.
  if (proposal.proposedById === session.user.id) {
    return NextResponse.json(
      { error: "Nur die andere Person kann auf diesen Vorschlag antworten." },
      { status: 403 }
    );
  }

  if (parsed.data.action === "accept") {
    // Resolve the proposal and promote it to the agreed point atomically.
    await prisma.$transaction([
      prisma.meetingPointProposal.update({
        where: { id: proposal.id },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      }),
      prisma.matchRequest.update({
        where: { id: matchRequest.id },
        data: {
          meetingPointName: proposal.name,
          meetingPointLat: proposal.lat,
          meetingPointLng: proposal.lng,
        },
      }),
    ]);
  } else {
    await prisma.meetingPointProposal.update({
      where: { id: proposal.id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
  }

  return NextResponse.json({ id: proposal.id, action: parsed.data.action });
}
