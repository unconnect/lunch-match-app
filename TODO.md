# TODO

Backlog for the Lunch Match app. Updated as work progresses.

Legend: `[ ]` open · `[x]` done · **P1** blocks v1 · **P2** wanted soon · **P3** nice to have

---

## Resuming work (read this first)

Everything needed to continue is in the repository — no session history required.

**Where the code is.** Work happens on branch `v1-implementation`, in a git
worktree at `.worktrees/v1-implementation` (gitignored). If it is missing:

```bash
git worktree add .worktrees/v1-implementation v1-implementation
cd .worktrees/v1-implementation && npm install
```

**What to build next.** `docs/superpowers/plans/2026-07-16-lunch-match-v1.md`
contains all 24 tasks in full: exact file paths, complete code, test cases,
verification steps, and the commit command for each. Work them in order. The
checklist below records which are done; `git log --oneline` is the other source
of truth.

**How the work is executed.** Each task: implement → run its verification →
commit → review the diff against the task's requirements → fix findings →
re-review → tick it off here. Findings not worth fixing immediately go under
*Known issues* below rather than being dropped.

**Before starting the dev server:**

```bash
docker compose up -d db     # PostgreSQL
npm run dev                 # http://localhost:3000
```

Do not run `npm run build` while `npm run dev` is running — it overwrites the
dev server's `.next` cache and breaks it until restarted.

**Test accounts.** Accounts are anonymous (Account ID + Recovery Key, shown
once, no reset). `npm run db:seed` creates two demo users near each other in
Berlin and prints their credentials — save them. Several tasks need two accounts
with nearby locations, otherwise matching legitimately returns nothing.

---

## v1 — remaining implementation

Tracked in `docs/superpowers/plans/2026-07-16-lunch-match-v1.md`.

- [x] Tasks 1–4 — scaffolding, Vitest, PostgreSQL, Prisma schema
- [x] Tasks 5–10 — search radius, haversine, identity, match filters, geocoding, meeting points
- [x] Tasks 11–12 — NextAuth config, identity creation API
- [x] Tasks 13–14 — landing page, account recovery page
- [x] Task 15 — design system, UI primitives, navigation
- [x] Tasks 16–17 — profile schema, profile API, profile page
- [x] Tasks 18–19 — match candidates API, Match-finden page (map, list, filters, Match-me)
- [x] Tasks 20–21 — match request creation/list API, detail + messages API
      (plus role-based status authorization: recipient accepts/declines, sender
      withdraws — new `WITHDRAWN` status; GET returns `canRespond`/`canWithdraw`)
- [x] Tasks 22–23 — Nachrichten overview + detail pages (WITHDRAWN label & filter,
      sender withdraw, recipient accept/decline, chat polling, meeting-point map)
- [x] Task 24 — seed script + full two-account end-to-end walkthrough (9/9 scripted
      checks: seeded A finds B, request → chat → accept → geocoded meeting point)
- [x] Final whole-branch code review — 1 blocker + 2 should-fix found and fixed
      (location-precision now enforced server-side; match-request state guarded
      server-side; `?status` validated). Verdict: Ready with follow-ups (below).

---

## Onboarding

- [ ] **P1** **Setup wizard after account creation.**
  Right now a new account lands on an empty profile form with no explanation, and
  nothing tells the user which fields actually matter or why. Without a location
  and a step goal, "Match finden" cannot return anything — so a user can complete
  sign-up and immediately hit a dead end.

  Trigger it directly after the user confirms they have saved their Account ID and
  Recovery Key (the "Weiter zum Profil" step on the landing page), instead of
  dropping them on `/profil`.

  Guide through the minimum viable profile, one step at a time, each with a short
  explanation of *why* the app needs it:
  - **Alias** — what other participants see; you are not asked for a real name.
  - **Location** (address / postal code / city) — the centre of your search
    radius. Explain the precision choice: a street address gives better matches,
    but postal code or city alone is enough if you would rather not share more.
  - **Step goal** — determines how far the app searches (`steps × 0.73 m`).
    Explain the default of 1000 steps ≈ 732 m ≈ a 10-minute walk.
  - **Branche / career level / position** (optional) — used to filter who you get
    matched with. Make clear these are optional, and that Branche is only visible
    to others if explicitly enabled.

  Requirements:
  - Skippable — a user must be able to reach the app without completing it.
  - Resumable — if abandoned, offer it again rather than silently forgetting.
  - Must not become a second source of truth: reuse `lib/validation/profile.ts`
    and `PUT /api/profile`, do not duplicate the schema or the write path.
  - Needs a way to know whether onboarding was completed (a `User` field, or
    derived from whether the required fields are set — decide during design).

- [ ] **P3** Empty-state guidance on `/match-finden` when the profile has no
  location yet: link to the wizard rather than showing a bare error.

---

## Known issues

- [ ] **P2** Pages have no `isError` branch, so a failed fetch leaves them stuck.
  `app/nachrichten/[id]/page.tsx` shows "Lädt…" forever if `GET [id]` fails;
  `app/nachrichten/page.tsx` silently shows nothing (its `data?.length === 0`
  empty-state never triggers when `data` is `undefined`). Same shape as the
  profile and match-finden pages. Inherited from the plan's sample code — add an
  `isError` state to each TanStack Query consumer with a German error message.

