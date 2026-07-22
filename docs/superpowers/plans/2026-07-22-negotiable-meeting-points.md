# Negotiable meeting points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the meeting point into a negotiation — one person proposes a place, the other accepts / rejects / counters, until both agree — shown inline in the chat.

**Architecture:** A new `MeetingPointProposal` table logs proposals; the existing flat `MatchRequest.meetingPoint*` fields stay as the agreed-point source of truth (written on accept). A proposals sub-resource API (POST propose/counter, PATCH accept/reject) replaces today's instant-apply. Two pure helpers carry the state-machine and timeline-merge logic. The detail page gains a status header, accept/reject controls, and proposal cards interleaved with messages.

**Tech Stack:** Next.js (app router) API routes, Prisma (PostgreSQL), Zod, TanStack Query, Vitest, TypeScript.

## Global Constraints

- **Agreed point = flat `MatchRequest.meetingPointName/Lat/Lng`.** Accepting a proposal writes these; nothing else writes them. The map/header read them unchanged.
- **One PENDING proposal per request at a time**, enforced in the API inside a transaction.
- **Only the counterpart responds** to a pending proposal (`proposal.proposedById !== viewerId`). The proposer of a pending proposal cannot propose again (409); no withdraw.
- **Counter = supersede + create:** proposing while the counterpart's proposal is pending marks the pending one `SUPERSEDED` and creates the poster's new `PENDING`, in one transaction.
- **Gating unchanged:** negotiation available whenever the request is not closed (`status` not DECLINED/WITHDRAWN).
- **German UI + error copy.** Reuse existing messages verbatim where noted.
- **Statuses:** `PENDING | ACCEPTED | REJECTED | SUPERSEDED`.
- **Test runner:** `npm run test` (Vitest); tests in `lib/__tests__/`. Routes and page are not unit-tested (codebase convention).
- **DB is PostgreSQL** — Prisma enums are supported.

---

### Task 1: Schema — `MeetingPointProposal` model + migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: the `MeetingPointProposal` model + `MeetingPointProposalStatus` enum + relations that all later tasks use.

- [ ] **Step 1: Add the enum**

In `prisma/schema.prisma`, after the existing `MatchStatus` enum block, add:

```prisma
enum MeetingPointProposalStatus {
  PENDING
  ACCEPTED
  REJECTED
  SUPERSEDED
}
```

- [ ] **Step 2: Add the model**

After the `MatchRequest` model block, add:

```prisma
model MeetingPointProposal {
  id             String   @id @default(cuid())
  matchRequestId String
  proposedById   String
  name           String
  lat            Float
  lng            Float
  status         MeetingPointProposalStatus @default(PENDING)
  createdAt      DateTime @default(now())
  resolvedAt     DateTime?

  matchRequest MatchRequest @relation(fields: [matchRequestId], references: [id])
  proposedBy   User         @relation(fields: [proposedById], references: [id])

  @@index([matchRequestId])
}
```

- [ ] **Step 3: Add the back-relations**

In the `MatchRequest` model, add to its relation block (next to `messages Message[]`):

```prisma
  proposals MeetingPointProposal[]
```

In the `User` model, add alongside its other relations (e.g. after `receivedRequests`):

```prisma
  meetingPointProposals MeetingPointProposal[]
```

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_meeting_point_proposals`
Expected: a new folder under `prisma/migrations/…_add_meeting_point_proposals` is created, the migration applies cleanly, and the Prisma client regenerates. If `DATABASE_URL` is unreachable, STOP and report BLOCKED (do not hand-edit migrations).

- [ ] **Step 5: Verify types and the suite**

Run: `npx prisma generate && npx tsc --noEmit && npm run test`
Expected: client generates, `tsc` clean, all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: MeetingPointProposal model for negotiable meeting points"
```

---

### Task 2: Pure helpers — negotiation state + timeline merge

Two small pure modules, both TDD. The only unit-tested task.

**Files:**
- Create: `lib/meetingPointNegotiation.ts`
- Create: `lib/timeline.ts`
- Test: `lib/__tests__/meetingPointNegotiation.test.ts`
- Test: `lib/__tests__/timeline.test.ts`

