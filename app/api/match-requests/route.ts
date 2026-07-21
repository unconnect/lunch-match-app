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

  const toUser = await prisma.user.findUnique({ where: { id: parsed.data.toUserId } });
  if (!toUser) {
    return NextResponse.json({ error: "Person nicht gefunden." }, { status: 404 });
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
  const statusParam = url.searchParams.get("status") as "OPEN" | "ACCEPTED" | "DECLINED" | null;

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
    };
  });

  return NextResponse.json(result);
}
