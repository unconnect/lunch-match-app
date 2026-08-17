// prisma/seed.ts
//
// Seeds a set of demo users spread across Berlin-Mitte, plus a few match
// requests (in every status) centred on the first user, so the whole app —
// match list, map, filters, and the Nachrichten flow — has content to test
// with straight after seeding.
//
// This script WIPES existing messages, match requests, and users first, so
// repeated `npm run db:seed` runs give the same clean data set rather than
// accumulating. Don't run it against data you want to keep.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient, type LocationPrecision, type Karrierelevel } from "@prisma/client";
import { hashRecoveryKey } from "../lib/identity";
import { DEMO_ACCOUNTS, findDemoAccount } from "../lib/demoAccounts";

const prisma = new PrismaClient();

// Where the demo credentials are persisted for `npm run dev` to reprint. The
// authoritative list now lives in lib/demoAccounts.ts (the DB stores only the
// hashes); this file stays as the convenience cache the predev printer reads,
// enriched with each account's branche and location. Gitignored.
// (ESM module: resolve relative to this file via import.meta.url, not __dirname.)
export const SEED_CREDENTIALS_PATH = fileURLToPath(new URL(".seeded-credentials.json", import.meta.url));

interface DemoUserData {
  alias: string;
  lat: number;
  lng: number;
  locationLabel: string;
  locationPrecision: LocationPrecision;
  branche: string;
  brancheVisible: boolean;
  position: string;
  karrierelevel: Karrierelevel;
  schritteziel: number;
}

// Clustered around Alexanderplatz (~52.5219, 13.4132) so most pairs fall within
// each other's search radius. Precision is mixed on purpose to exercise the
// coordinate-coarsening in lib/locationPrivacy.ts. Branche visibility is mixed
// to exercise the brancheVisible gating in the candidates API.
const DEMO_USERS: DemoUserData[] = [
  {
    // A has a deliberately generous step goal so that, signed in as A, the
    // match list and map are richly populated out of the box (most other demo
    // users fall inside her radius). Lower it in the profile to test a tighter
    // search.
    alias: "Nutzerin A",
    lat: 52.5219, lng: 13.4132, locationLabel: "Alexanderplatz, Berlin",
    locationPrecision: "EXACT", branche: "IT", brancheVisible: true,
    position: "Entwicklerin", karrierelevel: "ANGESTELLT", schritteziel: 4000,
  },
  {
    alias: "Nutzer B",
    lat: 52.5245, lng: 13.4025, locationLabel: "Hackescher Markt, Berlin",
    locationPrecision: "EXACT", branche: "Marketing", brancheVisible: true,
    position: "Manager", karrierelevel: "MITTLERES_MANAGEMENT", schritteziel: 1500,
  },
  {
    alias: "Carla",
    lat: 52.5283, lng: 13.4104, locationLabel: "Rosa-Luxemburg-Platz, Berlin",
    locationPrecision: "POSTAL_CODE", branche: "Design", brancheVisible: true,
    position: "UX-Designerin", karrierelevel: "ANGESTELLT", schritteziel: 2000,
  },
  {
    alias: "David",
    lat: 52.5190, lng: 13.4080, locationLabel: "Rotes Rathaus, Berlin",
    locationPrecision: "EXACT", branche: "Finanzen", brancheVisible: false,
    position: "Controller", karrierelevel: "LEITEND", schritteziel: 800,
  },
  {
    alias: "Elif",
    lat: 52.5169, lng: 13.3975, locationLabel: "Museumsinsel, Berlin",
    locationPrecision: "CITY", branche: "Personal", brancheVisible: true,
    position: "Recruiterin", karrierelevel: "MITTLERES_MANAGEMENT", schritteziel: 1200,
  },
  {
    alias: "Finn",
    lat: 52.5265, lng: 13.4030, locationLabel: "Weinmeisterstraße, Berlin",
    locationPrecision: "EXACT", branche: "IT", brancheVisible: true,
    position: "DevOps-Engineer", karrierelevel: "ANGESTELLT", schritteziel: 3000,
  },
  {
    alias: "Greta",
    lat: 52.5170, lng: 13.4130, locationLabel: "Klosterstraße, Berlin",
    locationPrecision: "POSTAL_CODE", branche: "Vertrieb", brancheVisible: false,
    position: "Key-Account-Managerin", karrierelevel: "LEITEND", schritteziel: 1000,
  },
  {
    alias: "Hassan",
    lat: 52.5145, lng: 13.4185, locationLabel: "Jannowitzbrücke, Berlin",
    locationPrecision: "EXACT", branche: "Recht", brancheVisible: true,
    position: "Justiziar", karrierelevel: "GESCHAEFTSFUEHRUNG", schritteziel: 1800,
  },
  {
    alias: "Ida",
    lat: 52.5130, lng: 13.4050, locationLabel: "Fischerinsel, Berlin",
    locationPrecision: "CITY", branche: "Marketing", brancheVisible: true,
    position: "Content-Managerin", karrierelevel: "ANGESTELLT", schritteziel: 2500,
  },
  {
    alias: "Jonas",
    lat: 52.5270, lng: 13.4120, locationLabel: "Volksbühne, Berlin",
    locationPrecision: "EXACT", branche: "IT", brancheVisible: false,
    position: "Product-Owner", karrierelevel: "MITTLERES_MANAGEMENT", schritteziel: 1000,
  },
  {
    alias: "Katrin",
    lat: 52.5128, lng: 13.4110, locationLabel: "Märkisches Museum, Berlin",
    locationPrecision: "POSTAL_CODE", branche: "Bildung", brancheVisible: true,
    position: "Trainerin", karrierelevel: "ANGESTELLT", schritteziel: 1400,
  },
  {
    alias: "Lars",
    lat: 52.5305, lng: 13.4180, locationLabel: "Torstraße, Berlin",
    locationPrecision: "EXACT", branche: "Finanzen", brancheVisible: true,
    position: "Analyst", karrierelevel: "ANGESTELLT", schritteziel: 900,
  },
];