**Interfaces:**
- Produces (later tasks rely on these exact names/types):
  - `lib/meetingPointNegotiation.ts`: `ProposalStatus`, `Proposal`, `HeaderState`, `NegotiationState`, `deriveNegotiationState(proposals: Proposal[], hasAgreedPoint: boolean, viewerId: string): NegotiationState`
  - `lib/timeline.ts`: `MessageItem`, `TimelineEntry`, `mergeTimeline(messages: MessageItem[], proposals: Proposal[]): TimelineEntry[]`

- [ ] **Step 1: Write the failing tests for the negotiation helper**

Create `lib/__tests__/meetingPointNegotiation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveNegotiationState, type Proposal } from "@/lib/meetingPointNegotiation";

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    proposedById: "alice",
    name: "Café X",
    lat: 52.5,
    lng: 13.4,
    status: "PENDING",
    createdAt: "2026-07-22T10:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

describe("deriveNegotiationState", () => {
  it("is 'none' with no proposals and no agreed point", () => {
    const s = deriveNegotiationState([], false, "alice");
    expect(s.headerState).toBe("none");
    expect(s.pendingProposal).toBeNull();
    expect(s.canRespond).toBe(false);
    expect(s.canPropose).toBe(true);
  });

  it("is 'agreed' with an agreed point and nothing pending", () => {
    const resolved = proposal({ status: "ACCEPTED", resolvedAt: "2026-07-22T11:00:00.000Z" });
    const s = deriveNegotiationState([resolved], true, "bob");
    expect(s.headerState).toBe("agreed");
    expect(s.pendingProposal).toBeNull();
    expect(s.canPropose).toBe(true);
  });

  it("is 'pending-awaiting-you' for the counterpart of a pending proposal", () => {
    const s = deriveNegotiationState([proposal({ proposedById: "alice" })], false, "bob");
    expect(s.headerState).toBe("pending-awaiting-you");
    expect(s.canRespond).toBe(true);
    expect(s.canPropose).toBe(true); // counterpart may counter
    expect(s.pendingProposal?.id).toBe("p1");
  });

  it("is 'pending-awaiting-them' for the proposer of a pending proposal", () => {
    const s = deriveNegotiationState([proposal({ proposedById: "alice" })], false, "alice");
    expect(s.headerState).toBe("pending-awaiting-them");
    expect(s.canRespond).toBe(false);
    expect(s.canPropose).toBe(false); // proposer can't propose again while pending
  });

  it("ignores non-PENDING proposals when finding the pending one", () => {
    const s = deriveNegotiationState(
      [
        proposal({ id: "old", status: "SUPERSEDED" }),
        proposal({ id: "rej", status: "REJECTED" }),
      ],
      false,
      "bob"
    );
    expect(s.pendingProposal).toBeNull();
    expect(s.headerState).toBe("none");
  });

  it("keeps the agreed point during a reopening (pending + agreed both present)", () => {
    // A new pending proposal exists while an earlier one was accepted.
    const s = deriveNegotiationState(
      [proposal({ id: "acc", status: "ACCEPTED" }), proposal({ id: "new", proposedById: "bob" })],
      true,
      "alice"
    );
    expect(s.pendingProposal?.id).toBe("new");
    expect(s.headerState).toBe("pending-awaiting-you"); // alice must respond to bob's new one
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- meetingPointNegotiation`
Expected: FAIL — cannot resolve `@/lib/meetingPointNegotiation`.

- [ ] **Step 3: Implement the negotiation helper**

Create `lib/meetingPointNegotiation.ts`:

