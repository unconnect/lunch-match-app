// app/api/match-requests/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { sendMessageSchema } from "@/lib/validation/message";
import { COUNTERPART_DELETED_ERROR, isCounterpartDeleted } from "@/lib/accountDeletion";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { matchRequestId: matchRequest.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    messages.map((m) => ({ id: m.id, text: m.text, senderId: m.senderId, createdAt: m.createdAt }))
  );
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  // Nobody is left to read it — the conversation is a tombstone.
  if (isCounterpartDeleted(matchRequest, session.user.id)) {
    return NextResponse.json({ error: COUNTERPART_DELETED_ERROR }, { status: 409 });
  }

  // A declined or withdrawn request is closed — no further messages.
  if (matchRequest.status === "DECLINED" || matchRequest.status === "WITHDRAWN") {
    return NextResponse.json(
      { error: "Diese Anfrage ist abgeschlossen." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { matchRequestId: matchRequest.id, senderId: session.user.id, text: parsed.data.text },
  });

  return NextResponse.json({ id: message.id });
}