- [ ] **P2** `app/profil/page.tsx` renders `[object Object]` on a 400 response.
  `app/api/profile/route.ts:40` returns `parsed.error.flatten()` (an object) and
  the page does `new Error(body.error ?? …)`. Rare in practice, since the client
  validates with the same schema first, but it produces a meaningless message
  when it does happen. Either serialise the zod error into a readable string
  server-side, or handle the object shape on the client.

- [ ] **P2** `geocodeAddress()` returns `null` for both "address not found" and
  "Nominatim unreachable", and `app/api/profile/route.ts:46` maps both to
  *"Standort konnte nicht gefunden werden. Bitte präzisiere die Angabe."* — which
  actively misleads a user whose connection is down into rewriting a perfectly
  good address. Distinguish the two cases.

- [ ] **P3** `lib/__tests__/geocoding.test.ts` — the network-error test prints an
  unsuppressed `console.error`, the only noise in an otherwise pristine suite.
  Suppress it with a spy and assert the logging happened.

- [ ] **P3** `__resetThrottleForTests` is exported from `lib/geocoding.ts`, so a
  test-only hook ships in the production bundle. Inert, but a `__test-utils`
  separation would keep production surface clean.

- [ ] **P3** `app/api/identity/route.ts` has no try/catch around
  `prisma.user.create`. A DB outage surfaces as an unhandled 500 rather than a
  clean JSON error.

- [ ] **P3** `components/Navigation.tsx` highlights the active link with
  `pathname.startsWith(href)`. Safe for the current three routes, but a future
  `/profil-import` would light up the "Profil" link. Use an exact match plus an
  explicit child-path check.

- [ ] **P3** `auth.ts` — the `recoveryKey` credential field has no
  `type: "password"`. Only reachable via NextAuth's fallback form, which is never
  served, but it would render the secret in plain text if it ever were.

- [ ] **P3** `--accent` has no consuming variant in `button.tsx` / `badge.tsx`, so
  `bg-accent` currently compiles to nothing. Either add the variant or drop the
  token.

- [ ] **P3** `MatchStatus` / `MatchType` string-union literals are re-declared
  inline in `nachrichten/page.tsx`, `nachrichten/[id]/page.tsx` and the match
  APIs, alongside the Prisma enum — four copies that can (and once did) drift.
  Derive them from one shared const or `$Enums` from `@prisma/client`.

- [ ] **P3** Leaflet's default marker icons are hard-linked to `unpkg.com` in
  `MapView.tsx` and `SingleMarkerMap.tsx`. Participant/origin/meeting-point
  markers use `divIcon` and are unaffected, but the `SingleMarkerMap` default
  marker and any `L.Icon.Default` fallback break offline / if unpkg is blocked.
  Self-host the three PNGs from `leaflet/dist/images`.

- [ ] **P3** Spec vs. model: the match list is described as showing
  "sofern freigegeben Branche/Position/Karrierelevel", but only `brancheVisible`
  exists — Position and Karrierelevel are always shared. Either add visibility
  flags for those two or accept and document that only Branche is gated.

- [ ] **P3** `karrierelevelParam as Karrierelevel` in the candidates route is an
  unvalidated cast (harmless — a bogus value just yields no matches). Fold into
  the same enum-guard cleanup as the `?status` validation for symmetry.

- [ ] **P3** `MAX_RADIUS_METERS = 15000` is declared separately in both
  `app/api/match/candidates/route.ts` and `app/api/match/meeting-points/route.ts`.
  Two copies of the same limit will drift. Move it next to the other radius
  constants in `lib/searchRadius.ts`.

- [ ] **P3** `app/match-finden/page.tsx` mixes query logic, five filter controls,
  list rendering and dialog composition in one client component. It still reads
  fine, but it is the template the Nachrichten screens are being built against —
  extracting a `useMatchCandidates` hook and a `FilterPanel` would stop the shape
  being copied further.

- [ ] **P3** `POST /api/match-requests` allows a sender to create unlimited
  duplicate OPEN requests to the same person (seen live: pressing "Match me"
  twice created two identical requests). Consider rejecting a new request when an
  OPEN one already exists between the same pair, or de-duplicating in the list.

---

## v2 — from the thesis, out of scope for v1

Described in `docs/superpowers/specs/2026-07-15-lunch-match-app-design.md`.

- [ ] **P2** Dashboard with gamification: weekly leaderboard (top 5 plus your own
  rank), badges, challenges you can accept from other participants.
- [ ] **P2** Step account — book steps from recorded activities, with history and
  period-based evaluation.
- [ ] **P2** Favourites list — save people you have already met for faster
  re-matching, with request buttons directly from the list.
- [ ] **P3** Real fitness-tracker integration to sync steps automatically instead
  of entering them by hand.

---

## Infrastructure & quality

- [ ] **P2** Deployment: no target chosen yet. Needs a hosted PostgreSQL and
  `AUTH_SECRET` in the environment.
- [ ] **P3** Automated E2E coverage (Playwright) for the create-account → profile
  → match → chat path. Deliberately excluded from v1; the manual walkthrough in
  Task 24 is the current substitute.
- [ ] **P3** CI: run `npm test` and `npm run build` on push.
- [ ] **P3** Overpass has no client-side rate limiting, unlike the Nominatim
  client. Judged acceptable because it fires once per page load rather than per
  keystroke — revisit if it ever moves behind a live-updating filter.