```ts
export type ProposalStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";

export interface Proposal {
  id: string;
  proposedById: string;
  name: string;
  lat: number;
  lng: number;
  status: ProposalStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export type HeaderState =
  | "none" // no agreed point, no pending proposal
  | "pending-awaiting-you" // a pending proposal the viewer must respond to
  | "pending-awaiting-them" // the viewer's own pending proposal
  | "agreed"; // an agreed point exists, nothing pending

export interface NegotiationState {
  pendingProposal: Proposal | null;
  canRespond: boolean;
  canPropose: boolean;
  headerState: HeaderState;
}

/**
 * Derive the negotiation UI state from the proposal log. Pure: the single
 * PENDING entry (if any) is the live proposal; everything else follows from
 * who proposed it and whether an agreed point already exists.
 */
export function deriveNegotiationState(
  proposals: Proposal[],
  hasAgreedPoint: boolean,
  viewerId: string
): NegotiationState {
  const pendingProposal = proposals.find((p) => p.status === "PENDING") ?? null;

  const canRespond = pendingProposal !== null && pendingProposal.proposedById !== viewerId;
  // No pending proposal → anyone may propose. A pending proposal → only its
  // counterpart may propose (a counter); its proposer may not.
  const canPropose = pendingProposal === null || pendingProposal.proposedById !== viewerId;

  let headerState: HeaderState;
  if (pendingProposal === null) {
    headerState = hasAgreedPoint ? "agreed" : "none";
  } else if (pendingProposal.proposedById === viewerId) {
    headerState = "pending-awaiting-them";
  } else {
    headerState = "pending-awaiting-you";
  }

  return { pendingProposal, canRespond, canPropose, headerState };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test -- meetingPointNegotiation`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the timeline helper**

Create `lib/__tests__/timeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeTimeline, type MessageItem } from "@/lib/timeline";
import type { Proposal } from "@/lib/meetingPointNegotiation";

const msg = (id: string, createdAt: string): MessageItem => ({
  id,
  text: `m-${id}`,
  senderId: "alice",
  createdAt,
});

const prop = (id: string, createdAt: string): Proposal => ({
  id,
  proposedById: "alice",
  name: `p-${id}`,
  lat: 0,
  lng: 0,
  status: "PENDING",
  createdAt,
  resolvedAt: null,
});

describe("mergeTimeline", () => {
  it("returns [] for two empty lists", () => {
    expect(mergeTimeline([], [])).toEqual([]);
  });

  it("interleaves messages and proposals by createdAt ascending", () => {
    const messages = [msg("m1", "2026-07-22T10:00:00Z"), msg("m2", "2026-07-22T10:02:00Z")];
    const proposals = [prop("p1", "2026-07-22T10:01:00Z")];
    const result = mergeTimeline(messages, proposals);
    expect(result.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "message:m1",
      "proposal:p1",
      "message:m2",
    ]);
  });

  it("uses a stable tiebreak (message before proposal) at equal timestamps", () => {
    const t = "2026-07-22T10:00:00Z";
    const result = mergeTimeline([msg("m1", t)], [prop("p1", t)]);
    expect(result.map((e) => e.kind)).toEqual(["message", "proposal"]);
  });

  it("carries the full underlying objects on each entry", () => {
    const [entry] = mergeTimeline([msg("m1", "2026-07-22T10:00:00Z")], []);
    expect(entry.kind).toBe("message");
    if (entry.kind === "message") expect(entry.message.text).toBe("m-m1");
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npm run test -- timeline`
Expected: FAIL — cannot resolve `@/lib/timeline`.

- [ ] **Step 7: Implement the timeline helper**

Create `lib/timeline.ts`:

```ts
import type { Proposal } from "@/lib/meetingPointNegotiation";

export interface MessageItem {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

export interface TimelineMessageEntry {
  kind: "message";
  id: string;
  createdAt: string;
  message: MessageItem;
}

export interface TimelineProposalEntry {
  kind: "proposal";
  id: string;
  createdAt: string;
  proposal: Proposal;
}

export type TimelineEntry = TimelineMessageEntry | TimelineProposalEntry;

/**
 * Merge chat messages and meeting-point proposals into one time-ordered feed.
 * Sorted by `createdAt` ascending; at an equal timestamp a message sorts
 * before a proposal, then by id, so the order is deterministic. ISO-8601
 * timestamps compare correctly as strings.
 */
export function mergeTimeline(messages: MessageItem[], proposals: Proposal[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...messages.map(
      (m): TimelineMessageEntry => ({ kind: "message", id: m.id, createdAt: m.createdAt, message: m })
    ),
    ...proposals.map(
      (p): TimelineProposalEntry => ({ kind: "proposal", id: p.id, createdAt: p.createdAt, proposal: p })
    ),
  ];

  return entries.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "message" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
```