interface CreatedUser extends DemoUserData {
  id: string;
  accountId: string;
  recoveryKey: string;
}

async function wipe() {
  await prisma.message.deleteMany();
  // Meeting-point proposals FK-reference a match request, so they must go
  // before the match requests they belong to.
  await prisma.meetingPointProposal.deleteMany();
  await prisma.matchRequest.deleteMany();
  await prisma.user.deleteMany();
}

// Demo users get their credentials from the committed lib/demoAccounts.ts
// rather than lib/identity.ts's generators, so that re-seeding yields the same
// logins and the landing page can publish them. Real sign-ups still go through
// the random generators via the identity route.
async function createDemoUser(data: DemoUserData): Promise<CreatedUser> {
  const demo = findDemoAccount(data.alias);
  if (!demo) {
    throw new Error(
      `Keine Demo-Zugangsdaten für „${data.alias}“ gefunden — bitte in lib/demoAccounts.ts ergänzen.`
    );
  }
  const recoveryKeyHash = await hashRecoveryKey(demo.recoveryKey);
  const user = await prisma.user.create({
    data: { accountId: demo.accountId, recoveryKeyHash, ...data },
  });
  return { ...data, id: user.id, accountId: demo.accountId, recoveryKey: demo.recoveryKey };
}

// This script deletes every user, match request and message before it writes.
// On the deployed instance that would destroy real accounts, and those accounts
// have no recovery path by design — so refuse unless someone very deliberately
// opts in. The deployed stack sets APP_ENV=production; seeding it is a manual,
// one-time bootstrap (see deploy/README.md), never part of the entrypoint.
function assertSeedingAllowed() {
  const isProduction =
    process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
  if (isProduction && process.env.SEED_FORCE !== "yes") {
    console.error(
      "\nAbbruch: Dieses Skript löscht ALLE Nutzer, Match-Anfragen und Nachrichten,\n" +
        "und es läuft gerade gegen eine Produktivumgebung (APP_ENV/NODE_ENV=production).\n\n" +
        "Wenn das wirklich beabsichtigt ist, erneut mit SEED_FORCE=yes ausführen.\n"
    );
    process.exit(1);
  }
}

// The sharper of the two guards, because it looks at the data rather than at
// the environment: if the database holds accounts this seed did not create,
// they belong to real visitors — and by design there is no way to give them
// back once deleted. Catches the case the env check misses, namely running the
// seed from a laptop against the deployed database through an SSH tunnel.
async function assertNoRealAccounts() {
  const demoAccountIds = DEMO_ACCOUNTS.map((account) => account.accountId);
  // Deleted accounts are excluded: their Account ID is scrambled to a
  // `deleted-…` placeholder, so they would otherwise look like strangers and
  // block every reseed once a single demo account had been deleted. There is
  // nothing personal left in those rows to protect.
  const realAccounts = await prisma.user.count({
    where: { accountId: { notIn: demoAccountIds }, deletedAt: null },
  });
  if (realAccounts > 0 && process.env.SEED_FORCE !== "yes") {
    console.error(
      `\nAbbruch: Die Datenbank enthält ${realAccounts} Konto/Konten, die nicht aus diesem\n` +
        "Seed stammen — vermutlich echte Besucher:innen. Diese Konten lassen sich nach\n" +
        "dem Löschen nicht wiederherstellen.\n\n" +
        "Wenn das wirklich beabsichtigt ist, erneut mit SEED_FORCE=yes ausführen.\n"
    );
    process.exit(1);
  }
}

