# Lunch-Match-App v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Lunch-Match web app (v1) where anonymous users can create a profile, find nearby people/meeting points, send match requests, and chat to arrange a lunch break — per `docs/superpowers/specs/2026-07-15-lunch-match-app-design.md`.

**Architecture:** Single Next.js 14 (App Router) + TypeScript project. PostgreSQL via Prisma. NextAuth (Auth.js v5) with a custom Credentials provider that authenticates an anonymous Account-ID + Recovery-Key pair instead of email/password. Client data via TanStack Query. Styling via Tailwind + shadcn/ui. Leaflet/OpenStreetMap for maps and geocoding, Overpass API for meeting-point search.

**Tech Stack:** Next.js 14, React 18, TypeScript 5, Tailwind CSS 3, shadcn/ui (Radix), Prisma 5 + PostgreSQL 16, NextAuth (next-auth@beta / Auth.js v5), TanStack Query 5, react-hook-form 7 + zod 3, react-leaflet 4 + leaflet 1, bcryptjs, Vitest.

## Global Constraints

- Node.js >= 20 LTS, npm as package manager (no yarn/pnpm).
- Next.js 14, App Router only (no `pages/` directory), TypeScript strict mode.
- Styling/components: Tailwind CSS + shadcn/ui only — no other component library.
- PostgreSQL via Docker Compose for local dev; Prisma is the only DB access layer (no raw SQL outside Prisma).
- Auth: NextAuth (Auth.js) v5, `session: { strategy: "jwt" }`, Credentials provider only. No email/password, no OAuth providers.
- No password-reset flow. A lost Recovery-Key means permanent loss of the account — this is communicated to the user, never "fixed" with a workaround.
- All client-side server-state fetching goes through TanStack Query — no ad-hoc `useEffect` + `fetch`.
- All forms use react-hook-form + zod, with the same zod schema reused for server-side validation in the corresponding API route.
- Maps: react-leaflet + Leaflet + OpenStreetMap tiles. Geocoding via Nominatim (max 1 request/second, must set a descriptive `User-Agent` header). Meeting points via the Overpass API. No paid/keyed map provider.
- All UI copy is in German, consistent with the thesis terminology (e.g. "Match finden", "Nachrichten", "Zusagen"/"Absagen").
- Out of scope for v1 — do not implement: Dashboard/Gamification (Rangliste, Abzeichen, Herausforderungen, Schrittekonto-Historie), Favoriten-Liste, real fitness-tracker sync.
- Suchradius: `732m` default when no `schritteziel` is set; `schritteziel × 0.73` meters when it is set (verbatim from the spec — not the same as `1000 × 0.73`).
- No automated E2E tests in v1 (per spec) — manual verification via the dev server is the final check for UI tasks; automated tests are for pure logic only (Vitest).

---

## Task 1: Project Scaffolding (Next.js + TypeScript + Tailwind)

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `.gitignore`, `.eslintrc.json`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Produces: a running Next.js dev server at `http://localhost:3000`, path alias `@/*` → project root, Tailwind available in `app/globals.css`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "lunch-match-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "next-auth": "5.0.0-beta.25",
    "@prisma/client": "^5.20.0",
    "@tanstack/react-query": "^5.59.0",
    "react-hook-form": "^7.53.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.23.0",
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "bcryptjs": "^2.4.3",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2",
    "lucide-react": "^0.446.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^20.16.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/leaflet": "^1.9.12",
    "@types/bcryptjs": "^2.4.6",
    "tailwindcss": "^3.4.13",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20",
    "prisma": "^5.20.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "vitest": "^2.1.1",
    "tsx": "^4.19.1"
  }
}
```

- [ ] **Step 2: Run install**

Run: `npm install`
Expected: installs without errors, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Write `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Write `postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Write `.eslintrc.json`**

```json
{
  "extends": "next/core-web-vitals"
}
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules/
.next/
.env
.env.local
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 9: Write `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 10: Write `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lunch Match",
  description: "Finde jemanden für eine gemeinsame Mittagspause in deiner Nähe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Write `app/page.tsx`**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">Lunch Match</h1>
    </main>
  );
}
```

- [ ] **Step 12: Verify the app builds and runs**

Run: `npm run build`
Expected: `Compiled successfully`, no type errors.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 + TypeScript + Tailwind project"
```

---

## Task 2: Vitest Setup

**Files:**
- Create: `vitest.config.ts`, `lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: `tsconfig.json` path alias `@/*` from Task 1.
- Produces: `npm test` runs Vitest against `lib/**/*.test.ts`.

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 2: Write a smoke test**

```ts
// lib/__tests__/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("vitest setup", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run it**

Run: `npm test`
Expected: `1 passed`, no errors.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts lib/__tests__/smoke.test.ts
git commit -m "chore: set up Vitest"
```

---

## Task 3: PostgreSQL via Docker Compose + Env Files

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env` (local only, gitignored)

**Interfaces:**
- Produces: a running Postgres 16 instance on `localhost:5432`, reachable via `DATABASE_URL` in `.env`.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: lunchmatch
      POSTGRES_PASSWORD: lunchmatch_dev
      POSTGRES_DB: lunchmatch
    ports:
      - "5432:5432"
    volumes:
      - lunchmatch_pgdata:/var/lib/postgresql/data

volumes:
  lunchmatch_pgdata:
```

- [ ] **Step 2: Write `.env.example`**

```
DATABASE_URL="postgresql://lunchmatch:lunchmatch_dev@localhost:5432/lunchmatch"
AUTH_SECRET="replace-with-output-of-openssl-rand-base64-32"
```

- [ ] **Step 3: Create local `.env`**

Run: `cp .env.example .env && sed -i.bak "s#replace-with-output-of-openssl-rand-base64-32#$(openssl rand -base64 32)#" .env && rm .env.bak`
Expected: `.env` exists with a real `DATABASE_URL` and a generated `AUTH_SECRET`. Verify `.env` is listed in `.gitignore` (it already is, from Task 1).

- [ ] **Step 4: Start the database**

Run: `docker compose up -d db`
Expected: container `lunch-match-app-db-1` (or similar) reports `running`/`healthy` — check with `docker compose ps`.

- [ ] **Step 5: Verify connectivity**

Run: `docker compose exec db psql -U lunchmatch -d lunchmatch -c "SELECT 1;"`
Expected: prints a row with `1`.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add Postgres via Docker Compose"
```

---

## Task 4: Prisma Schema, Migration, Client Singleton

**Files:**
- Create: `prisma/schema.prisma`, `lib/prisma.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from Task 3's `.env`.
- Produces: `PrismaClient` singleton importable as `import { prisma } from "@/lib/prisma"`; generated types `User`, `MatchRequest`, `Message`, and enums `LocationPrecision`, `Karrierelevel`, `MatchType`, `MatchStatus` from `@prisma/client`, used by every later task that touches the database.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum LocationPrecision {
  EXACT
  POSTAL_CODE
  CITY
}

enum Karrierelevel {
  ANGESTELLT
  MITTLERES_MANAGEMENT
  LEITEND
  GESCHAEFTSFUEHRUNG
}

enum MatchType {
  MANUAL
  MATCH_ME
}

enum MatchStatus {
  OPEN
  ACCEPTED
  DECLINED
}

model User {
  id                String              @id @default(cuid())
  accountId         String              @unique
  recoveryKeyHash   String
  alias             String?
  locationLabel     String?
  lat               Float?
  lng               Float?
  locationPrecision LocationPrecision?
  branche           String?
  brancheVisible    Boolean             @default(false)
  position          String?
  karrierelevel     Karrierelevel?
  schritteziel      Int?
  createdAt         DateTime            @default(now())

  sentRequests     MatchRequest[] @relation("FromUser")
  receivedRequests MatchRequest[] @relation("ToUser")
  messages         Message[]
}

model MatchRequest {
  id               String      @id @default(cuid())
  fromUserId       String
  toUserId         String
  type             MatchType
  status           MatchStatus @default(OPEN)
  proposedTimeslot DateTime?
  meetingPointLat  Float?
  meetingPointLng  Float?
  meetingPointName String?
  createdAt        DateTime    @default(now())

  fromUser User      @relation("FromUser", fields: [fromUserId], references: [id])
  toUser   User      @relation("ToUser", fields: [toUserId], references: [id])
  messages Message[]

  @@index([fromUserId])
  @@index([toUserId])
}

model Message {
  id             String   @id @default(cuid())
  matchRequestId String
  senderId       String
  text           String
  createdAt      DateTime @default(now())

  matchRequest MatchRequest @relation(fields: [matchRequestId], references: [id])
  sender       User         @relation(fields: [senderId], references: [id])

  @@index([matchRequestId])
}
```

Note: `locationLabel` stores the human-readable address/PLZ/Ort text the user typed, so the profile form can redisplay it (the spec's schema only persists `lat`/`lng`, which isn't enough to repopulate the form — this field closes that gap without changing behavior).

- [ ] **Step 2: Run the initial migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/<timestamp>_init/migration.sql`, applies it, prints `Your database is now in sync with your schema.`, and regenerates the Prisma client.

- [ ] **Step 3: Write `lib/prisma.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: Verify the client works**

Run: `node -e "require('@prisma/client'); console.log('ok')"`
Expected: prints `ok` (confirms the client generated successfully).

- [ ] **Step 5: Commit**

```bash
git add prisma lib/prisma.ts
git commit -m "feat: add Prisma schema and client singleton"
```

---

## Task 5: Search Radius Calculation

**Files:**
- Create: `lib/searchRadius.ts`, `lib/__tests__/searchRadius.test.ts`

**Interfaces:**
- Produces: `calculateSearchRadiusMeters(schritteziel?: number | null): number`, `metersToSteps(meters: number): number`, `DEFAULT_SEARCH_RADIUS_METERS`, `STEP_LENGTH_METERS` — used by the candidates API (Task 18) and the profile form (Task 17).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/searchRadius.test.ts
import { describe, expect, it } from "vitest";
import {
  calculateSearchRadiusMeters,
  metersToSteps,
  DEFAULT_SEARCH_RADIUS_METERS,
} from "@/lib/searchRadius";