- [ ] **Step 8: Run to verify pass, then the full suite**

Run: `npm run test -- timeline` → PASS
Run: `npm run test` → all pass, output pristine.

- [ ] **Step 9: Commit**

```bash
git add lib/meetingPointNegotiation.ts lib/timeline.ts lib/__tests__/meetingPointNegotiation.test.ts lib/__tests__/timeline.test.ts
git commit -m "feat: pure negotiation-state and timeline-merge helpers"
```

---

### Task 3: Proposals sub-resource API

Two route files + a validation schema. No unit test (route convention); verify with tsc + lint.

**Files:**
- Create: `lib/validation/meetingPointProposal.ts`
- Create: `app/api/match-requests/[id]/meeting-point-proposals/route.ts`
- Create: `app/api/match-requests/[id]/meeting-point-proposals/[proposalId]/route.ts`

**Interfaces:**
- Consumes: `getAuthorizedMatchRequest`, `geocodeAddress`, `prisma`, `auth`, and the `MeetingPointProposal` model from Task 1.
- Produces: `POST …/meeting-point-proposals` and `PATCH …/meeting-point-proposals/[proposalId]`, consumed by the frontend (Tasks 5-6).

- [ ] **Step 1: Validation schema**

Create `lib/validation/meetingPointProposal.ts`:

```ts
import { z } from "zod";

// A proposal is either a structured point (from a suggestion pick) or free
// text to geocode server-side.
export const createProposalSchema = z.union([
  z.object({
    name: z.string().min(1).max(200),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  }),
  z.object({ query: z.string().min(1).max(200) }),
]);

export const respondProposalSchema = z.object({
  action: z.enum(["accept", "reject"]),
});
```

- [ ] **Step 2: POST route (propose / counter)**

Create `app/api/match-requests/[id]/meeting-point-proposals/route.ts`:

```ts
// app/api/match-requests/[id]/meeting-point-proposals/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { geocodeAddress } from "@/lib/geocoding";
import { createProposalSchema } from "@/lib/validation/meetingPointProposal";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  if (matchRequest.status === "DECLINED" || matchRequest.status === "WITHDRAWN") {
    return NextResponse.json(
      { error: "Diese Anfrage ist abgeschlossen und kann nicht mehr geändert werden." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = createProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Resolve to a concrete point; geocode free text.
  let point: { name: string; lat: number; lng: number };
  if ("query" in parsed.data) {
    const geocoded = await geocodeAddress(parsed.data.query);
    if (!geocoded) {
      return NextResponse.json(
        { error: "Treffpunkt konnte nicht gefunden werden. Bitte präzisiere die Angabe." },
        { status: 422 }
      );
    }
    point = { name: parsed.data.query, lat: geocoded.lat, lng: geocoded.lng };
  } else {
    point = { name: parsed.data.name, lat: parsed.data.lat, lng: parsed.data.lng };
  }

  const userId = session.user.id;

  // Enforce the one-pending invariant and handle "counter" atomically.
  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.meetingPointProposal.findFirst({
      where: { matchRequestId: matchRequest.id, status: "PENDING" },
    });
    if (pending) {
      if (pending.proposedById === userId) {
        return { conflict: true as const };
      }
      // Counter: supersede the counterpart's pending proposal.
      await tx.meetingPointProposal.update({
        where: { id: pending.id },
        data: { status: "SUPERSEDED", resolvedAt: new Date() },
      });
    }
    const proposal = await tx.meetingPointProposal.create({
      data: {
        matchRequestId: matchRequest.id,
        proposedById: userId,
        name: point.name,
        lat: point.lat,
        lng: point.lng,
      },
    });
    return { proposal };
  });

  if ("conflict" in result) {
    return NextResponse.json(
      { error: "Dein Vorschlag wartet noch auf eine Antwort." },
      { status: 409 }
    );
  }

  return NextResponse.json({ id: result.proposal.id });
}
```

