// lib/demoAccounts.ts
//
// Credentials for the seeded demo accounts. These are DELIBERATELY PUBLIC and
// committed: the deployed instance is a proof of concept, and the landing page
// shows this list so anyone can try the app without creating an account.
//
// Because they are fixed rather than generated, re-running `npm run db:seed`
// produces the same logins every time — the seed stays idempotent from a
// visitor's point of view, and the credentials survive a container redeploy
// (the generated `prisma/.seeded-credentials.json` does not).
//
// Never reuse this shape for anything but demo data. Real accounts get random
// credentials from lib/identity.ts, and their recovery keys are shown once and
// stored only as a bcrypt hash.
//
// Account IDs follow the format from lib/identity.ts: 10 characters from
// "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" (no ambiguous I, O, 0 or 1).

export interface DemoAccount {
  /** Must match an alias in DEMO_USERS in prisma/seed.ts. */
  alias: string;
  accountId: string;
  recoveryKey: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { alias: "Nutzerin A", accountId: "DEMA2KHQXP", recoveryKey: "demo-lunchmatch-key-aaaa" },
  { alias: "Nutzer B", accountId: "DEMB4RTZWC", recoveryKey: "demo-lunchmatch-key-bbbb" },
  { alias: "Carla", accountId: "DEMC7GNSVL", recoveryKey: "demo-lunchmatch-key-cccc" },
  { alias: "David", accountId: "DEMD3JPKMR", recoveryKey: "demo-lunchmatch-key-dddd" },
  { alias: "Elif", accountId: "DEME8QWTZN", recoveryKey: "demo-lunchmatch-key-eeee" },
  { alias: "Finn", accountId: "DEMF5HXCPB", recoveryKey: "demo-lunchmatch-key-ffff" },
  { alias: "Greta", accountId: "DEMG9LMRDT", recoveryKey: "demo-lunchmatch-key-gggg" },
  { alias: "Hassan", accountId: "DEMH6VZQKS", recoveryKey: "demo-lunchmatch-key-hhhh" },
  { alias: "Ida", accountId: "DEMJ2NPWXG", recoveryKey: "demo-lunchmatch-key-jjjj" },
  { alias: "Jonas", accountId: "DEMK4CTMBH", recoveryKey: "demo-lunchmatch-key-kkkk" },
  { alias: "Katrin", accountId: "DEML7SDFQZ", recoveryKey: "demo-lunchmatch-key-llll" },
  { alias: "Lars", accountId: "DEMM3XKGVN", recoveryKey: "demo-lunchmatch-key-mmmm" },
];

/**
 * The accounts offered as one-click logins on the landing page. "Nutzerin A"
 * is first because the seed centres its match requests on her, so she is the
 * only account with conversations in every status.
 */
export const FEATURED_DEMO_ALIASES = ["Nutzerin A", "Nutzer B", "Carla"];

export function findDemoAccount(alias: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((account) => account.alias === alias);
}
