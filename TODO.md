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

- [x] `POST /api/match-requests` allowed unlimited duplicate active requests to
  the same person. Fixed together with "Reflect already-requested state" below:
  the route now rejects a new request when an OPEN/ACCEPTED one already exists
  between the pair (409 + `existingRequestId`).

---

## Public deployment

Obligations and housekeeping that only exist because the app is publicly
reachable at https://lunchmatch.nikolasreuber.de. None of these were needed
while it ran on localhost.

- [x] **P1** **Account deletion.** `DELETE /api/identity`, confirmed by typing
  one's own Account ID (re-checked server-side). Erases the profile, the user's
  messages and meeting-point proposals, and the credentials; keeps the `User`
  row as an empty shell because `MatchRequest` holds non-nullable FKs to it, so
  the counterpart sees a tombstoned conversation rather than a vanished one. A
  request whose other participant is already deleted is destroyed outright.
  Tombstoned threads are frozen server-side (409 on messages, status changes and
  proposals). Decision logic in `lib/accountDeletion.ts`.

- [x] **P1** **Impressum and Datenschutzerklärung.** Public pages at
  `/impressum` and `/datenschutz`, linked from a site-wide footer. The
  Datenschutzerklärung documents what the code actually does: the stored fields,
  the server-side coordinate coarsening and what each precision reveals,
  Nominatim/Overpass/Cloudflare as recipients, the session cookie, the deletion
  route and what survives it, the absence of account recovery, and the caveat
  that anonymous accounts make an erasure request hard to attribute to a person.

- [ ] **P1** **Fill in `lib/legalEntity.ts`.** Both legal pages read the
  operator's name, address and contact from there, and it still holds
  placeholders — while `isPlaceholder` is true they render a visible warning
  instead of pretending to be valid. Neither page is legally effective until
  this is done, so it blocks any wider announcement of the public URL.
  Worth a lawyer's eye on the wording too; the drafts are written from the code,
  not from legal advice.

- [ ] **P2** **Reset the demo accounts on a schedule (~24 h).** The demo
  credentials in `lib/demoAccounts.ts` are public, so anyone can edit those
  profiles and write into their conversations. Left alone, the demo data drifts
  from the curated state the landing page promises and will eventually contain
  something unpleasant.

  **This must not reuse `prisma/seed.ts` as-is.** That script wipes *every*
  user, match request and message — running it on a schedule would delete real
  visitors' accounts daily, which is precisely what the two guards added in
  `assertSeedingAllowed` / `assertNoRealAccounts` exist to prevent. What is
  needed is a narrower reset that touches only rows belonging to the twelve demo
  accounts: delete their messages, proposals and match requests, restore their
  profile fields, and recreate the seeded conversations — leaving every other
  account untouched. Worth extracting the demo-data definition out of the seed
  script so both paths share one source of truth.

  Delivery is open: a scheduled container in the Portainer stack is the obvious
  fit (same shape as the backup sidecar), but the reset logic itself belongs in
  a pure, testable module under `lib/` per the testing-scope rule in CLAUDE.md.

---

## Feature enhancements

Refinements to the matching and meeting-point flow, beyond what v1 shipped.

- [x] **Show step-radius circles on the "Match finden" map.** Done. The current
  user's search radius is drawn as a subtle circle around their origin marker
  (green `--accent`, thin stroke, 7% fill); selecting a person draws *their* step
  radius as a second, visually distinct circle around their marker (amber
  `--primary`, dashed). The candidates API now returns each candidate's
  `radiusMeters`, centred on the already-coarsened coordinate so it inherits
  `locationPrecision` (no extra leak). Circles are non-interactive and sit in
  Leaflet's overlay pane below the markers, so markers stay clickable and on top.
  Colours resolve from theme tokens at runtime (`themeHsl` helper) since Leaflet
  paints SVG via presentation attributes where `var(--…)` wouldn't resolve.
  - Known limitation: at the default zoom (15) a typical radius (730 m–3 km) has
    its edge off-screen, so the full ring only shows after zooming out. Left the
    default zoom alone deliberately — fitting to the radius would shrink the
    participant/meeting-point markers, which is the primary browsing view.
  - Foundational for the overlap feature below and its follow-up.

- [x] **P2** **Suggest meeting points in the overlap of both people's radii.**
  Done, manually verified end-to-end. Shipped as a list on the match-request
  detail page (no map — the map UI stays the P3 follow-up below). A new
  `GET /api/match-requests/[id]/meeting-suggestions` composes the pure geometry
  module `lib/meetingSuggestions.ts` (`circlesOverlap` + `suggestionsInIntersection`,
  ranked by `max(distOwn, distCp)`) with Overpass and `lib/locationPrivacy.ts`
  (counterpart origin coarsened, exact point never leaves the server). Tolerance
  is a user-adjustable "Toleranz (Schritte)" filter (default 1000). Clicking a
  suggestion applies it directly via `PATCH { meetingPoint }` (no re-geocode);
  free text stays as the fallback. Enhancement: the list loads on demand ("Lade
  10 Vorschläge"), reveals 10 at a time (random draw, ordered within each batch,
  `lib/meetingSuggestionsPaging.ts`), is closable, and marks the applied place
  ("Übernommen"). Specs/plans under `docs/superpowers/`.
  Original spec below, for reference:
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

