# Negotiable meeting points (propose → accept / reject / counter)

**Date:** 2026-07-22
**Status:** Approved, ready for implementation plan
**Backlog item:** "Make meeting points negotiable (propose → accept/reject →
counter)" (P2, Feature enhancements in `TODO.md`)

## Problem

Today a meeting point is a set of flat fields on the match request
(`meetingPointName/Lat/Lng`) that whoever acts **overwrites instantly** — a
suggestion "Übernehmen" or a free-text "Vorschlagen" writes the fields with no
say from the other participant. There is no proposer, no pending state, and no
way for the other person to accept, reject, or counter. Two people cannot
actually agree on where to meet; one simply overwrites the other.

## Goal

Turn the meeting point into a small negotiation that lives in the same detail
view as the chat: one person **proposes** a place, the other **accepts**,
**rejects**, or **counters**, until both agree. An accepted place becomes the
agreed meeting point (and drives the existing map/header); either person can
reopen negotiation later by proposing a change.

Decisions settled during brainstorming:

- **Proposals appear inline in the chat timeline**, interleaved with messages,
  plus a compact current-status header on the Treffpunkt card.
- **Accepted locks but is reopenable:** an accepted place is the agreed point
  and stays until a *new* proposal is accepted.
- **Interaction rules:** at most one pending proposal at a time; only the
  **counterpart** (not the proposer) may respond; the responder can accept,
  reject, or counter (counter supersedes the pending one and creates the
  responder's own pending proposal). There is **no withdraw** of one's own
  pending proposal.
- **Gating unchanged:** negotiation is available whenever the request is not
  closed (OPEN or ACCEPTED), hidden once DECLINED/WITHDRAWN — same condition
  that already gates the free-text form.
- **Timeline granularity:** one card per proposal, its resolution shown inline
  on that same card (not a separate event line per transition).

## Architecture

Four units:

1. Schema: a `MeetingPointProposal` model + status enum, alongside the existing
   flat `meetingPoint*` fields (kept as the agreed-point source of truth).
2. A proposals sub-resource API (`POST` propose/counter, `PATCH` accept/reject),
   replacing today's instant-apply write paths.
3. Two pure, testable helpers for negotiation state and timeline merging.
4. Detail-page UI: status header, accept/reject controls, and proposals
   rendered inline in the chat timeline.

### 1. Schema — `prisma/schema.prisma`

Keep `MatchRequest.meetingPointName/Lat/Lng` as the **agreed point** (the map,
the header, and the existing detail `GET` already read these). Add:

```prisma
enum MeetingPointProposalStatus {
  PENDING
  ACCEPTED
  REJECTED
  SUPERSEDED
}

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

Add the back-relations on `MatchRequest` (`proposals MeetingPointProposal[]`)
and `User` (`meetingPointProposals MeetingPointProposal[]`).

- **Invariant:** at most one `PENDING` proposal per match request at a time,
  enforced in the API within a transaction (not a DB constraint).
- Accepting a proposal writes the flat `meetingPoint*` fields, so everything
  downstream of the agreed point is unchanged.
- **No backfill:** existing set meeting points show as the agreed point with no
  history. One `prisma migrate dev` adds the model and enum.

### 2. API — proposals sub-resource (mirrors `/messages`)

**`POST /api/match-requests/[id]/meeting-point-proposals`** — propose or counter.

- Body is one of:
  - `{ name: string(1..200), lat: number, lng: number }` — structured (from a
    suggestion pick), applied directly with no geocode.
  - `{ query: string(1..200) }` — free text; geocoded server-side via
    `geocodeAddress`. Geocode failure → `422` with the existing German message.
- Guards: authenticated (`401`), participant via `getAuthorizedMatchRequest`
  (`404`), request not closed (`409`, reusing the existing terminal-state guard
  message).
- Pending-proposal logic (in a transaction):
  - No `PENDING` proposal → create a new `PENDING` proposal by the poster.
  - A `PENDING` proposal exists and the poster is its **counterpart** → mark it
    `SUPERSEDED` (`resolvedAt = now`) and create the poster's new `PENDING`
    proposal. (This is "counter".)
  - A `PENDING` proposal exists and the poster is its **proposer** → `409`
    ("Dein Vorschlag wartet noch auf eine Antwort.").
- Response: the created proposal.

**`PATCH /api/match-requests/[id]/meeting-point-proposals/[proposalId]`** —
respond.

- Body: `{ action: "accept" | "reject" }`.
- Guards: authenticated (`401`), participant (`404`), request not closed
  (`409`). The proposal must belong to this request and be `PENDING` (else
  `409`), and the actor must be the **counterpart** — i.e.
  `proposal.proposedById !== session.user.id` (else `403`,
  "Nur die andere Person kann auf diesen Vorschlag antworten.").
- `accept` (transaction): set proposal `ACCEPTED` + `resolvedAt = now`; write
  `meetingPointName/Lat/Lng` on the match request from the proposal.
- `reject`: set proposal `REJECTED` + `resolvedAt = now`; flat fields unchanged
  (a previously agreed point remains).

**Removed:** the `meetingPoint` and `meetingPointQuery` branches on
`PATCH /api/match-requests/[id]` (and those fields from
`updateMatchRequestSchema`). Instant-apply is replaced by proposing. The
status accept/decline/withdraw handling on that route is untouched.

**Detail `GET` extension:** `GET /api/match-requests/[id]` additionally returns
`proposals`, ordered by `createdAt` ascending:

```jsonc
"proposals": [
  { "id": "…", "proposedById": "…", "name": "…", "lat": 0, "lng": 0,
    "status": "PENDING", "createdAt": "…", "resolvedAt": null }
]
```

This rides the existing 4 s poll, so both participants see negotiation changes
live without a new polling query.

### 3. Pure helpers (testable core)

**`lib/meetingPointNegotiation.ts`**

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
  | "none"                 // no agreed point, no pending proposal
  | "pending-awaiting-you" // a pending proposal the viewer must respond to
  | "pending-awaiting-them"// the viewer's own pending proposal
  | "agreed";              // an agreed point exists, nothing pending

export interface NegotiationState {
  pendingProposal: Proposal | null; // the single PENDING proposal, if any
  canPropose: boolean;   // no pending proposal blocking a new one from viewer
  headerState: HeaderState;
}

export function deriveNegotiationState(
  proposals: Proposal[],
  hasAgreedPoint: boolean,
  viewerId: string,
): NegotiationState;
```

Rules: `pendingProposal` is the lone `PENDING` entry (or `null`).
`canPropose` is true when there is no pending proposal, **or** the viewer is the
counterpart of the pending one (they may counter). `headerState` follows the
enum above from (`pendingProposal`, who proposed it, `hasAgreedPoint`); the
counterpart who may respond is exactly `headerState === "pending-awaiting-you"`.

**`lib/timeline.ts`**

```ts
export interface TimelineMessage { kind: "message"; id: string; createdAt: string; /* + message fields */ }
export interface TimelineProposal { kind: "proposal"; id: string; createdAt: string; /* + proposal fields */ }
export type TimelineEntry = TimelineMessage | TimelineProposal;

export function mergeTimeline(
  messages: MessageItem[],
  proposals: Proposal[],
): TimelineEntry[];
```

Merge both lists into one array sorted by `createdAt` ascending; a stable
tiebreak (messages before proposals, or by id) keeps equal-timestamp ordering
deterministic.

### 4. Detail-page UI — `app/nachrichten/[id]/page.tsx`

> **Implementation note (deviation, accepted):** the shipped UI does not render
> distinct `none`/`agreed` header copy. It keeps the pre-existing agreed-point
> block ("Noch kein Treffpunkt festgelegt." + the map) and shows the
> suggestion/free-text propose UI whenever `negotiation.canPropose` is true —
> which covers the `none`, `agreed`, and counter cases uniformly. This is
> functionally equivalent (proposing while agreed reopens negotiation); the
> separate `none`/`agreed` labels and an explicit "Änderung vorschlagen"
> affordance below were judged unnecessary polish. Because the counterpart of a
> pending proposal is exactly `headerState === "pending-awaiting-you"`, the
> banner reads that directly and `deriveNegotiationState` exposes no separate
> `canRespond` field.

Within the not-closed region:

- **Treffpunkt status header** driven by `deriveNegotiationState`:
  - `none` → "Noch kein Treffpunkt vereinbart."
  - `pending-awaiting-you` → the counterpart's proposal with **Zusagen** /
    **Ablehnen** buttons, plus "oder mach einen Gegenvorschlag" (a counter is
    made through the existing suggestion list or free-text field, which now
    POST a proposal).
  - `pending-awaiting-them` → "Dein Vorschlag *X* wartet auf eine Antwort."
  - `agreed` → the agreed place + map (as today) + "Änderung vorschlagen"
    affordance (proposing while agreed reopens negotiation).
- The **suggestions block** and **free-text field** stay, but their actions
  become "propose": the suggestion "Übernehmen" and the free-text "Vorschlagen"
  POST to the proposals endpoint. Copy shifts from applying to proposing
  (e.g. "Vorschlagen" stays apt; the suggestion button becomes "Vorschlagen").
- The **chat timeline** renders `mergeTimeline(messages, proposals)`. A
  `proposal` entry is one card: "*Alias* schlägt *Name* vor", with a status
  line — `PENDING` (awaiting response), `ACCEPTED` ("angenommen"), `REJECTED`
  ("abgelehnt"), `SUPERSEDED` ("überholt"). Message entries render as they do
  today.
- Mutations invalidate `["match-request", id]` (proposals ride that query),
  so the header, timeline, and map update together on the next poll or
  immediately after the actor's own action.
- The suggestions block's existing "Übernommen" badge compares a row to the
  **agreed** point, which now updates only on accept — so a place the viewer
  has proposed but that is not yet accepted is *not* badged; its state is shown
  by the header ("wartet auf eine Antwort") and its timeline card instead. This
  is intended.

## Data flow

```
detail page (not closed)
  ├─ GET /api/match-requests/[id]            → { …request, meetingPoint*, proposals[] }  (4 s poll)
  ├─ GET …/messages                          → messages[]  (4 s poll)
  ├─ deriveNegotiationState(proposals, hasAgreedPoint, viewerId) → header + controls
  └─ mergeTimeline(messages, proposals)      → chat timeline
  propose / counter (suggestion pick or free text)
        → POST …/meeting-point-proposals { name,lat,lng | query }
        → (counter) supersede pending + create new pending
        → invalidate ["match-request", id]
  respond
        → PATCH …/meeting-point-proposals/[proposalId] { action: accept | reject }
        → accept: proposal ACCEPTED + write meetingPoint* (agreed point)
        → invalidate ["match-request", id]
```

## Error handling

- `401`/`404` via the shared authz helper; `409` when the request is closed or
  the pending-proposal invariant is violated; `403` when a non-counterpart
  tries to respond; `422` on free-text geocode failure (unchanged message).
- All state transitions that touch two rows (counter = supersede + create;
  accept = resolve + write flat fields) run in a Prisma transaction so the
  one-pending invariant and the agreed point cannot desync.
- The pure helpers never throw: empty inputs yield the `none` header state and
  an empty timeline.

## Testing

- **Unit tests** for `lib/meetingPointNegotiation.ts`:
  - `none` when no proposals and no agreed point; `agreed` when an agreed point
    exists and nothing pending.
  - `pending-awaiting-you` vs `pending-awaiting-them` by viewer identity (the
    counterpart who may respond is exactly `pending-awaiting-you`).
  - `canPropose` true with no pending, true for the counterpart of a pending
    one (counter), false for the proposer of a pending one.
  - Only a `PENDING` entry counts as pending (ACCEPTED/REJECTED/SUPERSEDED
    ignored).
- **Unit tests** for `lib/timeline.ts`: interleaving by `createdAt`; stable
  tiebreak at equal timestamps; empty lists.
- **API routes** untested (consistent with the codebase). Manual verification:
  seeded two-account walkthrough of propose → counter → accept, reopening an
  agreed point, and reject-leaves-previous-agreed.

## Out of scope (possible follow-ups)

- Withdrawing one's own pending proposal.
- Per-transition timeline events (a separate line for each accept/reject);
  this spec uses one card per proposal with inline resolution.
- Proposing a specific time alongside the place (`proposedTimeslot` exists on
  the model but is not part of this negotiation).
- Push/notification when a proposal is waiting — the 4 s poll covers it.
