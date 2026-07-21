import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { verifyRecoveryKey } from "@/lib/identity";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        accountId: { label: "Account-ID" },
        recoveryKey: { label: "Recovery-Key" },
      },
      authorize: async (credentials) => {
        const accountId = credentials?.accountId as string | undefined;
        const recoveryKey = credentials?.recoveryKey as string | undefined;

        if (!accountId || !recoveryKey) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { accountId } });
        if (!user) {
          return null;
        }

        const valid = await verifyRecoveryKey(recoveryKey, user.recoveryKeyHash);
        if (!valid) {
          return null;
        }

        return { id: user.id, name: user.accountId };
      },
    }),
  ],
});