- [ ] **Step 3: PATCH route (accept / reject)**

Create `app/api/match-requests/[id]/meeting-point-proposals/[proposalId]/route.ts`:

```ts
// app/api/match-requests/[id]/meeting-point-proposals/[proposalId]/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { respondProposalSchema } from "@/lib/validation/meetingPointProposal";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; proposalId: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  if (matchRequest.status === "DECLINED" || matchRequest.status === "WITHDRAWN") {
    return NextResponse.json(
      { error: "Diese Anfrage ist abgeschlossen und kann nicht mehr geändert werden." },
      { status: 409 }
    );
  }

  const body = await request.json();
  const parsed = respondProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const proposal = await prisma.meetingPointProposal.findUnique({
    where: { id: params.proposalId },
  });
  if (!proposal || proposal.matchRequestId !== matchRequest.id) {
    return NextResponse.json({ error: "Vorschlag nicht gefunden" }, { status: 404 });
  }
  if (proposal.status !== "PENDING") {
    return NextResponse.json(
      { error: "Dieser Vorschlag wurde bereits beantwortet." },
      { status: 409 }
    );
  }
  // Only the counterpart (not the proposer) may accept or reject.
  if (proposal.proposedById === session.user.id) {
    return NextResponse.json(
      { error: "Nur die andere Person kann auf diesen Vorschlag antworten." },
      { status: 403 }
    );
  }

  if (parsed.data.action === "accept") {
    // Resolve the proposal and promote it to the agreed point atomically.
    await prisma.$transaction([
      prisma.meetingPointProposal.update({
        where: { id: proposal.id },
        data: { status: "ACCEPTED", resolvedAt: new Date() },
      }),
      prisma.matchRequest.update({
        where: { id: matchRequest.id },
        data: {
          meetingPointName: proposal.name,
          meetingPointLat: proposal.lat,
          meetingPointLng: proposal.lng,
        },
      }),
    ]);
  } else {
    await prisma.meetingPointProposal.update({
      where: { id: proposal.id },
      data: { status: "REJECTED", resolvedAt: new Date() },
    });
  }

  return NextResponse.json({ id: proposal.id, action: parsed.data.action });
}
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/meetingPointProposal.ts "app/api/match-requests/[id]/meeting-point-proposals"
git commit -m "feat: meeting-point proposal endpoints (propose/counter, accept/reject)"
```

---

### Task 4: Wire existing routes — detail GET returns proposals; remove instant-apply

**Files:**
- Modify: `app/api/match-requests/[id]/route.ts`
- Modify: `lib/validation/matchRequest.ts`

**Interfaces:**
- Consumes: the `MeetingPointProposal` model.
- Produces: `GET /api/match-requests/[id]` now includes `proposals[]` (consumed by the frontend). The `meetingPoint`/`meetingPointQuery` PATCH paths are gone.

- [ ] **Step 1: Return proposals from the detail GET**

In `app/api/match-requests/[id]/route.ts`, inside `GET`, after the `counterpart` line and before the `return NextResponse.json({`, add:

```ts
  const proposals = await prisma.meetingPointProposal.findMany({
    where: { matchRequestId: matchRequest.id },
    orderBy: { createdAt: "asc" },
  });
```

Then add this field to the returned object (after `meetingPointLng`):

```ts
    proposals: proposals.map((p) => ({
      id: p.id,
      proposedById: p.proposedById,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      status: p.status,
      createdAt: p.createdAt,
      resolvedAt: p.resolvedAt,
    })),
```

- [ ] **Step 2: Remove the instant-apply branches from PATCH**

In the same file's `PATCH`, delete the entire meeting-point block:

```ts
  let meetingPointUpdate = {};
  // A structured pick is already precise; prefer it and skip geocoding. Free
  // text still goes through the geocoder. If both are somehow sent, the
  // structured pick wins.
  if (parsed.data.meetingPoint) {
    meetingPointUpdate = {
      meetingPointName: parsed.data.meetingPoint.name,
      meetingPointLat: parsed.data.meetingPoint.lat,
      meetingPointLng: parsed.data.meetingPoint.lng,
    };
  } else if (parsed.data.meetingPointQuery) {
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
```