describe("calculateSearchRadiusMeters", () => {
  it("returns the default radius when no step goal is set", () => {
    expect(calculateSearchRadiusMeters(undefined)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
    expect(calculateSearchRadiusMeters(null)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
  });

  it("returns the default radius when the step goal is zero or negative", () => {
    expect(calculateSearchRadiusMeters(0)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
    expect(calculateSearchRadiusMeters(-100)).toBe(DEFAULT_SEARCH_RADIUS_METERS);
  });

  it("derives the radius from the step goal at 0.73m per step", () => {
    expect(calculateSearchRadiusMeters(1000)).toBe(730);
    expect(calculateSearchRadiusMeters(2000)).toBe(1460);
  });
});

describe("metersToSteps", () => {
  it("converts meters back to an approximate step count", () => {
    expect(metersToSteps(730)).toBe(1000);
    expect(metersToSteps(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- searchRadius`
Expected: FAIL — `Cannot find module '@/lib/searchRadius'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/searchRadius.ts
export const DEFAULT_SEARCH_RADIUS_METERS = 732;
export const STEP_LENGTH_METERS = 0.73;

export function calculateSearchRadiusMeters(schritteziel?: number | null): number {
  if (!schritteziel || schritteziel <= 0) {
    return DEFAULT_SEARCH_RADIUS_METERS;
  }
  return Math.round(schritteziel * STEP_LENGTH_METERS);
}

export function metersToSteps(meters: number): number {
  return Math.round(meters / STEP_LENGTH_METERS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- searchRadius`
Expected: `3 passed` (all `describe` blocks green).

- [ ] **Step 5: Commit**

```bash
git add lib/searchRadius.ts lib/__tests__/searchRadius.test.ts
git commit -m "feat: add search radius calculation"
```

---

## Task 6: Haversine Distance

**Files:**
- Create: `lib/geo.ts`, `lib/__tests__/geo.test.ts`

**Interfaces:**
- Produces: `Coordinates` type `{ lat: number; lng: number }`, `haversineDistanceMeters(a: Coordinates, b: Coordinates): number` — used by `lib/matchFilters.ts` (Task 8) and the candidates API (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/geo.test.ts
import { describe, expect, it } from "vitest";
import { haversineDistanceMeters } from "@/lib/geo";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters({ lat: 52.52, lng: 13.405 }, { lat: 52.52, lng: 13.405 })).toBe(0);
  });

  it("returns approximately 111km per degree of longitude at the equator", () => {
    const distance = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    expect(distance).toBeGreaterThan(111000);
    expect(distance).toBeLessThan(111400);
  });

  it("returns approximately 111km per degree of latitude", () => {
    const distance = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(distance).toBeGreaterThan(111000);
    expect(distance).toBeLessThan(111400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- geo`
Expected: FAIL — `Cannot find module '@/lib/geo'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/geo.ts
export interface Coordinates {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return Math.round(EARTH_RADIUS_METERS * c);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- geo`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts lib/__tests__/geo.test.ts
git commit -m "feat: add haversine distance calculation"
```

---

## Task 7: Anonymous Identity (Account-ID + Recovery-Key)

**Files:**
- Create: `lib/identity.ts`, `lib/__tests__/identity.test.ts`

**Interfaces:**
- Produces: `generateAccountId(): string`, `generateRecoveryKey(): string`, `hashRecoveryKey(key: string): Promise<string>`, `verifyRecoveryKey(key: string, hash: string): Promise<boolean>` — used by the identity API route (Task 12) and the NextAuth `authorize` callback (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/identity.test.ts
import { describe, expect, it } from "vitest";
import {
  generateAccountId,
  generateRecoveryKey,
  hashRecoveryKey,
  verifyRecoveryKey,
} from "@/lib/identity";

describe("generateAccountId", () => {
  it("generates a 10-character alphanumeric id", () => {
    const id = generateAccountId();
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^[A-Z0-9]+$/);
  });

  it("generates different ids on repeated calls", () => {
    expect(generateAccountId()).not.toBe(generateAccountId());
  });
});

describe("generateRecoveryKey", () => {
  it("generates a key of at least 20 characters", () => {
    expect(generateRecoveryKey().length).toBeGreaterThanOrEqual(20);
  });
});

describe("hashRecoveryKey / verifyRecoveryKey", () => {
  it("verifies a correct key against its hash", async () => {
    const key = generateRecoveryKey();
    const hash = await hashRecoveryKey(key);
    expect(await verifyRecoveryKey(key, hash)).toBe(true);
  });

  it("rejects an incorrect key", async () => {
    const hash = await hashRecoveryKey(generateRecoveryKey());
    expect(await verifyRecoveryKey("wrong-key", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- identity`
Expected: FAIL — `Cannot find module '@/lib/identity'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/identity.ts
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const ACCOUNT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (no I,O,0,1)
const ACCOUNT_ID_LENGTH = 10;
const RECOVERY_KEY_BYTES = 18; // -> 24 base64url characters
const BCRYPT_ROUNDS = 12;

export function generateAccountId(): string {
  const bytes = randomBytes(ACCOUNT_ID_LENGTH);
  let result = "";
  for (let i = 0; i < ACCOUNT_ID_LENGTH; i++) {
    result += ACCOUNT_ID_ALPHABET[bytes[i] % ACCOUNT_ID_ALPHABET.length];
  }
  return result;
}

export function generateRecoveryKey(): string {
  return randomBytes(RECOVERY_KEY_BYTES).toString("base64url");
}

export async function hashRecoveryKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

export async function verifyRecoveryKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- identity`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/identity.ts lib/__tests__/identity.test.ts
git commit -m "feat: add anonymous identity generation and recovery-key hashing"
```

---

## Task 8: Matching Filter Logic

**Files:**
- Create: `lib/matchFilters.ts`, `lib/__tests__/matchFilters.test.ts`

**Interfaces:**
- Consumes: `Coordinates`, `haversineDistanceMeters` from `lib/geo.ts` (Task 6); `Karrierelevel` enum from `@prisma/client` (Task 4).
- Produces: `Candidate`, `CandidateWithDistance`, `MatchFilters` types and `filterCandidates(candidates, origin, radiusMeters, filters?): CandidateWithDistance[]` — used by the candidates API (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/matchFilters.test.ts
import { describe, expect, it } from "vitest";
import { Karrierelevel } from "@prisma/client";
import { filterCandidates, type Candidate } from "@/lib/matchFilters";

const origin = { lat: 52.52, lng: 13.405 };

const nearVisible: Candidate = {
  id: "near-visible",
  alias: "Nahe Person",
  lat: 52.5205,
  lng: 13.4055,
  branche: "IT",
  brancheVisible: true,
  position: "Entwicklerin",
  karrierelevel: Karrierelevel.ANGESTELLT,
};

const farAway: Candidate = {
  id: "far-away",
  alias: "Ferne Person",
  lat: 53.0,
  lng: 14.0,
  branche: "IT",
  brancheVisible: true,
  position: "Entwicklerin",
  karrierelevel: Karrierelevel.ANGESTELLT,
};

const nearHiddenBranche: Candidate = {
  id: "near-hidden-branche",
  alias: "Verdeckte Person",
  lat: 52.5206,
  lng: 13.4051,
  branche: "IT",
  brancheVisible: false,
  position: "Managerin",
  karrierelevel: Karrierelevel.LEITEND,
};

describe("filterCandidates", () => {
  it("excludes candidates outside the radius", () => {
    const result = filterCandidates([nearVisible, farAway], origin, 1000);
    expect(result.map((c) => c.id)).toEqual(["near-visible"]);
  });

  it("includes distanceMeters on each result", () => {
    const result = filterCandidates([nearVisible], origin, 1000);
    expect(result[0].distanceMeters).toBeGreaterThanOrEqual(0);
    expect(result[0].distanceMeters).toBeLessThan(1000);
  });

  it("excludes a branche match when brancheVisible is false", () => {
    const result = filterCandidates([nearHiddenBranche], origin, 1000, { branche: "IT" });
    expect(result).toEqual([]);
  });

  it("filters by karrierelevel", () => {
    const result = filterCandidates([nearVisible, nearHiddenBranche], origin, 1000, {
      karrierelevel: Karrierelevel.LEITEND,
    });
    expect(result.map((c) => c.id)).toEqual(["near-hidden-branche"]);
  });

  it("returns an empty list when there are no candidates", () => {
    expect(filterCandidates([], origin, 1000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- matchFilters`
Expected: FAIL — `Cannot find module '@/lib/matchFilters'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/matchFilters.ts
import type { Karrierelevel } from "@prisma/client";
import { haversineDistanceMeters, type Coordinates } from "@/lib/geo";

export interface Candidate {
  id: string;
  alias: string | null;
  lat: number;
  lng: number;
  branche: string | null;
  brancheVisible: boolean;
  position: string | null;
  karrierelevel: Karrierelevel | null;
}

export interface CandidateWithDistance extends Candidate {
  distanceMeters: number;
}

export interface MatchFilters {
  branche?: string;
  position?: string;
  karrierelevel?: Karrierelevel;
}

export function filterCandidates(
  candidates: Candidate[],
  origin: Coordinates,
  radiusMeters: number,
  filters: MatchFilters = {}
): CandidateWithDistance[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      distanceMeters: haversineDistanceMeters(origin, { lat: candidate.lat, lng: candidate.lng }),
    }))
    .filter((candidate) => candidate.distanceMeters <= radiusMeters)
    .filter((candidate) => !filters.branche || (candidate.brancheVisible && candidate.branche === filters.branche))
    .filter((candidate) => !filters.position || candidate.position === filters.position)
    .filter((candidate) => !filters.karrierelevel || candidate.karrierelevel === filters.karrierelevel);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- matchFilters`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/matchFilters.ts lib/__tests__/matchFilters.test.ts
git commit -m "feat: add matching filter logic"
```

---

## Task 9: Geocoding Client (Nominatim)

**Files:**
- Create: `lib/geocoding.ts`, `lib/__tests__/geocoding.test.ts`

**Interfaces:**
- Produces: `GeocodeResult { lat: number; lng: number }`, `geocodeAddress(query: string): Promise<GeocodeResult | null>` — used by the profile API route (Task 16).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/geocoding.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress } from "@/lib/geocoding";

describe("geocodeAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns coordinates parsed from the Nominatim response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "52.5200066", lon: "13.4049540" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodeAddress("Alexanderplatz, Berlin");

    expect(result).toEqual({ lat: 52.5200066, lng: 13.404954 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("nominatim.openstreetmap.org/search"),
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": expect.any(String) }) })
    );
  });

  it("returns null when there are no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );

    expect(await geocodeAddress("nonexistent place xyz")).toBeNull();
  });

  it("returns null when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));

    expect(await geocodeAddress("Berlin")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- geocoding`
Expected: FAIL — `Cannot find module '@/lib/geocoding'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/geocoding.ts
export interface GeocodeResult {
  lat: number;
  lng: number;
}

const NOMINATIM_USER_AGENT = "lunch-match-app/0.1 (student project, non-commercial)";

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ lat: string; lon: string }>;

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- geocoding`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/geocoding.ts lib/__tests__/geocoding.test.ts
git commit -m "feat: add Nominatim geocoding client"
```

---

## Task 10: Meeting Points Client (Overpass API)

**Files:**
- Create: `lib/meetingPoints.ts`, `lib/__tests__/meetingPoints.test.ts`

**Interfaces:**
- Consumes: `Coordinates` from `lib/geo.ts` (Task 6).
- Produces: `MeetingPoint { id: string; name: string; lat: number; lng: number; cuisine?: string }`, `findMeetingPoints(origin: Coordinates, radiusMeters: number, cuisineFilter?: "vegetarian" | "vegan"): Promise<MeetingPoint[]>` — used by the candidates API (Task 18).

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/meetingPoints.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { findMeetingPoints } from "@/lib/meetingPoints";

describe("findMeetingPoints", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps Overpass elements to MeetingPoint objects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { id: 123, lat: 52.521, lon: 13.406, tags: { name: "Cafe Sonne", cuisine: "vegetarian" } },
          { id: 456, lat: 52.522, lon: 13.407, tags: {} },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await findMeetingPoints({ lat: 52.52, lng: 13.405 }, 1000);

    expect(result).toEqual([
      { id: "123", name: "Cafe Sonne", lat: 52.521, lng: 13.406, cuisine: "vegetarian" },
      { id: "456", name: "Unbenannter Treffpunkt", lat: 52.522, lng: 13.407, cuisine: undefined },
    ]);
  });

  it("includes a diet filter clause in the query when a cuisine filter is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    await findMeetingPoints({ lat: 52.52, lng: 13.405 }, 1000, "vegan");

    const [, options] = fetchMock.mock.calls[0];
    expect(options.body).toContain('"diet:vegan"="yes"');
  });

  it("returns an empty list when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    expect(await findMeetingPoints({ lat: 52.52, lng: 13.405 }, 1000)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- meetingPoints`
Expected: FAIL — `Cannot find module '@/lib/meetingPoints'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/meetingPoints.ts
import type { Coordinates } from "@/lib/geo";

export interface MeetingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  cuisine?: string;
}

interface OverpassElement {
  id: number;
  lat: number;
  lon: number;
  tags?: { name?: string; cuisine?: string };
}

export async function findMeetingPoints(
  origin: Coordinates,
  radiusMeters: number,
  cuisineFilter?: "vegetarian" | "vegan"
): Promise<MeetingPoint[]> {
  const dietClause = cuisineFilter ? `["diet:${cuisineFilter}"="yes"]` : "";
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"~"restaurant|cafe"]${dietClause}(around:${radiusMeters},${origin.lat},${origin.lng});
    );
    out body;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as { elements?: OverpassElement[] };

  return (data.elements ?? []).map((element) => ({
    id: String(element.id),
    name: element.tags?.name ?? "Unbenannter Treffpunkt",
    lat: element.lat,
    lng: element.lon,
    cuisine: element.tags?.cuisine,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- meetingPoints`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/meetingPoints.ts lib/__tests__/meetingPoints.test.ts
git commit -m "feat: add Overpass meeting-points client"
```

---

## Task 11: Auth Configuration (NextAuth Credentials Provider)

**Files:**
- Create: `auth.config.ts`, `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`, `types/next-auth.d.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/prisma.ts` (Task 4), `verifyRecoveryKey` from `lib/identity.ts` (Task 7).
- Produces: `auth()` (server-side session getter), `signIn`/`signOut` server actions, and `session.user.id` typed as `string` — used by every protected page/route from Task 13 onward. Protected route prefixes: `/profil`, `/match-finden`, `/nachrichten`.

- [ ] **Step 1: Write `auth.config.ts`** (edge-safe config, no Prisma import — reused by both the full auth instance and the Edge middleware)

```ts
// auth.config.ts
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/konto-wiederherstellen",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      const protectedPrefixes = ["/profil", "/match-finden", "/nachrichten"];
      const isProtected = protectedPrefixes.some((prefix) =>
        request.nextUrl.pathname.startsWith(prefix)
      );
      if (!isProtected) return true;
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id: string }).id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string }).id = token.userId as string;
      }
      return session;
    },
  },
  providers: [],
};
```

- [ ] **Step 2: Write `auth.ts`** (full instance with the Credentials provider — Node runtime only, used in route handlers and server components)

```ts
// auth.ts
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
```

- [ ] **Step 3: Write the route handler**

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 4: Write `middleware.ts`** (lightweight Edge-compatible instance built from `authConfig` alone — no Prisma/bcrypt in the Edge runtime)

```ts
// middleware.ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/profil/:path*", "/match-finden/:path*", "/nachrichten/:path*"],
};
```

- [ ] **Step 5: Write the session type augmentation**

```ts
// types/next-auth.d.ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
```

- [ ] **Step 6: Verify the project still type-checks and builds**

Run: `npm run build`
Expected: `Compiled successfully`, no type errors referencing `auth`, `authConfig`, or `Session`.

- [ ] **Step 7: Commit**

```bash
git add auth.config.ts auth.ts app/api/auth middleware.ts types/next-auth.d.ts
git commit -m "feat: add NextAuth credentials-based auth for anonymous identities"
```

---

## Task 12: Identity Creation API Route

**Files:**
- Create: `app/api/identity/route.ts`

**Interfaces:**
- Consumes: `prisma` (Task 4), `generateAccountId`, `generateRecoveryKey`, `hashRecoveryKey` from `lib/identity.ts` (Task 7).
- Produces: `POST /api/identity` → `{ accountId: string; recoveryKey: string }` (the only time the plaintext recovery key is ever returned) — consumed by the landing page (Task 13).

- [ ] **Step 1: Write the route handler**

```ts
// app/api/identity/route.ts
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
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev` (in one terminal), then in another: `curl -X POST http://localhost:3000/api/identity`
Expected: JSON response like `{"accountId":"AB12CD34EF","recoveryKey":"..."}`. Run it twice — the two `accountId` values must differ.

- [ ] **Step 3: Commit**

```bash
git add app/api/identity/route.ts
git commit -m "feat: add identity-creation API route"
```

---

## Task 13: Root Providers + Landing Page (Create Identity)

**Files:**
- Create: `app/providers.tsx`, `app/(auth)/page.tsx` (replaces the placeholder `app/page.tsx` from Task 1)
- Modify: `app/layout.tsx` (wrap children in `<Providers>`)
- Delete: `app/page.tsx` (moved into the `(auth)` route group so `middleware.ts`'s `authorized` callback logic and future route grouping stay clean)

**Interfaces:**
- Consumes: `POST /api/identity` (Task 12), `signIn` from `next-auth/react`.
- Produces: the `/` route showing "Neues Konto erstellen"; after confirmation, an authenticated session and redirect to `/profil`.

- [ ] **Step 1: Write `app/providers.tsx`**

```tsx
// app/providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 2: Modify `app/layout.tsx`**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Lunch Match",
  description: "Finde jemanden für eine gemeinsame Mittagspause in deiner Nähe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Remove the placeholder home page and create the landing page**

Run: `rm app/page.tsx`

```tsx
// app/(auth)/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { signIn } from "next-auth/react";

type Step = "start" | "created";

interface IdentityResponse {
  accountId: string;
  recoveryKey: string;
}

export default function LandingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("start");
  const [identity, setIdentity] = useState<IdentityResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const createIdentityMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/identity", { method: "POST" });
      if (!response.ok) throw new Error("Konto konnte nicht erstellt werden.");
      return (await response.json()) as IdentityResponse;
    },
    onSuccess: (data) => {
      setIdentity(data);
      setStep("created");
    },
  });

  async function handleConfirm() {
    if (!identity) return;
    setSigningIn(true);
    setSignInError(null);
    const result = await signIn("credentials", {
      accountId: identity.accountId,
      recoveryKey: identity.recoveryKey,
      redirect: false,
    });
    setSigningIn(false);
    if (result?.error) {
      setSignInError("Anmeldung fehlgeschlagen. Bitte versuche es erneut.");
      return;
    }
    router.push("/profil");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Lunch Match</h1>

      {step === "start" && (
        <>
          <p>
            Finde jemanden für eine gemeinsame Mittagspause in deiner Nähe — ganz ohne
            E-Mail-Adresse oder Passwort.
          </p>
          <button
            onClick={() => createIdentityMutation.mutate()}
            disabled={createIdentityMutation.isPending}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {createIdentityMutation.isPending ? "Wird erstellt…" : "Neues Konto erstellen"}
          </button>
          <a href="/konto-wiederherstellen" className="text-sm underline">
            Ich habe bereits ein Konto
          </a>
          {createIdentityMutation.isError && (
            <p className="text-sm text-red-600">{(createIdentityMutation.error as Error).message}</p>
          )}
        </>
      )}

      {step === "created" && identity && (
        <>
          <p className="font-medium">
            Speichere diese Zugangsdaten jetzt sicher ab — sie werden nur einmal angezeigt und
            können nicht wiederhergestellt werden, wenn du sie verlierst.
          </p>
          <div className="rounded border p-4">
            <p className="text-sm text-slate-500">Account-ID</p>
            <p className="font-mono text-lg">{identity.accountId}</p>
            <p className="mt-2 text-sm text-slate-500">Recovery-Key</p>
            <p className="break-all font-mono text-lg">{identity.recoveryKey}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Ich habe Account-ID und Recovery-Key sicher gespeichert.
          </label>
          <button
            onClick={handleConfirm}
            disabled={!confirmed || signingIn}
            className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {signingIn ? "Wird angemeldet…" : "Weiter zum Profil"}
          </button>
          {signInError && <p className="text-sm text-red-600">{signInError}</p>}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, open `http://localhost:3000`
Expected: clicking "Neues Konto erstellen" shows an Account-ID and Recovery-Key; checking the confirmation box and clicking "Weiter zum Profil" redirects to `/profil` (a 404 is expected until Task 17 exists — confirm the redirect happens and a session cookie (`authjs.session-token` or similar) is set, e.g. via browser dev tools).

- [ ] **Step 5: Commit**

```bash
git add app/providers.tsx app/layout.tsx app/(auth)
git rm app/page.tsx
git commit -m "feat: add root providers and anonymous-identity landing page"
```

---

## Task 14: Konto-Wiederherstellen Page

**Files:**
- Create: `app/konto-wiederherstellen/page.tsx`

**Interfaces:**
- Consumes: `signIn` from `next-auth/react` (Task 11).
- Produces: the `/konto-wiederherstellen` route, the `pages.signIn` target configured in `auth.config.ts`.

- [ ] **Step 1: Write the page**

```tsx
// app/konto-wiederherstellen/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { z } from "zod";

const schema = z.object({
  accountId: z.string().min(1, "Account-ID wird benötigt"),
  recoveryKey: z.string().min(1, "Recovery-Key wird benötigt"),
});

type FormValues = z.infer<typeof schema>;

export default function KontoWiederherstellenPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await signIn("credentials", { ...values, redirect: false });
    if (result?.error) {
      setServerError("Ungültige Account-ID oder Recovery-Key.");
      return;
    }
    router.push("/profil");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Konto wiederherstellen</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm">Account-ID</span>
          <input {...register("accountId")} className="rounded border p-2 font-mono" />
          {errors.accountId && <span className="text-sm text-red-600">{errors.accountId.message}</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm">Recovery-Key</span>
          <input {...register("recoveryKey")} className="rounded border p-2 font-mono" />
          {errors.recoveryKey && (
            <span className="text-sm text-red-600">{errors.recoveryKey.message}</span>
          )}
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? "Wird geprüft…" : "Anmelden"}
        </button>
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
      </form>
      <a href="/" className="text-sm underline">
        Neues Konto erstellen
      </a>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open `http://localhost:3000/konto-wiederherstellen`
Expected: submitting an unknown Account-ID/Recovery-Key pair shows "Ungültige Account-ID oder Recovery-Key."; submitting a real pair from Task 13 redirects to `/profil`.

- [ ] **Step 3: Commit**

```bash
git add app/konto-wiederherstellen
git commit -m "feat: add account-recovery login page"
```

---

## Task 15: Design System (Tailwind Theme + shadcn-Style Components + Navigation)

This is the design-pass phase from the spec: it turns the thesis's grayscale wireframes into an actual visual theme (warm amber/terracotta primary evoking food, a green accent, light/dark via `prefers-color-scheme`) before any feature screens are built, so every later page shares one look from the start.

**Scope note:** shadcn/ui's own CLI/registry is not used for reproducibility — the small set of primitives below is hand-written in the canonical shadcn pattern (Radix primitive + `cva` + `cn`), which is equivalent output without depending on registry availability at build time. Simple filter controls (native `<select>`, `<input type="radio">`) are styled directly with Tailwind rather than wrapped in Radix — only Dialog, Tabs, Checkbox, and Label get Radix primitives, since those are the ones where Radix meaningfully helps with accessibility/behavior.

**Files:**
- Create: `lib/utils.ts`, `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/textarea.tsx`, `components/ui/badge.tsx`, `components/ui/checkbox.tsx`, `components/ui/tabs.tsx`, `components/ui/dialog.tsx`, `components/Navigation.tsx`
- Modify: `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Consumes: `useSession`, `signOut` from `next-auth/react` (Task 11's `SessionProvider`, wired in Task 13).
- Produces: `cn()` util; `Button`, `Card`/`CardHeader`/`CardTitle`/`CardContent`/`CardFooter`, `Input`, `Label`, `Textarea`, `Badge`, `Checkbox`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Dialog`/`DialogTrigger`/`DialogContent`/`DialogTitle` — used by every UI task from here on (Tasks 17, 19, 22, 23). `<Navigation />` rendered globally in the root layout, hidden when there is no session.

- [ ] **Step 1: Install Radix primitives**

Run: `npm install @radix-ui/react-slot @radix-ui/react-label @radix-ui/react-checkbox @radix-ui/react-tabs @radix-ui/react-dialog`
Expected: installs without errors.

- [ ] **Step 2: Write `lib/utils.ts`**

```ts
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Extend `tailwind.config.ts` with the design tokens**

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Replace `app/globals.css` with the theme**

```css
/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 30 20% 98%;
    --foreground: 20 15% 15%;
    --card: 30 25% 100%;
    --card-foreground: 20 15% 15%;
    --primary: 21 90% 48%;
    --primary-foreground: 30 20% 98%;
    --secondary: 160 30% 92%;
    --secondary-foreground: 160 40% 20%;
    --muted: 30 15% 92%;
    --muted-foreground: 20 10% 40%;
    --accent: 160 40% 40%;
    --accent-foreground: 30 20% 98%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 30 20% 98%;
    --border: 30 15% 85%;
    --input: 30 15% 85%;
    --ring: 21 90% 48%;
    --radius: 0.5rem;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --background: 20 15% 10%;
      --foreground: 30 20% 96%;
      --card: 20 15% 13%;
      --card-foreground: 30 20% 96%;
      --primary: 21 85% 55%;
      --primary-foreground: 20 15% 10%;
      --secondary: 160 20% 18%;
      --secondary-foreground: 160 30% 85%;
      --muted: 20 10% 18%;
      --muted-foreground: 30 10% 65%;
      --accent: 160 35% 45%;
      --accent-foreground: 20 15% 10%;
      --destructive: 0 62% 45%;
      --destructive-foreground: 30 20% 96%;
      --border: 20 10% 22%;
      --input: 20 10% 22%;
      --ring: 21 85% 55%;
    }
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 5: Write `components/ui/button.tsx`**

```tsx
// components/ui/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-input bg-background hover:bg-muted",
        ghost: "hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 6: Write `components/ui/card.tsx`**

```tsx
// components/ui/card.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col gap-1 p-4", className)} {...props} />
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center gap-2 p-4 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardContent, CardFooter };
```

- [ ] **Step 7: Write `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/textarea.tsx`**

```tsx
// components/ui/input.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
```

```tsx
// components/ui/label.tsx
"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn("text-sm font-medium leading-none", className)} {...props} />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

```tsx
// components/ui/textarea.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
```

- [ ] **Step 8: Write `components/ui/badge.tsx`, `components/ui/checkbox.tsx`**

```tsx
// components/ui/badge.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    variant: {
      default: "border-transparent bg-primary text-primary-foreground",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

```tsx
// components/ui/checkbox.tsx
"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "h-4 w-4 shrink-0 rounded-sm border border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="h-3 w-3" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
```

- [ ] **Step 9: Write `components/ui/tabs.tsx`, `components/ui/dialog.tsx`**

```tsx
// components/ui/tabs.tsx
"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn("inline-flex items-center gap-1 rounded-md bg-muted p-1", className)} {...props} />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors data-[state=active]:bg-background data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn("mt-4", className)} {...props} />);
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
```

```tsx
// components/ui/dialog.tsx
"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-6 shadow-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("mb-4 text-lg font-semibold", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export { Dialog, DialogTrigger, DialogContent, DialogTitle };
```

- [ ] **Step 10: Write `components/Navigation.tsx`**

```tsx
// components/Navigation.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/match-finden", label: "Match finden" },
  { href: "/nachrichten", label: "Nachrichten" },
  { href: "/profil", label: "Profil" },
];

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!session) return null;

  return (
    <nav className="flex items-center justify-between border-b bg-card px-6 py-3">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-primary">Lunch Match</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "text-sm font-medium text-muted-foreground hover:text-foreground",
              pathname?.startsWith(link.href) && "text-foreground underline underline-offset-4"
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
        Logout
      </Button>
    </nav>
  );
}
```

- [ ] **Step 11: Wire `<Navigation />` into the root layout**

```tsx
// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "Lunch Match",
  description: "Finde jemanden für eine gemeinsame Mittagspause in deiner Nähe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <Providers>
          <Navigation />
          {children}
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 12: Verify manually**

