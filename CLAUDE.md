# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lunch Match — a Next.js 14 (App Router) app that matches remote workers for a shared
lunch walk. It is the v1 implementation of a Bachelor thesis concept; `README.md`
explains the domain reasoning, `TODO.md` is the live backlog (status, known issues,
v2 scope) and should be read before starting new work.

**Language rule:** the UI (and all user-facing strings, including API error messages)
is German. Code, comments, commit messages, and docs are English. Domain fields keep
their German names (`schritteziel`, `branche`, `karrierelevel`, route segments like
`/match-finden`, `/nachrichten`, `/profil`).

## Commands

```bash
docker compose up -d db      # PostgreSQL 16 on :5432 (required for anything DB-backed)
npm run dev                  # dev server on :3000; predev reprints seeded demo logins
npm run build                # production build
npm run lint                 # next lint
npm test                     # vitest run
npm run test:watch
npm run db:migrate           # prisma migrate dev
npm run db:generate          # prisma generate (after editing schema.prisma)
npm run db:seed              # WIPES and recreates 12 Berlin-Mitte demo users + requests
```

Single test file / test: `npx vitest run lib/__tests__/searchRadius.test.ts`,
`npx vitest run -t "name of test"`.

Environment: copy `.env.example` to `.env` and set `AUTH_SECRET`
(`openssl rand -base64 32`). No API keys are needed anywhere — Nominatim and Overpass
are used unauthenticated, and that "no paid/keyed service" constraint is deliberate.

**Do not run `npm run build` while `npm run dev` is running** — it clobbers the dev
server's `.next` cache. Likewise run only one dev server and one DB container at a
time; a second of either races on `.next` / port 5432.

## Testing scope

Vitest is configured (`vitest.config.ts`) to collect **only `lib/**/*.test.ts`** in a
`node` environment. There is no jsdom, no component testing, and no E2E suite — a
deliberate v1 scope decision. The consequence for how you work: business logic must
live in pure, dependency-free modules under `lib/` so it is testable, and route
handlers/pages stay thin orchestration around them. Anything you can't test in Node
without a DB or a browser probably belongs in `lib/` in a different shape.

Seeded demo accounts: `npm run db:seed` writes credentials to the gitignored
`prisma/.seeded-credentials.json`; `scripts/print-seeded-users.ts` reprints them on
`predev`. Recovery keys exist nowhere else — the DB stores only bcrypt hashes.

## Architecture

### Auth: anonymous, unrecoverable accounts

There are no emails and no passwords. Sign-up mints an **Account ID** (public, 10
chars from an unambiguous alphabet) and a **Recovery Key** (secret, shown once,
stored only as a bcrypt hash) — `lib/identity.ts`. There is intentionally no reset
flow; the UI states this plainly. Don't add one, and don't add any path that could
surface a recovery key after creation.

NextAuth v5 (beta) with a Credentials provider and JWT sessions. The config is split:
`auth.config.ts` is edge-safe (used by `middleware.ts` for route protection) and holds
the `jwt`/`session` callbacks that put the Prisma `user.id` on `session.user.id`;
`auth.ts` adds the Prisma-backed `authorize`. Protected prefixes are listed in *both*
`middleware.ts`'s matcher and `authConfig.callbacks.authorized` — keep them in sync.

### Route handlers

Every handler follows the same shape: `auth()` → 401 if unauthenticated → load/authorize
the resource → zod-parse the body with a schema from `lib/validation/` → Prisma write →
JSON response with a German error string. Access control for anything hanging off a
match request goes through `lib/getAuthorizedMatchRequest.ts`, which returns `null`
(→ 404, not 403) when the viewer is neither participant.

State transitions on shared rows use **status-guarded `updateMany` inside a
transaction**, checking `count === 1` and returning 409 rather than a plain `update` —
see `app/api/match-requests/[id]/meeting-point-proposals/[proposalId]/route.ts`. Two
participants act on the same conversation concurrently; write-skew is a real case here.

### Location privacy is enforced server-side

Each user picks a `LocationPrecision` (`EXACT` / `POSTAL_CODE` / `CITY`). The server
uses **exact** coordinates for distance and radius maths, then coarsens via
`lib/locationPrivacy.ts` only on the values that leave the server. An exact coordinate
must never reach another user who chose a coarser precision — check this whenever you
add a field or endpoint that exposes another user's position.

### Search radius

`lib/searchRadius.ts`: no step goal → 732 m (a 10-minute walk at 1.22 m/s); otherwise
`steps × 0.73 m`. Both constants come from the thesis — treat them as domain facts, not
tunables. Radii are surfaced to users in *steps* as often as metres (`metersToSteps`).

### Meeting-point negotiation

A match request carries at most one agreed meeting point (`meetingPointName/Lat/Lng`)
plus an append-only `MeetingPointProposal` log. The UI state is derived purely from
that log by `lib/meetingPointNegotiation.ts` (`deriveNegotiationState`): the single
`PENDING` row is the live proposal; only its counterpart may respond or counter.
Accepting promotes the proposal to the agreed point. Messages and proposals are merged
into one chronological view by `lib/timeline.ts`.

Overlap suggestions (`lib/meetingSuggestions.ts`) intersect both participants' widened
radii and rank by the *worse* of the two walking distances;
`lib/meetingSuggestionsPaging.ts` reveals them in seeded-random batches (deterministic
PRNG, so it stays a pure unit-testable function).

### External services

- `lib/geocoding.ts` (Nominatim): serialized through a shared promise chain to honour
  the 1 req/s policy — not a "time since last request" check, which concurrent callers
  can both pass. Returns `null` for both "not found" and "unreachable" (a known issue
  tracked in `TODO.md`).
- `lib/meetingPoints.ts` (Overpass): deliberately **not** throttled, because callers
  guarantee one call per discrete user action — client-side debouncing
  (`lib/hooks/useDebouncedValue.ts`) plus a separate route/query key from the
  people-candidates query. The file's header comment states the invariant; re-verify it
  before adding a caller or removing the debounce.

Both clients swallow failures and return empty/null rather than throwing, so a dead
third-party API degrades the page instead of breaking it.

### Client data flow

All pages are `"use client"` with TanStack Query; there is no server-component data
fetching. Query keys are flat arrays including every filter that affects the request
(e.g. `["match-candidates", branche, position, karrierelevel, radiusOverride]`), and
free-text filters are debounced *before* they enter the key. Mutations invalidate by
key. Conversations poll at `refetchInterval: 4000` (realtime is backlog, see `TODO.md`).

Leaflet components (`MapView`, `SingleMarkerMap`) must be imported with
`next/dynamic` + `ssr: false` — Leaflet touches `window` at module load.

### Validation

zod schemas in `lib/validation/` are the single source of truth, used by
react-hook-form on the client and re-parsed in the route handler. When adding a field,
change the schema once; never duplicate the rules on either side.

## Conventions

- Path alias `@/*` maps to the repo root (tsconfig + vitest alias). TypeScript is strict.
- UI primitives in `components/ui/` are hand-written shadcn/ui-pattern components over
  Radix — extend them rather than pulling in a component library.
- Commit messages are conventional (`feat:`, `fix:`, `refactor:`, `docs:`).
- Design specs and implementation plans live in `docs/superpowers/specs/` and
  `docs/superpowers/plans/`. Features here are spec'd before they're built; read the
  relevant spec before changing a feature it covers, and record decisions that deviate
  from it. Findings not worth fixing immediately go under *Known issues* in `TODO.md`
  rather than being dropped.
