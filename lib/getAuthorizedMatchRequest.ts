// lib/getAuthorizedMatchRequest.ts
import { prisma } from "@/lib/prisma";

export async function getAuthorizedMatchRequest(matchRequestId: string, userId: string) {
  const matchRequest = await prisma.matchRequest.findUnique({
    where: { id: matchRequestId },
    include: { fromUser: true, toUser: true },
  });

  if (!matchRequest) return null;
  if (matchRequest.fromUserId !== userId && matchRequest.toUserId !== userId) return null;

  return matchRequest;
}