Run: `npm run build`
Expected: `Compiled successfully`, no type errors. Then `npm run dev` and open `http://localhost:3000` — confirm the warm amber/green theme is visible (not default Tailwind gray/blue), and that the nav bar is hidden on the landing page (no session yet) but appears after creating an identity (Task 13's flow).

- [ ] **Step 13: Commit**

```bash
git add lib/utils.ts components tailwind.config.ts app/globals.css app/layout.tsx package.json package-lock.json
git commit -m "feat: add Tailwind design system, shadcn-style UI primitives, and navigation"
```

---

## Task 16: Profile Validation Schema + API Route

**Files:**
- Create: `lib/validation/profile.ts`, `app/api/profile/route.ts`

**Interfaces:**
- Consumes: `auth()` from `@/auth` (Task 11), `prisma` (Task 4), `geocodeAddress` from `lib/geocoding.ts` (Task 9).
- Produces: `profileSchema` (zod) and `ProfileInput` type — reused by the profile page (Task 17); `GET /api/profile` → current user's stored profile fields; `PUT /api/profile` → validates, geocodes `locationQuery`, persists, returns `{ id: string }`.

- [ ] **Step 1: Write `lib/validation/profile.ts`**

```ts
// lib/validation/profile.ts
import { z } from "zod";

export const locationPrecisionValues = ["EXACT", "POSTAL_CODE", "CITY"] as const;
export const karrierelevelValues = [
  "ANGESTELLT",
  "MITTLERES_MANAGEMENT",
  "LEITEND",
  "GESCHAEFTSFUEHRUNG",
] as const;

export const profileSchema = z.object({
  alias: z.string().min(1, "Alias wird benötigt").max(50),
  locationQuery: z.string().min(1, "Standort wird benötigt").max(200),
  locationPrecision: z.enum(locationPrecisionValues),
  branche: z.string().max(100).optional().or(z.literal("")),
  brancheVisible: z.boolean(),
  position: z.string().max(100).optional().or(z.literal("")),
  karrierelevel: z.enum(karrierelevelValues).optional().or(z.literal("")),
  schritteziel: z.coerce.number().int().positive().max(20000).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
```

- [ ] **Step 2: Write `app/api/profile/route.ts`**

```ts
// app/api/profile/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";
import { profileSchema } from "@/lib/validation/profile";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
  }

  return NextResponse.json({
    alias: user.alias,
    locationQuery: user.locationLabel,
    locationPrecision: user.locationPrecision,
    branche: user.branche,
    brancheVisible: user.brancheVisible,
    position: user.position,
    karrierelevel: user.karrierelevel,
    schritteziel: user.schritteziel,
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const geocoded = await geocodeAddress(parsed.data.locationQuery);
  if (!geocoded) {
    return NextResponse.json(
      { error: "Standort konnte nicht gefunden werden. Bitte präzisiere die Angabe." },
      { status: 422 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      alias: parsed.data.alias,
      locationLabel: parsed.data.locationQuery,
      lat: geocoded.lat,
      lng: geocoded.lng,
      locationPrecision: parsed.data.locationPrecision,
      branche: parsed.data.branche || null,
      brancheVisible: parsed.data.brancheVisible,
      position: parsed.data.position || null,
      karrierelevel: parsed.data.karrierelevel || null,
      schritteziel: parsed.data.schritteziel ?? null,
    },
  });

  return NextResponse.json({ id: updated.id });
}
```

- [ ] **Step 3: Verify the project type-checks**

Run: `npm run build`
Expected: `Compiled successfully`. Full behavioral verification (an authenticated request round-trip) happens in Task 17, once the profile page can drive this route from the browser.

- [ ] **Step 4: Commit**

```bash
git add lib/validation/profile.ts app/api/profile
git commit -m "feat: add profile API route with geocoding"
```

---

## Task 17: Profil Page

**Files:**
- Create: `app/profil/page.tsx`

**Interfaces:**
- Consumes: `profileSchema`, `ProfileInput`, `locationPrecisionValues`, `karrierelevelValues` from `lib/validation/profile.ts` (Task 16); `GET`/`PUT /api/profile` (Task 16); `Button`, `Input`, `Label`, `Checkbox` from Task 15.
- Produces: the `/profil` route, the first fully wired end-to-end feature (form → API → DB → back).

- [ ] **Step 1: Write the page**

```tsx
// app/profil/page.tsx
"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  profileSchema,
  type ProfileInput,
  locationPrecisionValues,
  karrierelevelValues,
} from "@/lib/validation/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface ProfileResponse {
  alias: string | null;
  locationQuery: string | null;
  locationPrecision: (typeof locationPrecisionValues)[number] | null;
  branche: string | null;
  brancheVisible: boolean;
  position: string | null;
  karrierelevel: (typeof karrierelevelValues)[number] | null;
  schritteziel: number | null;
}

const precisionLabels: Record<(typeof locationPrecisionValues)[number], string> = {
  EXACT: "Genaue Adresse",
  POSTAL_CODE: "Nur Postleitzahl",
  CITY: "Nur Ort",
};

const karrierelevelLabels: Record<(typeof karrierelevelValues)[number], string> = {
  ANGESTELLT: "Angestellt",
  MITTLERES_MANAGEMENT: "Mittleres Management",
  LEITEND: "Leitender Angestellter",
  GESCHAEFTSFUEHRUNG: "Geschäftsführung",
};

export default function ProfilPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Profil konnte nicht geladen werden.");
      return res.json();
    },
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      alias: "",
      locationQuery: "",
      locationPrecision: "CITY",
      branche: "",
      brancheVisible: false,
      position: "",
      karrierelevel: undefined,
      schritteziel: undefined,
    },
  });

  useEffect(() => {
    if (!data) return;
    reset({
      alias: data.alias ?? "",
      locationQuery: data.locationQuery ?? "",
      locationPrecision: data.locationPrecision ?? "CITY",
      branche: data.branche ?? "",
      brancheVisible: data.brancheVisible,
      position: data.position ?? "",
      karrierelevel: data.karrierelevel ?? undefined,
      schritteziel: data.schritteziel ?? undefined,
    });
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: async (values: ProfileInput) => {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Profil konnte nicht gespeichert werden.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  if (isLoading) {
    return <main className="p-6">Lädt…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Profil</h1>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="alias">Alias</Label>
          <Input id="alias" {...register("alias")} />
          {errors.alias && <p className="text-sm text-red-600">{errors.alias.message}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="locationQuery">Standort (Adresse, PLZ oder Ort)</Label>
          <Input
            id="locationQuery"
            {...register("locationQuery")}
            placeholder="z. B. Musterstraße 1, 12345 Musterstadt"
          />
          {errors.locationQuery && <p className="text-sm text-red-600">{errors.locationQuery.message}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="locationPrecision">Genauigkeit</Label>
          <select
            id="locationPrecision"
            {...register("locationPrecision")}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {locationPrecisionValues.map((value) => (
              <option key={value} value={value}>
                {precisionLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="branche">Branche</Label>
          <Input id="branche" {...register("branche")} />
        </div>

        <Controller
          control={control}
          name="brancheVisible"
          render={({ field }) => (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
              Branche für andere sichtbar machen
            </label>
          )}
        />

        <div className="flex flex-col gap-1">
          <Label htmlFor="position">Berufliche Position</Label>
          <Input id="position" {...register("position")} />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="karrierelevel">Karrierelevel</Label>
          <select
            id="karrierelevel"
            {...register("karrierelevel")}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Keine Angabe</option>
            {karrierelevelValues.map((value) => (
              <option key={value} value={value}>
                {karrierelevelLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="schritteziel">Schritteziel pro Mittagspause</Label>
          <Input id="schritteziel" type="number" {...register("schritteziel")} placeholder="Standard: 1000" />
          {errors.schritteziel && <p className="text-sm text-red-600">{errors.schritteziel.message}</p>}
        </div>

        <Button type="submit" disabled={isSubmitting || mutation.isPending}>
          {mutation.isPending ? "Wird gespeichert…" : "Speichern"}
        </Button>

        {mutation.isSuccess && <p className="text-sm text-accent">Profil gespeichert.</p>}
        {mutation.isError && <p className="text-sm text-red-600">{(mutation.error as Error).message}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, go through Task 13's "Neues Konto erstellen" flow, land on `/profil`.
Expected: form loads with empty fields; filling in Alias + a real address (e.g. "Alexanderplatz, Berlin") + Schritteziel and clicking "Speichern" shows "Profil gespeichert."; reloading the page shows the saved values (confirms `GET`, `PUT`, and geocoding all work together). Entering a nonsense location (e.g. "asdkjfhaskdjfh") shows the "Standort konnte nicht gefunden werden" error instead of a silent failure.

- [ ] **Step 3: Commit**

```bash
git add app/profil
git commit -m "feat: add profile page"
```

---

## Task 18: Match Candidates API Route

**Files:**
- Create: `app/api/match/candidates/route.ts`

**Interfaces:**
- Consumes: `auth()` (Task 11), `prisma` (Task 4), `calculateSearchRadiusMeters`/`metersToSteps` (Task 5), `filterCandidates`/`Candidate`/`MatchFilters` (Task 8), `findMeetingPoints` (Task 10).
- Produces: `GET /api/match/candidates?branche=&position=&karrierelevel=&kueche=&radius=` → `{ radiusMeters, origin, people, meetingPoints }` — consumed by the Match-finden page (Task 19).

- [ ] **Step 1: Write the route handler**

```ts
// app/api/match/candidates/route.ts
import { NextResponse } from "next/server";
import type { Karrierelevel } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateSearchRadiusMeters, metersToSteps } from "@/lib/searchRadius";
import { filterCandidates, type Candidate, type MatchFilters } from "@/lib/matchFilters";
import { findMeetingPoints } from "@/lib/meetingPoints";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!currentUser || currentUser.lat == null || currentUser.lng == null) {
    return NextResponse.json({ error: "Profil unvollständig: Standort fehlt." }, { status: 400 });
  }

  const url = new URL(request.url);
  const branche = url.searchParams.get("branche") ?? undefined;
  const position = url.searchParams.get("position") ?? undefined;
  const karrierelevelParam = url.searchParams.get("karrierelevel") ?? undefined;
  const kuecheParam = url.searchParams.get("kueche");
  const radiusOverrideParam = url.searchParams.get("radius");

  const filters: MatchFilters = {
    branche,
    position,
    karrierelevel: karrierelevelParam as Karrierelevel | undefined,
  };

  const radiusMeters = radiusOverrideParam
    ? Number(radiusOverrideParam)
    : calculateSearchRadiusMeters(currentUser.schritteziel);

  const origin = { lat: currentUser.lat, lng: currentUser.lng };

  const otherUsers = await prisma.user.findMany({
    where: { id: { not: currentUser.id }, lat: { not: null }, lng: { not: null } },
  });

  const candidates: Candidate[] = otherUsers.map((u) => ({
    id: u.id,
    alias: u.alias,
    lat: u.lat as number,
    lng: u.lng as number,
    branche: u.branche,
    brancheVisible: u.brancheVisible,
    position: u.position,
    karrierelevel: u.karrierelevel,
  }));

  const people = filterCandidates(candidates, origin, radiusMeters, filters).map((c) => ({
    id: c.id,
    alias: c.alias,
    distanceMeters: c.distanceMeters,
    distanceSteps: metersToSteps(c.distanceMeters),
    branche: c.brancheVisible ? c.branche : null,
    position: c.position,
    karrierelevel: c.karrierelevel,
    lat: c.lat,
    lng: c.lng,
  }));

  const cuisineFilter = kuecheParam === "vegetarian" || kuecheParam === "vegan" ? kuecheParam : undefined;
  const meetingPoints = await findMeetingPoints(origin, radiusMeters, cuisineFilter);

  return NextResponse.json({ radiusMeters, origin, people, meetingPoints });
}
```

- [ ] **Step 2: Verify the project type-checks**

Run: `npm run build`
Expected: `Compiled successfully`. Full behavioral verification happens in Task 19 (needs a second profile to see results — covered by Task 24's seed data).

- [ ] **Step 3: Commit**

```bash
git add app/api/match
git commit -m "feat: add match-candidates API route"
```

---

## Task 19: Match-Finden Page (Map + List + Filter + Match-Me)

**Files:**
- Create: `app/match-finden/page.tsx`, `app/match-finden/MapView.tsx`, `app/match-finden/RequestDialog.tsx`

**Interfaces:**
- Consumes: `GET /api/match/candidates` (Task 18), `POST /api/match-requests` (Task 20), `karrierelevelValues` from `lib/validation/profile.ts` (Task 16), `Button`/`Card`/`Input`/`Label`/`Dialog`/`Textarea` (Task 15).
- Produces: the `/match-finden` route with filters for Branche, berufliche Position, Karrierelevel, gastronomisches Angebot, and an overridable Suchradius (all five filter dimensions from the spec's "Match finden" section); `<MapView>` component (dynamically imported, client-only, no SSR — Leaflet needs `window`); `<RequestDialog>` component reused nowhere else but kept local to this route since it's specific to composing a manual request here.

- [ ] **Step 1: Write `app/match-finden/MapView.tsx`**

```tsx
// app/match-finden/MapView.tsx
"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon paths don't resolve under Next.js's bundler; point them at the CDN instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapPerson {
  id: string;
  alias: string | null;
  lat: number;
  lng: number;
}

