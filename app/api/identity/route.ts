import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateAccountId, generateRecoveryKey, hashRecoveryKey } from "@/lib/identity";

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