- [ ] **P2** **Show the address and a relative-to-home map for a proposed meeting point.**
  Follow-up to the negotiation feature. A proposal currently shows only the place
  name. Make it easier for each person to judge a proposed spot:
  - **Address:** reverse-geocode the meeting point's lat/lng to a human address and
    show it alongside the name (both in the Treffpunkt card and the proposal's
    chat entry), so "Café X" isn't the only cue. Reuse the geocoding layer
    (`lib/geocoding.ts` is currently forward-only via Nominatim — add a reverse
    lookup, cached/throttled the same way; store the resolved address on the
    proposal so it isn't re-fetched on every poll).
  - **Map per viewer:** in the proposal (card and/or its chat entry), render a small
    map with the meeting-point marker **and the viewing user's own home pin**, so
    each side sees the spot relative to where they start. This is per-viewer — each
    user sees their *own* home, never the counterpart's (the counterpart's exact
    point must stay server-side; only the viewer's own location is shown to them).
    Extend `SingleMarkerMap.tsx` into a two-marker variant (meeting point + own
    origin) rather than forking it.
  - The own-origin coordinate is already on the user record; the meeting point is
    on the proposal — no new privacy surface beyond the viewer's own location.

- [ ] **P2** **Show dates/timestamps on messages, matches, and match-list cards.**
  Right now nothing on the message and match views is tied to a date, so you
  cannot tell whether something is from today, yesterday, or last week. Surface a
  timestamp everywhere it matters:
  - Chat messages in `nachrichten/[id]` — each message needs a visible time (and a
    day separator / date once it crosses a day boundary).
  - Match/conversation entries in the `nachrichten` overview — show when the last
    activity was.
  - The candidate cards in the "Match finden" list — show the relevant date
    **relative** ("heute", "gestern", "vor 3 Tagen"), not an absolute timestamp, so
    it's readable at a glance.
  - Use one shared relative-time helper (German output) across all three so the
    formatting doesn't drift; consider absolute-on-hover (`title`) for precision.
  - The data is already there (`createdAt`/`updatedAt` on the relevant models) —
    this is mostly a display change; confirm the candidates API returns whatever
    date the card should key off before wiring the UI.

- [ ] **P2** **Unread badge on the "Nachrichten" tab (+ a plan for near-real-time updates).**
  Show a count badge on the Nachrichten nav item when there are new/unread messages,
  so a user notices activity without opening every conversation.
  - **Needs an unread model first.** There's no read-state today — messages only have
    `createdAt`. Add per-user, per-conversation read tracking (e.g. a `lastReadAt`
    per participant on the match request, or a small `ConversationRead` row), then
    "unread" = messages after `lastReadAt` not sent by the viewer. Opening a
    conversation updates `lastReadAt`. The badge count is a cheap aggregate over that.
  - **Freshness — options, roughly increasing effort/quality:**
    1. **Interval poll (simplest):** a lightweight `GET /api/unread-count` polled every
       X (30–60 s) from the nav, keyed in TanStack Query. Matches the existing 4 s
       detail/message polling pattern; no new infra. Downside: not instant, constant
       background requests.
    2. **Server-Sent Events (recommended balance):** one `EventSource` stream that
       pushes an unread-count update when a message arrives. One-way, plain HTTP,
       works with a route handler — but needs a long-lived connection, so it must run
       on the Node runtime, not the Edge/serverless default (confirm the deploy target
       supports held-open responses).
    3. **WebSockets / hosted realtime (Pusher, Ably, Supabase Realtime):** true
       bidirectional push, lowest latency, but adds a service/custom server this app
       doesn't currently have — overkill unless realtime chat delivery (not just a
       badge) becomes a goal.
  - **Recommendation:** start with option 1 (poll a count endpoint) since it reuses the
    existing pattern and ships the badge immediately; revisit SSE if the polling feels
    laggy or wasteful. Decide the unread model first — both approaches depend on it.

- [x] **Reflect already-requested state in "Match finden".** Done. A candidate
  the current user has an active (OPEN/ACCEPTED) request with — either direction —
  is no longer re-requestable: candidates API returns `activeRequestId`; the list
  card shows a disabled "Bereits angefragt" (✓) plus a "Nachricht öffnen" link to
  the conversation; "Match me" draws only from not-yet-requested people; the map
  marks already-requested people with a distinct green check marker; and the POST
  route rejects duplicates server-side. Closed (declined/withdrawn) requests don't
  count, so a person can be asked again after a closed one.
  - Possible follow-up polish: currently the whole card still highlights on click
    for already-requested people too; fine, but a dedicated "connected" card style
    could read even clearer. Low priority.