export interface MapMeetingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface MapViewProps {
  origin: { lat: number; lng: number };
  people: MapPerson[];
  meetingPoints: MapMeetingPoint[];
  selectedId: string | null;
  onSelectPerson: (id: string) => void;
}

function RecenterOnOrigin({ origin }: { origin: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView([origin.lat, origin.lng], map.getZoom());
  }, [origin, map]);
  return null;
}

export function MapView({ origin, people, meetingPoints, selectedId, onSelectPerson }: MapViewProps) {
  return (
    <MapContainer center={[origin.lat, origin.lng]} zoom={15} className="h-80 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <RecenterOnOrigin origin={origin} />
      <Marker position={[origin.lat, origin.lng]}>
        <Popup>Dein Standort</Popup>
      </Marker>
      {people.map((person) => (
        <Marker
          key={person.id}
          position={[person.lat, person.lng]}
          eventHandlers={{ click: () => onSelectPerson(person.id) }}
          opacity={selectedId && selectedId !== person.id ? 0.6 : 1}
        >
          <Popup>{person.alias ?? "Teilnehmende Person"}</Popup>
        </Marker>
      ))}
      {meetingPoints.map((point) => (
        <Marker key={point.id} position={[point.lat, point.lng]}>
          <Popup>{point.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

- [ ] **Step 2: Write `app/match-finden/RequestDialog.tsx`**

```tsx
// app/match-finden/RequestDialog.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const schema = z.object({
  message: z.string().min(1, "Nachricht darf nicht leer sein").max(2000),
});

type FormValues = z.infer<typeof schema>;

interface RequestDialogProps {
  person: { id: string; alias: string | null };
  onClose: () => void;
  onSent: (matchRequestId: string) => void;
}

export function RequestDialog({ person, onClose, onSent }: RequestDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const sendRequestMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await fetch("/api/match-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: person.id, type: "MANUAL", message: values.message }),
      });
      if (!res.ok) throw new Error("Anfrage konnte nicht gesendet werden.");
      return (await res.json()) as { id: string };
    },
    onSuccess: (created) => onSent(created.id),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Anfrage an {person.alias ?? "Teilnehmende Person"}</DialogTitle>
        <form
          onSubmit={handleSubmit((values) => sendRequestMutation.mutate(values))}
          className="flex flex-col gap-3"
        >
          <Textarea {...register("message")} placeholder="Deine Nachricht…" rows={4} />
          {errors.message && <p className="text-sm text-red-600">{errors.message.message}</p>}
          <Button type="submit" disabled={sendRequestMutation.isPending}>
            {sendRequestMutation.isPending ? "Wird gesendet…" : "Senden"}
          </Button>
          {sendRequestMutation.isError && (
            <p className="text-sm text-red-600">{(sendRequestMutation.error as Error).message}</p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Write `app/match-finden/page.tsx`**

```tsx
// app/match-finden/page.tsx
"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { karrierelevelValues } from "@/lib/validation/profile";
import { RequestDialog } from "./RequestDialog";

const MapView = dynamic(() => import("./MapView").then((mod) => mod.MapView), { ssr: false });

interface CandidatePerson {
  id: string;
  alias: string | null;
  distanceMeters: number;
  distanceSteps: number;
  branche: string | null;
  position: string | null;
  karrierelevel: (typeof karrierelevelValues)[number] | null;
  lat: number;
  lng: number;
}

interface MeetingPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

interface CandidatesResponse {
  radiusMeters: number;
  origin: { lat: number; lng: number };
  people: CandidatePerson[];
  meetingPoints: MeetingPoint[];
}

const karrierelevelLabels: Record<(typeof karrierelevelValues)[number], string> = {
  ANGESTELLT: "Angestellt",
  MITTLERES_MANAGEMENT: "Mittleres Management",
  LEITEND: "Leitender Angestellter",
  GESCHAEFTSFUEHRUNG: "Geschäftsführung",
};

export default function MatchFindenPage() {
  const router = useRouter();
  const [branche, setBranche] = useState("");
  const [position, setPosition] = useState("");
  const [karrierelevel, setKarrierelevel] = useState("");
  const [kueche, setKueche] = useState("");
  const [radiusOverride, setRadiusOverride] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<CandidatePerson | null>(null);

  const searchParams = new URLSearchParams();
  if (branche) searchParams.set("branche", branche);
  if (position) searchParams.set("position", position);
  if (karrierelevel) searchParams.set("karrierelevel", karrierelevel);
  if (kueche) searchParams.set("kueche", kueche);
  if (radiusOverride) searchParams.set("radius", radiusOverride);

  const { data, isLoading, error } = useQuery<CandidatesResponse>({
    queryKey: ["match-candidates", branche, position, karrierelevel, kueche, radiusOverride],
    queryFn: async () => {
      const res = await fetch(`/api/match/candidates?${searchParams.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Suche fehlgeschlagen.");
      }
      return res.json();
    },
  });

  const people = useMemo(() => data?.people ?? [], [data]);

  const matchMeMutation = useMutation({
    mutationFn: async () => {
      if (people.length === 0) throw new Error("Keine Personen im Suchradius gefunden.");
      const random = people[Math.floor(Math.random() * people.length)];
      const res = await fetch("/api/match-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: random.id,
          type: "MATCH_ME",
          message: "möchte mit dir eine gemeinsame Mittagspause verbringen.",
        }),
      });
      if (!res.ok) throw new Error("Anfrage konnte nicht gesendet werden.");
      return (await res.json()) as { id: string };
    },
    onSuccess: (created) => router.push(`/nachrichten/${created.id}`),
  });

  if (isLoading) return <main className="p-6">Lädt…</main>;
  if (error) return <main className="p-6 text-red-600">{(error as Error).message}</main>;
  if (!data) return null;

  return (
    <main className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-4">
        <h2 className="font-semibold">Filter</h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="branche-filter">Branche</Label>
          <Input
            id="branche-filter"
            value={branche}
            onChange={(event) => setBranche(event.target.value)}
            placeholder="z. B. IT"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="position-filter">Berufliche Position</Label>
          <Input
            id="position-filter"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            placeholder="z. B. Entwicklerin"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="karrierelevel-filter">Karrierelevel</Label>
          <select
            id="karrierelevel-filter"
            value={karrierelevel}
            onChange={(event) => setKarrierelevel(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Alle</option>
            {karrierelevelValues.map((value) => (
              <option key={value} value={value}>
                {karrierelevelLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="kueche-filter">Gastronomisches Angebot</Label>
          <select
            id="kueche-filter"
            value={kueche}
            onChange={(event) => setKueche(event.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Egal</option>
            <option value="vegetarian">Vegetarisch</option>
            <option value="vegan">Vegan</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="radius-filter">Suchradius (Meter)</Label>
          <Input
            id="radius-filter"
            type="number"
            value={radiusOverride}
            onChange={(event) => setRadiusOverride(event.target.value)}
            placeholder={`Standard: ${Math.round(data.radiusMeters)} m`}
          />
        </div>
        <Button onClick={() => matchMeMutation.mutate()} disabled={people.length === 0 || matchMeMutation.isPending}>
          Match me
        </Button>
        {matchMeMutation.isError && (
          <p className="text-sm text-red-600">{(matchMeMutation.error as Error).message}</p>
        )}
      </aside>

      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Match finden</h1>
        <MapView
          origin={data.origin}
          people={people}
          meetingPoints={data.meetingPoints}
          selectedId={selectedId}
          onSelectPerson={setSelectedId}
        />
        <div className="flex flex-col gap-3">
          {people.length === 0 && <p className="text-muted-foreground">Keine Personen im Suchradius gefunden.</p>}
          {people.map((person) => (
            <Card
              key={person.id}
              className={person.id === selectedId ? "border-primary" : undefined}
              onClick={() => setSelectedId(person.id)}
            >
              <CardHeader>
                <CardTitle>{person.alias ?? "Teilnehmende Person"}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {person.distanceSteps} Schritte entfernt
                {person.branche && ` · ${person.branche}`}
                {person.position && ` · ${person.position}`}
              </CardContent>
              <CardFooter>
                <Button size="sm" onClick={() => setRequestTarget(person)}>
                  Anfragen
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {requestTarget && (
        <RequestDialog
          person={requestTarget}
          onClose={() => setRequestTarget(null)}
          onSent={(id) => router.push(`/nachrichten/${id}`)}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify manually**

Run: `npm run build` (confirms no type errors), then `npm run dev`.
Expected: `/match-finden` shows a map centered on your profile location; with only one account created so far the list correctly shows "Keine Personen im Suchradius gefunden." and the "Match me" button is disabled (per `US:MatchAnfrageZuaellig` Szenario 2). Full two-person verification happens in Task 24 once seed data exists.

- [ ] **Step 5: Commit**

```bash
git add app/match-finden
git commit -m "feat: add match-finden page with map, list, filters, and match-me"
```

---

## Task 20: Match-Request Creation + List API

**Files:**
- Create: `lib/validation/matchRequest.ts`, `app/api/match-requests/route.ts`

**Interfaces:**
- Consumes: `auth()` (Task 11), `prisma` (Task 4).
- Produces: `createMatchRequestSchema`/`CreateMatchRequestInput`, `updateMatchRequestSchema`/`UpdateMatchRequestInput` (the latter consumed by Task 21) from `lib/validation/matchRequest.ts`; `POST /api/match-requests` → `{ id: string }` (consumed by Task 19's Match-Me button and `RequestDialog`); `GET /api/match-requests?status=` → `MatchRequestSummary[]` (consumed by Task 22).

- [ ] **Step 1: Write `lib/validation/matchRequest.ts`**

```ts
// lib/validation/matchRequest.ts
import { z } from "zod";

export const createMatchRequestSchema = z.object({
  toUserId: z.string().min(1),
  type: z.enum(["MANUAL", "MATCH_ME"]),
  message: z.string().min(1).max(2000),
});

export type CreateMatchRequestInput = z.infer<typeof createMatchRequestSchema>;

export const updateMatchRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]).optional(),
  meetingPointQuery: z.string().min(1).max(200).optional(),
});

export type UpdateMatchRequestInput = z.infer<typeof updateMatchRequestSchema>;
```

- [ ] **Step 2: Write `app/api/match-requests/route.ts`**

```ts
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
```

- [ ] **Step 3: Verify the project type-checks**

Run: `npm run build`
Expected: `Compiled successfully`. Behavioral verification happens together with Task 19 (already exercises `POST`) and Task 22 (exercises `GET`).

- [ ] **Step 4: Commit**

```bash
git add lib/validation/matchRequest.ts app/api/match-requests/route.ts
git commit -m "feat: add match-request creation and list API"
```

---

## Task 21: Match-Request Detail + Messages API

**Files:**
- Create: `lib/getAuthorizedMatchRequest.ts`, `lib/validation/message.ts`, `app/api/match-requests/[id]/route.ts`, `app/api/match-requests/[id]/messages/route.ts`

**Interfaces:**
- Consumes: `auth()` (Task 11), `prisma` (Task 4), `geocodeAddress` (Task 9), `updateMatchRequestSchema` (Task 20).
- Produces: `getAuthorizedMatchRequest(matchRequestId, userId)` (returns the `MatchRequest` with `fromUser`/`toUser` included, or `null` if not found/not a participant); `sendMessageSchema`/`SendMessageInput`; `GET /api/match-requests/[id]` → detail incl. `canRespond`; `PATCH /api/match-requests/[id]` → status/meeting-point updates; `GET`/`POST /api/match-requests/[id]/messages` — all consumed by Task 23.

- [ ] **Step 1: Write `lib/getAuthorizedMatchRequest.ts`**

```ts
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
```

- [ ] **Step 2: Write `lib/validation/message.ts`**

```ts
// lib/validation/message.ts
import { z } from "zod";

export const sendMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
```

- [ ] **Step 3: Write `app/api/match-requests/[id]/route.ts`**

```ts
// app/api/match-requests/[id]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { updateMatchRequestSchema } from "@/lib/validation/matchRequest";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const counterpart = matchRequest.fromUserId === session.user.id ? matchRequest.toUser : matchRequest.fromUser;

  return NextResponse.json({
    id: matchRequest.id,
    status: matchRequest.status,
    type: matchRequest.type,
    counterpartAlias: counterpart.alias,
    meetingPointName: matchRequest.meetingPointName,
    meetingPointLat: matchRequest.meetingPointLat,
    meetingPointLng: matchRequest.meetingPointLng,
    canRespond: matchRequest.toUserId === session.user.id,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateMatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let meetingPointUpdate = {};
  if (parsed.data.meetingPointQuery) {
    const geocoded = await geocodeAddress(parsed.data.meetingPointQuery);
    if (!geocoded) {
      return NextResponse.json(
        { error: "Treffpunkt konnte nicht gefunden werden. Bitte präzisiere die Angabe." },
        { status: 422 }
      );
    }
    meetingPointUpdate = {
      meetingPointName: parsed.data.meetingPointQuery,
      meetingPointLat: geocoded.lat,
      meetingPointLng: geocoded.lng,
    };
  }

  const updated = await prisma.matchRequest.update({
    where: { id: matchRequest.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...meetingPointUpdate,
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
```

- [ ] **Step 4: Write `app/api/match-requests/[id]/messages/route.ts`**

```ts
// app/api/match-requests/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { sendMessageSchema } from "@/lib/validation/message";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { matchRequestId: matchRequest.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(
    messages.map((m) => ({ id: m.id, text: m.text, senderId: m.senderId, createdAt: m.createdAt }))
  );
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const message = await prisma.message.create({
    data: { matchRequestId: matchRequest.id, senderId: session.user.id, text: parsed.data.text },
  });

  return NextResponse.json({ id: message.id });
}
```

- [ ] **Step 5: Verify the project type-checks**

Run: `npm run build`
Expected: `Compiled successfully`. Full behavioral verification happens in Task 23.

- [ ] **Step 6: Commit**

```bash
git add lib/getAuthorizedMatchRequest.ts lib/validation/message.ts app/api/match-requests
git commit -m "feat: add match-request detail and messages API"
```

---

## Task 22: Nachrichten-Übersicht Page

**Files:**
- Create: `app/nachrichten/page.tsx`

**Interfaces:**
- Consumes: `GET /api/match-requests?status=` (Task 20); `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Badge` (Task 15).
- Produces: the `/nachrichten` route, linking to `/nachrichten/[id]` (Task 23).

- [ ] **Step 1: Write the page**

```tsx
// app/nachrichten/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface MatchRequestSummary {
  id: string;
  status: "OPEN" | "ACCEPTED" | "DECLINED";
  type: "MANUAL" | "MATCH_ME";
  createdAt: string;
  counterpartAlias: string | null;
}

const statusLabels: Record<MatchRequestSummary["status"], string> = {
  OPEN: "Offen",
  ACCEPTED: "Zugesagt",
  DECLINED: "Abgesagt",
};

const tabs = [
  { value: "", label: "Alle" },
  { value: "OPEN", label: "Offen" },
  { value: "ACCEPTED", label: "Zugesagt" },
  { value: "DECLINED", label: "Abgesagt" },
];

export default function NachrichtenPage() {
  const [status, setStatus] = useState("");

  const { data, isLoading } = useQuery<MatchRequestSummary[]>({
    queryKey: ["match-requests", status],
    queryFn: async () => {
      const query = status ? `?status=${status}` : "";
      const res = await fetch(`/api/match-requests${query}`);
      if (!res.ok) throw new Error("Nachrichten konnten nicht geladen werden.");
      return res.json();
    },
  });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Nachrichten</h1>
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status}>
          {isLoading && <p>Lädt…</p>}
          {!isLoading && data?.length === 0 && <p className="text-muted-foreground">Keine Nachrichten.</p>}
          <div className="flex flex-col gap-3">
            {data?.map((mr) => (
              <Link key={mr.id} href={`/nachrichten/${mr.id}`}>
                <Card>
                  <CardHeader className="flex-row items-center justify-between">
                    <CardTitle>{mr.counterpartAlias ?? "Teilnehmende Person"}</CardTitle>
                    <Badge variant={mr.status === "OPEN" ? "outline" : "default"}>{statusLabels[mr.status]}</Badge>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {new Date(mr.createdAt).toLocaleDateString("de-DE")}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open `http://localhost:3000/nachrichten`
Expected: shows "Keine Nachrichten." before any request has been sent; after using "Match me" or "Anfragen" from Task 19, the sent request appears under "Alle" and "Offen". Full two-account verification happens in Task 24.

- [ ] **Step 3: Commit**

```bash
git add app/nachrichten/page.tsx
git commit -m "feat: add nachrichten overview page"
```

---

## Task 23: Nachrichten-Detail Page

**Files:**
- Create: `app/nachrichten/[id]/page.tsx`, `app/nachrichten/[id]/SingleMarkerMap.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/match-requests/[id]`, `GET`/`POST /api/match-requests/[id]/messages` (Task 21); `Button`/`Card`/`Input`/`Textarea` (Task 15).
- Produces: the `/nachrichten/[id]` route.

- [ ] **Step 1: Write `app/nachrichten/[id]/SingleMarkerMap.tsx`**

```tsx
// app/nachrichten/[id]/SingleMarkerMap.tsx
"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface SingleMarkerMapProps {
  lat: number;
  lng: number;
  label: string;
}

export function SingleMarkerMap({ lat, lng, label }: SingleMarkerMapProps) {
  return (
    <MapContainer center={[lat, lng]} zoom={16} className="h-48 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]}>
        <Popup>{label}</Popup>
      </Marker>
    </MapContainer>
  );
}
```

- [ ] **Step 2: Write `app/nachrichten/[id]/page.tsx`**

```tsx
// app/nachrichten/[id]/page.tsx
"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const SingleMarkerMap = dynamic(() => import("./SingleMarkerMap").then((m) => m.SingleMarkerMap), { ssr: false });

interface MatchRequestDetail {
  id: string;
  status: "OPEN" | "ACCEPTED" | "DECLINED";
  type: "MANUAL" | "MATCH_ME";
  counterpartAlias: string | null;
  meetingPointName: string | null;
  meetingPointLat: number | null;
  meetingPointLng: number | null;
  canRespond: boolean;
}

interface MessageItem {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

const meetingPointSchema = z.object({ meetingPointQuery: z.string().min(1).max(200) });
const messageSchema = z.object({ text: z.string().min(1).max(2000) });

export default function NachrichtenDetailPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [statusError, setStatusError] = useState<string | null>(null);

  const { data: matchRequest, isLoading } = useQuery<MatchRequestDetail>({
    queryKey: ["match-request", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/match-requests/${params.id}`);
      if (!res.ok) throw new Error("Nicht gefunden.");
      return res.json();
    },
  });

  const { data: messages } = useQuery<MessageItem[]>({
    queryKey: ["match-request-messages", params.id],
    queryFn: async () => {
      const res = await fetch(`/api/match-requests/${params.id}/messages`);
      if (!res.ok) throw new Error("Nachrichten konnten nicht geladen werden.");
      return res.json();
    },
    refetchInterval: 4000,
  });

  const statusMutation = useMutation({
    mutationFn: async (status: "ACCEPTED" | "DECLINED") => {
      const res = await fetch(`/api/match-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Status konnte nicht aktualisiert werden.");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["match-request", params.id] }),
    onError: () => setStatusError("Status konnte nicht aktualisiert werden."),
  });

  const meetingPointForm = useForm<z.infer<typeof meetingPointSchema>>({
    resolver: zodResolver(meetingPointSchema),
  });
  const meetingPointMutation = useMutation({
    mutationFn: async (values: z.infer<typeof meetingPointSchema>) => {
      const res = await fetch(`/api/match-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Treffpunkt konnte nicht gespeichert werden.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
      meetingPointForm.reset();
    },
  });

  const messageForm = useForm<z.infer<typeof messageSchema>>({ resolver: zodResolver(messageSchema) });
  const sendMessageMutation = useMutation({
    mutationFn: async (values: z.infer<typeof messageSchema>) => {
      const res = await fetch(`/api/match-requests/${params.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Nachricht konnte nicht gesendet werden.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request-messages", params.id] });
      messageForm.reset();
    },
  });

  if (isLoading || !matchRequest) return <main className="p-6">Lädt…</main>;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Treffen mit {matchRequest.counterpartAlias ?? "Teilnehmende Person"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Treffpunkt</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {matchRequest.meetingPointLat != null && matchRequest.meetingPointLng != null ? (
            <>
              <p>{matchRequest.meetingPointName}</p>
              <SingleMarkerMap
                lat={matchRequest.meetingPointLat}
                lng={matchRequest.meetingPointLng}
                label={matchRequest.meetingPointName ?? ""}
              />
            </>
          ) : (
            <p className="text-muted-foreground">Noch kein Treffpunkt festgelegt.</p>
          )}
          <form
            onSubmit={meetingPointForm.handleSubmit((values) => meetingPointMutation.mutate(values))}
            className="flex gap-2"
          >
            <Input placeholder="Treffpunkt vorschlagen…" {...meetingPointForm.register("meetingPointQuery")} />
            <Button type="submit" disabled={meetingPointMutation.isPending}>
              Vorschlagen
            </Button>
          </form>
          {meetingPointMutation.isError && (
            <p className="text-sm text-red-600">{(meetingPointMutation.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      {matchRequest.canRespond && matchRequest.status === "OPEN" && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => statusMutation.mutate("DECLINED")}>
            Absagen
          </Button>
          <Button onClick={() => statusMutation.mutate("ACCEPTED")}>Zusagen</Button>
        </div>
      )}
      {statusError && <p className="text-sm text-red-600">{statusError}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Nachrichten</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {messages?.map((message) => (
            <div key={message.id} className="rounded border p-2 text-sm">
              {message.text}
            </div>
          ))}
          <form
            onSubmit={messageForm.handleSubmit((values) => sendMessageMutation.mutate(values))}
            className="flex flex-col gap-2"
          >
            <Textarea placeholder="Nachricht…" {...messageForm.register("text")} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => messageForm.reset()}>
                Zurücksetzen
              </Button>
              <Button type="submit" disabled={sendMessageMutation.isPending}>
                Absenden
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`, open a request created in Task 19/22.
Expected: page shows the counterpart alias, "Noch kein Treffpunkt festgelegt." initially; proposing a real place (e.g. "Alexanderplatz, Berlin") shows a map with a marker; "Zusagen"/"Absagen" are only visible to the request's recipient, and clicking either updates the status (verify by reloading — the buttons disappear once responded). Full two-account verification happens in Task 24.

- [ ] **Step 4: Commit**

```bash
git add app/nachrichten/[id]
git commit -m "feat: add nachrichten detail page with meeting-point map and chat"
```

---

## Task 24: Seed Script + Full Manual End-to-End Walkthrough

**Files:**
- Create: `prisma/seed.ts`

**Interfaces:**
- Consumes: `generateAccountId`, `generateRecoveryKey`, `hashRecoveryKey` from `lib/identity.ts` (Task 7).
- Produces: two demo `User` rows ~340m apart in central Berlin (within the default 732m radius), with their Account-ID/Recovery-Key printed to the console — used only to drive the manual walkthrough below, since v1 has no automated E2E per the spec.

- [ ] **Step 1: Write `prisma/seed.ts`**

```ts
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
```

- [ ] **Step 2: Run the seed script**

Run: `npm run db:seed`
Expected: prints two lines like `Demo-Nutzerin A: accountId=AB12CD34EF recoveryKey=...` and `Demo-Nutzer B: accountId=... recoveryKey=...`. **Copy both accountId/recoveryKey pairs somewhere — they're needed below and cannot be retrieved again.**

- [ ] **Step 3: Full manual walkthrough**

Run: `npm run dev`, open `http://localhost:3000` in the browser (use a private/incognito window for the second account so both sessions can be open at once).

Expected, step by step:

1. Go to `/konto-wiederherstellen`, sign in as **Demo-Nutzerin A** using her printed Account-ID/Recovery-Key → redirected to `/profil`, form is pre-filled with her seeded data.
2. Go to `/match-finden` → the map is centered near Alexanderplatz; **Nutzer B** appears both as a list card ("~340 Schritte entfernt" or similar) and as a map marker; the "Match me" button is enabled.
3. Click "Anfragen" on Nutzer B's card, type a message, send → redirected to `/nachrichten/<id>`; the page shows "Treffen mit Nutzer B" and "Noch kein Treffpunkt festgelegt."
4. Propose a meeting point (e.g. "Hackescher Markt, Berlin") → a map with a marker appears.
5. In a private/incognito window, go to `/konto-wiederherstellen` and sign in as **Demo-Nutzer B** → go to `/nachrichten` → the request from Nutzerin A appears under "Offen" with the message and proposed meeting point visible.
6. Click "Zusagen" as Nutzer B → reload `/nachrichten` in *both* windows → the request now shows under "Zugesagt" for both accounts, and the Zusagen/Absagen buttons are gone.
7. Send a reply from Nutzer B's window, then switch back to Nutzerin A's window and wait a few seconds (polling) → her chat view should show Nutzer B's reply without a manual reload.
8. Back on `/match-finden` as Nutzerin A, set the Karrierelevel filter to "Geschäftsführung" → the list becomes empty and the map shows no marker for Nutzer B (confirms filtering works); reset the filter to "Alle" → Nutzer B reappears.
9. As Nutzerin A, click "Match me" a second time (targeting Nutzer B again, since he's the only candidate) → confirm a second, independent match request is created (visible as a second entry in `/nachrichten`).

If any step fails, treat it as a bug in the task that owns the broken behavior — fix there rather than patching around it here.

- [ ] **Step 4: Run the full automated test suite one more time**

Run: `npm test`
Expected: all Vitest suites from Tasks 2, 5–10 pass (`smoke`, `searchRadius`, `geo`, `identity`, `matchFilters`, `geocoding`, `meetingPoints`).

- [ ] **Step 5: Final build check and commit**

Run: `npm run build`
Expected: `Compiled successfully`.

```bash
git add prisma/seed.ts
git commit -m "chore: add demo-user seed script and complete v1 manual walkthrough"
```

---

## Summary

After Task 24, v1 is feature-complete per the spec: anonymous identity creation/recovery, profile with geocoded location, Match-finden (map + list + filters + Match-Me), and a full request/chat/accept-decline flow — with pure logic (search radius, geo distance, identity hashing, matching filters, and the two external API clients) covered by Vitest, and every UI flow walked through manually end-to-end with two real accounts. Dashboard/Gamification, Favoriten, and real fitness-tracker sync remain for v2, as scoped in the spec.

