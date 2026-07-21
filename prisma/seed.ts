// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
import { generateAccountId, generateRecoveryKey, hashRecoveryKey } from "../lib/identity";

const prisma = new PrismaClient();

interface DemoUserData {
  alias: string;
  lat: number;
  lng: number;
  locationLabel: string;
  locationPrecision: "EXACT" | "POSTAL_CODE" | "CITY";
  branche: string;
  brancheVisible: boolean;
  position: string;
  karrierelevel: "ANGESTELLT" | "MITTLERES_MANAGEMENT" | "LEITEND" | "GESCHAEFTSFUEHRUNG";
  schritteziel: number;
}

async function createDemoUser(label: string, data: DemoUserData) {
  const accountId = generateAccountId();
  const recoveryKey = generateRecoveryKey();
  const recoveryKeyHash = await hashRecoveryKey(recoveryKey);

  await prisma.user.create({ data: { accountId, recoveryKeyHash, ...data } });

  console.log(`${label}: accountId=${accountId} recoveryKey=${recoveryKey}`);
}

async function main() {
  await createDemoUser("Demo-Nutzerin A", {
    alias: "Nutzerin A",
    lat: 52.5219,
    lng: 13.4132,
    locationLabel: "Alexanderplatz, Berlin",
    locationPrecision: "EXACT",
    branche: "IT",
    brancheVisible: true,
    position: "Entwicklerin",
    karrierelevel: "ANGESTELLT",
    schritteziel: 1000,
  });

  await createDemoUser("Demo-Nutzer B", {
    alias: "Nutzer B",
    lat: 52.5245,
    lng: 13.4105,
    locationLabel: "Hackescher Markt, Berlin",
    locationPrecision: "EXACT",
    branche: "Marketing",
    brancheVisible: true,
    position: "Manager",
    karrierelevel: "MITTLERES_MANAGEMENT",
    schritteziel: 1500,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
