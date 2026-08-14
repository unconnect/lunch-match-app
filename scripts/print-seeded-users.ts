// scripts/print-seeded-users.ts
//
// Runs as the `predev` step (before `next dev`) to reprint the seeded demo
// logins, so you don't have to hunt for the credentials from the last
// `npm run db:seed`. Recovery keys live only in the gitignored credentials
// file that the seed writes — the DB stores just their hash.
//
// Best-effort and never fatal: any problem (missing file, DB down) prints a
// short hint and exits 0 so `next dev` still starts.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// ESM module: resolve relative to this file via import.meta.url, not __dirname.
const CREDENTIALS_PATH = fileURLToPath(new URL("../prisma/.seeded-credentials.json", import.meta.url));

interface SeededCredential {
  alias: string;
  accountId: string;
  recoveryKey: string;
  branche: string;
  brancheVisible: boolean;
  locationLabel: string;
}

function readCredentials(): SeededCredential[] | null {
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8")) as SeededCredential[];
  } catch {
    return null;
  }
}

// Which of the seeded accountIds still exist in the DB. Returns null if the DB
// can't be reached, so the caller can fall back to the file alone.
async function liveAccountIds(): Promise<Set<string> | null> {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({ select: { accountId: true } });
    return new Set(users.map((u) => u.accountId));
  } catch {
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

function printTable(creds: SeededCredential[], caveat?: string) {
  console.log("\nSeed-Logins (lokal):");
  if (caveat) console.log(caveat);
  console.log("─".repeat(78));
  for (const c of creds) {
    console.log(
      `${c.alias.padEnd(11)}  ${c.accountId}  ${c.recoveryKey}  ` +
        `(${c.branche}${c.brancheVisible ? "" : ", verdeckt"}, ${c.locationLabel})`
    );
  }
  console.log("─".repeat(78));
  console.log('Tipp: als „Nutzerin A" anmelden — sie hat Nachrichten in allen Status.\n');
}

async function main() {
  const creds = readCredentials();
  if (!creds || creds.length === 0) {
    console.log("\nNoch keine Seed-Logins gefunden. Führe `npm run db:seed` aus.\n");
    return;
  }

  const live = await liveAccountIds();
  if (live === null) {
    // DB unreachable — show the last seed's list with a caveat.
    printTable(creds, "(DB nicht erreichbar — Liste stammt aus dem letzten Seeding.)");
    return;
  }

  const available = creds.filter((c) => live.has(c.accountId));
  if (available.length === 0) {
    console.log("\nDie Datenbank enthält keine der geseedeten Nutzer. Führe `npm run db:seed` aus.\n");
    return;
  }
  printTable(available);
}

// Never let this block `next dev`.
main().catch(() => {
  /* swallow — dev startup must not fail because of this helper */
});
