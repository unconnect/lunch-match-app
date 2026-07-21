# TODO

Backlog for the Lunch Match app. Updated as work progresses.

Legend: `[ ]` open · `[x]` done · **P1** blocks v1 · **P2** wanted soon · **P3** nice to have

---

## Resuming work (read this first)

Everything needed to continue is in the repository — no session history required.

**Status.** The v1 implementation plan
(`docs/superpowers/plans/2026-07-16-lunch-match-v1.md`, all 24 tasks) is
**complete and merged into `main`**, including the final whole-branch review.
What remains is the backlog below: the onboarding wizard, known issues, feature
enhancements, and the v2 scope from the thesis. `git log --oneline` is the
authoritative history.

**Where the code is.** All on branch `main` in this repository root — there is
no longer a separate worktree or `v1-implementation` branch (merged and removed).

**Running it:**

```bash
docker compose up -d db     # PostgreSQL on :5432
npm run dev                 # http://localhost:3000
```

Do not run `npm run build` while `npm run dev` is running — it overwrites the
dev server's `.next` cache and breaks it until restarted. Run only one dev
server and one DB container at a time (a second of either, e.g. from another
checkout, races on the same `.next` / port 5432 and corrupts things).

**Test accounts.** Accounts are anonymous (Account ID + Recovery Key, shown
once, no reset). `npm run db:seed` wipes and recreates 12 demo users across
Berlin-Mitte plus match requests in every status, and prints all credentials.
Sign in as "Nutzerin A" — she has a full match list and messages in every state.

**How new backlog work should be executed.** Each unit: implement → run its
verification → commit → review the diff against requirements → fix findings →
re-review. Findings not worth fixing immediately go under *Known issues* rather
than being dropped.

---

## v1 — implementation plan (complete ✅)

All 24 tasks from `docs/superpowers/plans/2026-07-16-lunch-match-v1.md` are
implemented, reviewed, and merged into `main`. Nothing here is outstanding.

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
  Note: largely subsumed by "Reflect already-requested state in Match finden"
  under *Feature enhancements* below — do them together.

---

## Feature enhancements

Refinements to the matching and meeting-point flow, beyond what v1 shipped.

- [ ] **P2** **Show step-radius circles on the "Match finden" map.**
  Draw the current user's search radius as a light, semi-transparent circle
  around their own marker (radius = `schritteziel × 0.73 m`, same maths as
  `lib/searchRadius.ts` / the candidates API — it already returns `radiusMeters`,
  so reuse it rather than recomputing). Leaflet's `<Circle>` (react-leaflet)
  centred on the origin does this directly. When a user in the result list / on
  the map is selected (clicked), also draw *their* step radius as a second circle
  around their marker, using their step goal.
  - This needs each candidate's radius (or step goal) from the candidates API,
    which it does not currently return — add it. Respect `locationPrecision`:
    the circle is centred on the already-coarsened coordinate the API returns, so
    it inherits the same privacy behaviour (no extra leak).
  - Keep it subtle so it doesn't drown the markers (low opacity fill, thin
    stroke, theme colours — own radius vs. selected radius visually distinct).
  - Foundational for the overlap feature below and its follow-up.

- [ ] **P2** **Suggest meeting points in the overlap of both people's radii.**
  Today the "Treffpunkt vorschlagen" field is a free-text box that geocodes
  whatever the user types. Instead, offer concrete suggestions that are actually
  reachable for *both* participants:
  - Compute the two search radii (each person's `schritteziel × 0.73 m`, with the
    same default as elsewhere), optionally widened by a tolerance (~±1000 steps —
    tune this) so the overlap isn't empty for people at the edge of each other's
    range.
  - Find meeting points (reuse the Overpass client, `lib/meetingPoints.ts`) that
    lie inside *both* radii — i.e. within the lens-shaped intersection of the two
    circles, not just one person's radius.
  - Present them as a list; clicking a suggestion fills it into the existing
    free-text field as the proposal (keep free text as a fallback).
  - Alternative / additional UI: a map showing both participants' locations, both
    step radii, and the candidate points in the intersection, with click-to-pick.
    Respect `locationPrecision` — a person who chose POSTAL_CODE/CITY must not have
    their exact point revealed here either (reuse `lib/locationPrivacy.ts`; note
    this makes the intersection coarser, which is acceptable).
  - Server-side, this needs the counterpart's location and step goal, which the
    match-request detail API does not currently expose — extend it carefully so it
    still doesn't leak more than `locationPrecision` allows.

- [ ] **P3** **Highlight meeting points inside the shown radius intersection.**
  Follow-up to the two items above — depends on both "Show step-radius circles on
  the map" and "Suggest meeting points in the overlap". Once both radii are drawn
  on the meeting-point map, visually highlight every candidate meeting point that
  falls inside the lens-shaped intersection of the two circles (distinct marker
  colour/emphasis from points outside it), so the reachable-for-both options are
  obvious at a glance and directly pickable from the map.

- [ ] **P2** **Make meeting points negotiable (propose → accept/reject → counter).**
  A proposed meeting point should be acceptable or rejectable by the other person,
  who can also make a counter-proposal, which is then in turn acceptable/rejectable
  — a small back-and-forth until both agree. Needs a data model for the current
  proposal and its state (proposed-by, status: pending/accepted/rejected), rather
  than the single `meetingPoint{Name,Lat,Lng}` fields the request has now. Consider
  whether an accepted meeting point should lock the field. Keep it in the same
  detail view as the chat.

- [ ] **P2** **Reflect already-requested state in "Match finden".**
  Once a user has been sent a request, they should no longer be re-requestable from
  the match screen:
  - Exclude them from the random "Match me" pool (no second automatic request to
    someone already asked).
  - Disable the per-person "Anfragen" button; replace it with a "Bereits angefragt"
    label + check icon, plus a second button that jumps to the existing
    conversation in Nachrichten.
  - On the map, mark an already-requested person's marker distinctly (a badge /
    different colour) so it's visible there too.
  - Needs the candidates API (`app/api/match/candidates/route.ts`) to know which
    listed users the current user already has a request with (any non-closed
    request, at least). This also covers the duplicate-OPEN-request known issue
    above. Exact visual treatment (badge vs. colour, button layout) is worth a
    quick design pass before building.

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