- [ ] **P3** Add preferred Meeting-Times. 
  - Filter matches based on that.
  - Filter Meeting Points based on that.
- [ ] Better UX / UI for "Match me". It was unclear to me that it instantly sends 
      the request when clicked. Maybe a toast or some other kind of visual 
      feedback should indicate that. Or a confirmation dialog should be added
      before an actual request it sent.
- [ ] Enhance the detail view: The wireframe shows it a bit different and in two columns.

---

## Internationalisation (i18n)

The app is currently German-only: every user-facing string is a hardcoded German
literal, and the route paths are German too (`/match-finden`,
`/konto-wiederherstellen`, `/nachrichten`, `/profil`). Make the app
translatable and stop baking the language into the URLs.

- [ ] **P2** **Extract all UI strings into a translation layer.**
  Today German copy is inlined across every page and component (pages under
  `app/`, the `RequestDialog`, `Navigation`, map popups/labels in `MapView.tsx`,
  server-side error messages returned from the `app/api/**` routes, and the seed
  script's console output). Move them into message catalogues keyed by locale so
  nothing user-facing is a bare literal.
  - Pick a library — `next-intl` is the natural fit for the App Router (locale
    segment + `useTranslations` on the client and `getTranslations` on the
    server, so the API routes can localise their error strings too). Decide
    during design; `next-i18next` and the App Router's built-in patterns are the
    alternatives.
  - Keep German (`de`) as the default/source locale so nothing regresses; add
    English (`en`) as the second locale to prove the plumbing end-to-end.
  - Don't forget the non-obvious surfaces: `<html lang>`, `metadata`/`<title>`,
    date/number/relative-time formatting (ties into the "relative dates on cards"
    item under *Feature enhancements* — use the same locale-aware formatter),
    zod validation messages, and enum labels (`karrierelevelLabels`, status
    labels) that are currently German maps.
  - A language switch in the UI (or at least honouring the `Accept-Language`
    header) so a user can actually reach the English version.

- [ ] **P2** **Make the routes English or locale-aware, not German-hardcoded.**
  The paths themselves are German. Two viable shapes — decide during design:
  - **Localised pathnames** (preferred if we do i18n properly): a `[locale]`
    segment with per-locale path names, e.g. `next-intl`'s `pathnames` mapping
    (`/de/match-finden` ↔ `/en/find-match`, `/de/nachrichten` ↔ `/en/messages`,
    `/de/profil` ↔ `/en/profile`, `/de/konto-wiederherstellen` ↔
    `/en/recover-account`). The URL then follows the active locale.
  - **Plain English rename** (simpler, if we don't want localised URLs):
    `/match-finden` → `/find-match`, `/nachrichten` → `/messages`, `/profil` →
    `/profile`, `/konto-wiederherstellen` → `/recover-account`. API routes under
    `/api/match/**` are already English and can stay.
  - Whichever we pick, this touches every hardcoded path: `middleware.ts`'s
    `matcher`, the `<Link href>`s and `router.push`/redirects across the pages
    (Navigation, landing page, match-finden, nachrichten), and any NextAuth
    redirect/callback URLs. Add redirects from the old German paths so existing
    links/bookmarks don't 404.

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

- [x] **P2** Deployment: Raspberry Pi (arm64) behind SWAG, released via GitHub
  Release → GHCR → Portainer webhook. See `deploy/README.md` for the flow and
  the one-time host setup. Public at https://lunchmatch.nikolasreuber.de.
- [x] **P3** Release builds run fully under QEMU emulation, which is slow. The
  cross-build shortcut (build on the amd64 runner, ship arm64) is *not* viable:
  `binaryTargets` can retarget Prisma's query engine, but the schema engine used
  by `prisma migrate deploy` is downloaded for whichever platform ran `npm ci`
  and has no equivalent knob, so a cross-built image cannot migrate. The way out
  is a native arm64 runner, not cross-compilation. See the header comment in
  `Dockerfile`.
- [ ] **P3** Backup restores are only verified by hand. Worth a scripted drill
  (restore into a scratch database, count rows) before the demo carries data
  anyone cares about.
- [ ] **P3** Automated E2E coverage (Playwright) for the create-account → profile
  → match → chat path. Deliberately excluded from v1; the manual walkthrough in
  Task 24 is the current substitute.
- [ ] **P3** CI: run `npm test` and `npm run build` on push.
- [ ] **P3** Overpass has no client-side rate limiting, unlike the Nominatim
  client. Judged acceptable because it fires once per page load rather than per
  keystroke — revisit if it ever moves behind a live-updating filter.

---

## Mobile optimizations

- [ ] main navigation has issues on small viewports. items collide into each other.
- [ ] Messages views filter pushes out of the viewports leading to scrolling horizontically.