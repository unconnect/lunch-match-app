# Lunch Match

A web app that helps people working from home find someone nearby for a shared lunch break.

It is the v1 implementation of a concept developed in a Bachelor thesis
(*Wirtschaftsinformatik*, Alexander Nikolas Reuber). The thesis identified social
isolation, lack of physical activity, and technology-related stress as health
risks for remote workers, and proposed a lunch-matching application as a
countermeasure. This repository turns that concept into working software.

## The idea

You set a step goal for your lunch break. The app converts that goal into a
search radius around your location, then shows you other participants and
possible meeting points (restaurants, cafés) within walking distance. You either
pick someone yourself, or hit **Match me** and let the app pick for you. From
there you arrange the details in a chat and confirm or decline the meeting.

Two design decisions carry most of the concept:

- **Walking distance is the unit of search.** The radius is derived from how many
  steps you want to walk, not from an arbitrary distance setting — so the app
  nudges you toward movement rather than just proximity.
- **You stay anonymous for as long as you want.** There are no email addresses
  and no passwords (see below).

## Anonymous accounts

Sign-up produces two values instead of an email/password pair:

- an **Account ID** — public, identifies you to the system
- a **Recovery Key** — secret, shown exactly once, stored only as a bcrypt hash

To sign in on another device you enter both. There is deliberately **no password
reset flow**: if you lose the Recovery Key, the account is gone. The UI states
this plainly rather than softening it. This is the same trade-off Threema makes —
no personal data is collected, and the cost is that recovery is your
responsibility.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript (strict) |
| UI | Tailwind CSS + hand-written shadcn/ui-pattern primitives (Radix) |
| Client state | TanStack Query |
| Forms | react-hook-form + zod (same schema reused server-side) |
| Database | PostgreSQL via Prisma |
| Auth | NextAuth / Auth.js v5, Credentials provider, JWT sessions |
| Maps | Leaflet + OpenStreetMap tiles |
| Geocoding | Nominatim (rate-limited to 1 req/s per OSM policy) |
| Meeting points | Overpass API |
| Tests | Vitest (pure logic only) |

No paid or API-key-gated services are used, so the project runs without any
account setup beyond a local database.

## Running it locally

Requirements: Node.js >= 20, Docker (for PostgreSQL).

```bash
npm install
cp .env.example .env                       # then set AUTH_SECRET
docker compose up -d db                    # PostgreSQL on :5432
npx prisma migrate dev                     # apply schema
npm run dev                                # http://localhost:3000
```

Generate an `AUTH_SECRET` with `openssl rand -base64 32`.

To create two demo accounts near each other in Berlin (so matching has something
to find):

```bash
npm run db:seed
```

The seed script prints each demo account's Account ID and Recovery Key. **Copy
them** — like any account, they are not retrievable afterwards.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm test` | run the Vitest suite |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:migrate` | apply Prisma migrations |
| `npm run db:seed` | insert demo users |

Note: running `npm run build` while `npm run dev` is running will clobber the dev
server's `.next` cache. Stop the dev server first.

## How the search radius works

Both numbers come from the thesis:

- With no step goal set, the default radius is **732 m** — the distance an average
  adult covers in a 10-minute walk at 1.22 m/s.
- With a step goal, the radius is `steps × 0.73 m`, using 0.73 m as the average
  stride length.

Changing your step goal therefore widens or narrows who and what you can find.

## Project layout

```
app/
  (auth)/page.tsx           landing page — create an anonymous account
  konto-wiederherstellen/   sign in with Account ID + Recovery Key
  profil/                   profile: alias, location, job info, step goal
  match-finden/             map + list of nearby people and meeting points
  nachrichten/              match requests and chat
  api/                      route handlers (identity, profile, match, messages)
components/
  ui/                       shadcn-pattern primitives (Button, Card, Input, …)
  Navigation.tsx            top nav, hidden when signed out
lib/
  searchRadius.ts           step goal → radius
  geo.ts                    haversine distance
  identity.ts               Account ID / Recovery Key generation + hashing
  matchFilters.ts           candidate filtering
  geocoding.ts              Nominatim client (rate-limited)
  meetingPoints.ts          Overpass client
  validation/               zod schemas shared by client and API
prisma/schema.prisma        User, MatchRequest, Message
docs/superpowers/           design spec and implementation plan
```

## Testing

`npm test` covers the pure logic — search radius, distance, identity hashing,
candidate filtering, and both external API clients (with `fetch` stubbed). UI
flows are verified manually in the browser; there is no automated E2E suite in
v1, which is a deliberate scope decision recorded in the spec.

## Scope

v1 covers anonymous accounts, the profile, finding a match (map, list, filters,
Match me), and the request/chat/accept-decline flow.

Gamification (leaderboard, badges, challenges, step account), the favourites
list, and real fitness-tracker sync are described in the thesis and planned for
v2 — see [TODO.md](TODO.md).

## Language

The user interface is in German, matching the thesis. Code, comments, and
documentation are in English.