async function main() {
  assertSeedingAllowed();
  await assertNoRealAccounts();
  console.log("Bestehende Daten werden gelöscht und neu angelegt…\n");
  await wipe();

  const users: CreatedUser[] = [];
  for (const data of DEMO_USERS) {
    users.push(await createDemoUser(data));
  }

  // Persist the credentials so `npm run dev` (see scripts/print-seeded-users.ts)
  // can reprint the login list — the recovery keys exist nowhere else.
  writeFileSync(
    SEED_CREDENTIALS_PATH,
    JSON.stringify(
      users.map((u) => ({
        alias: u.alias,
        accountId: u.accountId,
        recoveryKey: u.recoveryKey,
        branche: u.branche,
        brancheVisible: u.brancheVisible,
        locationLabel: u.locationLabel,
      })),
      null,
      2
    ) + "\n"
  );

  const byAlias = (alias: string) => {
    const u = users.find((x) => x.alias === alias);
    if (!u) throw new Error(`seed: unknown alias ${alias}`);
    return u;
  };

  // Match requests centred on "Nutzerin A" so that, signed in as A, every
  // Nachrichten status (Offen incoming/outgoing, Zugesagt, Abgesagt,
  // Zurückgezogen) is immediately visible. Plus one between other users for
  // list variety.
  const A = byAlias("Nutzerin A");

  // Incoming OPEN: Carla asked A
  await prisma.matchRequest.create({
    data: {
      fromUserId: byAlias("Carla").id, toUserId: A.id, type: "MANUAL", status: "OPEN",
      messages: { create: { senderId: byAlias("Carla").id, text: "Hi A, hast du morgen Zeit für eine gemeinsame Mittagspause?" } },
    },
  });

  // Outgoing OPEN: A asked David
  await prisma.matchRequest.create({
    data: {
      fromUserId: A.id, toUserId: byAlias("David").id, type: "MANUAL", status: "OPEN",
      messages: { create: { senderId: A.id, text: "Hallo David, Lust auf einen kurzen Spaziergang zum Lunch?" } },
    },
  });

  // ACCEPTED with a meeting point and a short thread: A and Finn
  await prisma.matchRequest.create({
    data: {
      fromUserId: byAlias("Finn").id, toUserId: A.id, type: "MANUAL", status: "ACCEPTED",
      meetingPointName: "Hackescher Markt, Berlin", meetingPointLat: 52.5245, meetingPointLng: 13.4025,
      messages: {
        create: [
          { senderId: byAlias("Finn").id, text: "Treffen wir uns am Hackeschen Markt?" },
          { senderId: A.id, text: "Klar, passt! Bis gleich." },
        ],
      },
    },
  });

  // DECLINED: A asked Greta, Greta declined
  await prisma.matchRequest.create({
    data: {
      fromUserId: A.id, toUserId: byAlias("Greta").id, type: "MATCH_ME", status: "DECLINED",
      messages: { create: { senderId: A.id, text: "möchte mit dir eine gemeinsame Mittagspause verbringen." } },
    },
  });

  // WITHDRAWN: A asked Hassan, then withdrew
  await prisma.matchRequest.create({
    data: {
      fromUserId: A.id, toUserId: byAlias("Hassan").id, type: "MANUAL", status: "WITHDRAWN",
      messages: { create: { senderId: A.id, text: "Hallo Hassan, hättest du Zeit?" } },
    },
  });

  // Variety between two other users (not involving A)
  await prisma.matchRequest.create({
    data: {
      fromUserId: byAlias("Ida").id, toUserId: byAlias("Jonas").id, type: "MANUAL", status: "OPEN",
      messages: { create: { senderId: byAlias("Ida").id, text: "Mittagspause zusammen?" } },
    },
  });

  console.log(`${users.length} Demo-Nutzer angelegt, 6 Match-Anfragen (davon 5 mit „Nutzerin A").\n`);
  console.log("Zugangsdaten (einmalig — bitte notieren):");
  console.log("─".repeat(78));
  for (const u of users) {
    console.log(
      `${u.alias.padEnd(11)}  ${u.accountId}  ${u.recoveryKey}  ` +
        `(${u.branche}${u.brancheVisible ? "" : ", verdeckt"}, ${u.locationLabel})`
    );
  }
  console.log("─".repeat(78));
  console.log('Tipp: als „Nutzerin A" anmelden — sie hat bereits Nachrichten in allen Status.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