Change the final update to drop the spread:

```ts
  const updated = await prisma.matchRequest.update({
    where: { id: matchRequest.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
  });
```

Remove the now-unused import at the top of the file:

```ts
import { geocodeAddress } from "@/lib/geocoding";
```

- [ ] **Step 3: Drop the fields from the update schema**

In `lib/validation/matchRequest.ts`, reduce `updateMatchRequestSchema` to just status (remove `meetingPointQuery` and `meetingPoint`):

```ts
// ACCEPTED / DECLINED may only be set by the recipient; WITHDRAWN only by the
// sender. The schema accepts all three; the route enforces who may set which.
export const updateMatchRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]).optional(),
});
```

- [ ] **Step 4: Verify types, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. (The frontend still references the removed PATCH shape until Task 5; `tsc` stays clean because those mutation bodies are plain objects. If `build` surfaces an unused-var error for a leftover import, remove it.)

- [ ] **Step 5: Commit**

```bash
git add "app/api/match-requests/[id]/route.ts" lib/validation/matchRequest.ts
git commit -m "feat: detail GET returns proposals; drop instant-apply meeting-point write"
```

---

### Task 5: Frontend — status header, accept/reject, propose reframing

Modifies the detail page. No unit test; verify with tsc + lint + build.

**Files:**
- Modify: `app/nachrichten/[id]/page.tsx`

**Interfaces:**
- Consumes: `deriveNegotiationState` (Task 2); the proposals endpoints (Task 3); `proposals` on the detail GET (Task 4).
- Produces: the negotiation UI; the timeline rendering follows in Task 6.

- [ ] **Step 1: Imports and the proposal type**

Add after the existing `DEFAULT_OVERLAP_TOLERANCE_STEPS` / paging imports (near line 20-21):

```tsx
import { deriveNegotiationState, type Proposal } from "@/lib/meetingPointNegotiation";
```

Add `proposals` to the `MatchRequestDetail` interface (after `meetingPointLng`):

```tsx
  proposals: Proposal[];
```

- [ ] **Step 2: Replace the two apply mutations with propose + respond**

Delete the `meetingPointMutation` block (currently lines ~142-159) and the `applySuggestionMutation` block (currently lines ~174-189). In their place (keep `meetingPointForm` — the free-text form still uses it), add:

```tsx
  const meetingPointForm = useForm<z.infer<typeof meetingPointSchema>>({
    resolver: zodResolver(meetingPointSchema),
  });

  // Proposing replaces the old instant-apply: a suggestion pick sends a
  // structured point, the free-text field sends a query to geocode. Either
  // creates a PENDING proposal the counterpart must answer.
  const proposeMutation = useMutation({
    mutationFn: async (
      input: { name: string; lat: number; lng: number } | { query: string }
    ) => {
      const res = await fetch(`/api/match-requests/${params.id}/meeting-point-proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Vorschlag konnte nicht gesendet werden.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
      meetingPointForm.reset();
    },
  });

  const respondMutation = useMutation({
    mutationFn: async (input: { proposalId: string; action: "accept" | "reject" }) => {
      const res = await fetch(
        `/api/match-requests/${params.id}/meeting-point-proposals/${input.proposalId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: input.action }),
        }
      );
      if (!res.ok) throw new Error("Antwort konnte nicht gespeichert werden.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
    },
  });
```

- [ ] **Step 3: Derive negotiation state in render scope**

After the existing `const ownId = session?.user?.id;` and `const closed = …` lines (near line 225-226), add:

```tsx
  const negotiation = deriveNegotiationState(
    matchRequest.proposals,
    matchRequest.meetingPointLat != null && matchRequest.meetingPointLng != null,
    ownId ?? ""
  );
  const counterpartLabel = matchRequest.counterpartAlias ?? "Die andere Person";
```

- [ ] **Step 4: Add the negotiation banner and gate the propose UI**

Inside the Treffpunkt `CardContent`, in the `{!closed && ( … )}` region, insert the banner **above** the suggestions `<div className="flex flex-col gap-2 border-b pb-3">` (currently line ~250):

```tsx
              {negotiation.headerState === "pending-awaiting-you" && negotiation.pendingProposal && (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <p className="text-sm">
                    <span className="font-medium">{counterpartLabel}</span> schlägt{" "}
                    <span className="font-medium">{negotiation.pendingProposal.name}</span> vor.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        respondMutation.mutate({ proposalId: negotiation.pendingProposal!.id, action: "reject" })
                      }
                      disabled={respondMutation.isPending}
                    >
                      Ablehnen
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        respondMutation.mutate({ proposalId: negotiation.pendingProposal!.id, action: "accept" })
                      }
                      disabled={respondMutation.isPending}
                    >
                      Zusagen
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    …oder mach unten einen Gegenvorschlag.
                  </p>
                </div>
              )}
              {negotiation.headerState === "pending-awaiting-them" && negotiation.pendingProposal && (
                <p className="text-sm text-muted-foreground">
                  Dein Vorschlag <span className="font-medium">{negotiation.pendingProposal.name}</span> wartet
                  auf eine Antwort.
                </p>
              )}
```

Then wrap the existing suggestions `<div>` **and** the free-text `<form>` (and its error `<p>`) — currently lines ~250-365 — in a `canPropose` gate so a proposer with an outstanding proposal can't propose again. Change the opening `<div className="flex flex-col gap-2 border-b pb-3">` to be preceded by `{negotiation.canPropose && (` and close the group with `)}` after the free-text error `<p>`. Concretely, wrap like:

```tsx
              {negotiation.canPropose && (
                <>
                  {/* existing suggestions <div> … and free-text <form> … unchanged */}
                </>
              )}
```

- [ ] **Step 5: Point the propose actions at `proposeMutation`**

In the suggestion row button (currently `onClick={() => applySuggestionMutation.mutate(suggestion)}`, label "Übernehmen"), change to propose and relabel:

```tsx
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  proposeMutation.mutate({
                                    name: suggestion.name,
                                    lat: suggestion.lat,
                                    lng: suggestion.lng,
                                  })
                                }
                                disabled={proposeMutation.isPending}
                              >
                                Vorschlagen
                              </Button>
```

Update the apply-error `<p>` (currently `applySuggestionMutation.isError`) to `proposeMutation`:

```tsx
                    {proposeMutation.isError && (
                      <p className="text-sm text-destructive">
                        {(proposeMutation.error as Error).message}
                      </p>
                    )}
```

Change the free-text form's submit handler:

```tsx
              <form
                onSubmit={meetingPointForm.handleSubmit((values) =>
                  proposeMutation.mutate({ query: values.meetingPointQuery })
                )}
                className="flex gap-2"
              >
                <Input placeholder="Treffpunkt vorschlagen…" {...meetingPointForm.register("meetingPointQuery")} />
                <Button type="submit" disabled={proposeMutation.isPending}>
                  Vorschlagen
                </Button>
              </form>
```

Delete the old free-text error `<p>` that referenced `meetingPointMutation.isError` (the `proposeMutation.isError` note above already covers propose failures).

Note: the suggestion row's `isApplied` "Übernommen" badge stays as-is — it now marks the agreed (accepted) point, which is intended per the spec.

- [ ] **Step 6: Verify types, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. If `tsc` flags `negotiation.pendingProposal!` non-null assertions, they are guarded by the surrounding `headerState` checks; keep the `!` or refactor to a local `const pending = negotiation.pendingProposal` inside each block.

- [ ] **Step 7: Commit**

```bash
git add "app/nachrichten/[id]/page.tsx"
git commit -m "feat: meeting-point negotiation controls (propose, accept, reject, counter)"
```

---

### Task 6: Frontend — proposals inline in the chat timeline

**Files:**
- Modify: `app/nachrichten/[id]/page.tsx`

**Interfaces:**
- Consumes: `mergeTimeline` (Task 2); `matchRequest.proposals`.

- [ ] **Step 1: Import the timeline helper**

Add near the other `@/lib` imports:

```tsx
import { mergeTimeline } from "@/lib/timeline";
```

- [ ] **Step 2: Render the merged timeline in the Nachrichten card**

Replace the `messages?.map((message) => { … })` block (currently lines ~400-414) with a merged render over messages + proposals:

```tsx
          {mergeTimeline(messages ?? [], matchRequest.proposals).map((entry) => {
            if (entry.kind === "message") {
              const isOwn = ownId != null && entry.message.senderId === ownId;
              return (
                <div key={`m-${entry.id}`} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                      isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    )}
                  >
                    {entry.message.text}
                  </div>
                </div>
              );
            }
            const p = entry.proposal;
            const isOwn = ownId != null && p.proposedById === ownId;
            const who = isOwn ? "Du" : counterpartLabel;
            const statusLabel: Record<Proposal["status"], string> = {
              PENDING: "wartet auf Antwort",
              ACCEPTED: "angenommen",
              REJECTED: "abgelehnt",
              SUPERSEDED: "überholt",
            };
            return (
              <div key={`p-${entry.id}`} className="flex justify-center">
                <div className="rounded-lg border px-3 py-2 text-center text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{who}</span> schlägt{" "}
                  <span className="font-medium text-foreground">{p.name}</span> vor · {statusLabel[p.status]}
                </div>
              </div>
            );
          })}
```

`counterpartLabel` is already in scope from Task 5, Step 3. `messages` may be `undefined` while loading — `messages ?? []` handles it.

- [ ] **Step 3: Verify types, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors. The page's local `MessageItem` shape (`id/text/senderId/createdAt`) is structurally identical to `lib/timeline.ts`'s `MessageItem`, so `messages` passes without a cast.

- [ ] **Step 4: Manual verification (seeded two-account walkthrough)**

Run: `npm run dev`. With two accounts on one match request (not closed):
- As A, propose a place (suggestion "Vorschlagen" or free text). The propose UI disappears for A and shows "Dein Vorschlag … wartet auf eine Antwort."; a proposal card appears in the chat.
- As B, the banner shows "A schlägt … vor" with Zusagen / Ablehnen.
- B clicks **Gegenvorschlag path**: propose a different place → A's proposal card flips to "überholt", B's new one is pending, and now A sees the accept/reject banner.
- A clicks **Zusagen** → the Treffpunkt map/name update to the agreed place; the card shows "angenommen".
- Either party proposes a change → negotiation reopens while the agreed place remains until the new one is accepted.
- **Ablehnen** on a proposal leaves any previously agreed place intact; the card shows "abgelehnt".
- Decline/withdraw the request → the whole negotiation UI disappears.

- [ ] **Step 5: Commit**

```bash
git add "app/nachrichten/[id]/page.tsx"
git commit -m "feat: show meeting-point proposals inline in the chat timeline"
```

---

## Self-Review notes

- **Spec coverage:** schema + agreed-point-on-accept (§1) → Task 1; `deriveNegotiationState` + `mergeTimeline` (§3) → Task 2; POST propose/counter + PATCH accept/reject + validation, one-pending invariant, geocode-on-query (§2) → Task 3; detail GET returns proposals + instant-apply removed (§2) → Task 4; status header + accept/reject + propose reframing + canPropose gating (§4) → Task 5; proposals inline in the timeline (§3/§4) → Task 6.
- **Type consistency:** `Proposal`/`ProposalStatus` defined in Task 2 are imported verbatim in Tasks 5-6; `deriveNegotiationState(proposals, hasAgreedPoint, viewerId)` and `mergeTimeline(messages, proposals)` signatures match their call sites. The proposals endpoint response and the detail GET's `proposals[]` shape match the frontend `Proposal` type field-for-field.
- **Invariants:** one-pending enforced in the POST transaction; accept writes the agreed point in a transaction; only-counterpart-responds enforced in the PATCH route and reflected by `canRespond`/`canPropose`.
- **Out of scope (unchanged):** withdraw, per-transition timeline events, time negotiation, push notifications.
- **Known follow-up (not a gap):** `app/nachrichten/[id]/page.tsx` grows further; a future extraction of the Treffpunkt card into its own component would help, but relocating the reviewed suggestions code is out of scope here.
