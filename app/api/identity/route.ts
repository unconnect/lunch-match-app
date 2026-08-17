import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateAccountId, generateRecoveryKey, hashRecoveryKey } from "@/lib/identity";
import { buildDeletedUserFields, partitionMatchRequests } from "@/lib/accountDeletion";
import { deleteAccountSchema } from "@/lib/validation/accountDeletion";

export async function POST() {
  let accountId = generateAccountId();

  while (await prisma.user.findUnique({ where: { accountId } })) {
    accountId = generateAccountId();
  }

  const recoveryKey = generateRecoveryKey();
  const recoveryKeyHash = await hashRecoveryKey(recoveryKey);

  await prisma.user.create({
    data: { accountId, recoveryKeyHash },
  });

  return NextResponse.json({ accountId, recoveryKey });
}

// Irreversible account deletion. There is no recovery path for accounts in this
// app by design, and there is none for this either: everything personal is
// erased, the user's messages are gone, and the credentials stop working.
//
// The empty `User` row survives so that a counterpart's conversation can still
// be rendered as a tombstone rather than silently disappearing — see
// lib/accountDeletion.ts for why that shell is necessary.
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte gib deine Account-ID zur Bestätigung ein." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Konto nicht gefunden." }, { status: 404 });
  }

  // The client disables its button until the typed value matches, but that is
  // convenience, not a guard. This is the check that counts.
  if (parsed.data.confirmation.trim() !== user.accountId) {
    return NextResponse.json(
      { error: "Die eingegebene Account-ID stimmt nicht überein." },
      { status: 400 }
    );
  }

  const matchRequests = await prisma.matchRequest.findMany({
    where: { OR: [{ fromUserId: user.id }, { toUserId: user.id }] },
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      fromUser: { select: { deletedAt: true } },
      toUser: { select: { deletedAt: true } },
    },
  });

  const { destroy } = partitionMatchRequests(
    matchRequests.map((mr) => ({
      id: mr.id,
      fromUserId: mr.fromUserId,
      toUserId: mr.toUserId,
      fromUserDeleted: mr.fromUser.deletedAt != null,
      toUserDeleted: mr.toUser.deletedAt != null,
    })),
    user.id
  );

  // One transaction, in foreign-key-safe order: children before parents, and
  // the user row last. A partial deletion would leave an account that is half
  // gone and still logged in, which is worse than either outcome.
  await prisma.$transaction([
    prisma.message.deleteMany({
      where: { OR: [{ senderId: user.id }, { matchRequestId: { in: destroy } }] },
    }),
    prisma.meetingPointProposal.deleteMany({
      where: { OR: [{ proposedById: user.id }, { matchRequestId: { in: destroy } }] },
    }),
    prisma.matchRequest.deleteMany({ where: { id: { in: destroy } } }),
    prisma.user.update({
      where: { id: user.id },
      data: buildDeletedUserFields(user.id, new Date()),
    }),
  ]);

  return NextResponse.json({ deleted: true });
}
