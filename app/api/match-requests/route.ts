// app/api/match-requests/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createMatchRequestSchema } from "@/lib/validation/matchRequest";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createMatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.toUserId === session.user.id) {
    return NextResponse.json({ error: "Du kannst dir nicht selbst eine Anfrage senden." }, { status: 400 });
  }

  // A deleted account keeps an empty row for the benefit of existing
  // conversations; it must not be possible to start a new one with it. Same
  // 404 as a genuinely missing user — there is nothing to tell the sender.
  const toUser = await prisma.user.findUnique({ where: { id: parsed.data.toUserId } });
  if (!toUser || toUser.deletedAt) {
    return NextResponse.json({ error: "Person nicht gefunden." }, { status: 404 });
  }

  // Don't allow a second active request to someone you already have an OPEN or
  // ACCEPTED request with (in either direction). Backs the "Bereits angefragt"
  // state in the match UI and closes the duplicate-request path. Return the
  // existing id so the client can jump to the conversation instead.
  const existing = await prisma.matchRequest.findFirst({
    where: {
      status: { in: ["OPEN", "ACCEPTED"] },
      OR: [
        { fromUserId: session.user.id, toUserId: parsed.data.toUserId },
        { fromUserId: parsed.data.toUserId, toUserId: session.user.id },
      ],
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Mit dieser Person besteht bereits eine offene Anfrage.", existingRequestId: existing.id },
      { status: 409 }
    );
  }

  const matchRequest = await prisma.matchRequest.create({
    data: {
      fromUserId: session.user.id,
      toUserId: parsed.data.toUserId,
      type: parsed.data.type,
      messages: {
        create: { senderId: session.user.id, text: parsed.data.message },
      },
    },
  });

  return NextResponse.json({ id: matchRequest.id });
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get("status");
  // Validate the client-supplied status against the enum before it reaches
  // Prisma: an unknown value would otherwise throw and surface as a 500.
  const allowedStatuses = ["OPEN", "ACCEPTED", "DECLINED", "WITHDRAWN"] as const;
  if (rawStatus !== null && !allowedStatuses.includes(rawStatus as (typeof allowedStatuses)[number])) {
    return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
  }
  const statusParam = rawStatus as (typeof allowedStatuses)[number] | null;

  const matchRequests = await prisma.matchRequest.findMany({
    where: {
      OR: [{ fromUserId: session.user.id }, { toUserId: session.user.id }],
      ...(statusParam ? { status: statusParam } : {}),
    },
    include: { fromUser: true, toUser: true },
    orderBy: { createdAt: "desc" },
  });

  const result = matchRequests.map((mr) => {
    const counterpart = mr.fromUserId === session.user.id ? mr.toUser : mr.fromUser;
    return {
      id: mr.id,
      status: mr.status,
      type: mr.type,
      createdAt: mr.createdAt,
      counterpartAlias: counterpart.alias,
      counterpartDeleted: counterpart.deletedAt != null,
    };
  });

  return NextResponse.json(result);
}
