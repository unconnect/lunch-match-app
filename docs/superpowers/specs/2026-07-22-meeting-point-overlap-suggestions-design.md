# Meeting-point suggestions in the overlap of both people's radii

**Date:** 2026-07-22
**Status:** Approved, ready for implementation plan
**Backlog item:** "Suggest meeting points in the overlap of both people's radii"
(P2, Feature enhancements in `TODO.md`)

## Problem

On a match-request detail page (`app/nachrichten/[id]/page.tsx`), the only way
to set a meeting point is a free-text field that geocodes whatever the user
types. Nothing helps the two participants pick a place that is actually
reachable for *both* of them.

## Goal

Offer a ranked list of concrete meeting points that lie inside **both**
participants' step-radii — the lens-shaped intersection of their two search
circles — so a place suggested is one both can comfortably walk to. Clicking a
suggestion applies it directly as the request's meeting point. The existing
free-text field stays as a fallback.

Scope decisions (settled during brainstorming):

- **List only.** No map visualisation in this iteration. A map showing both
  radii and the intersection points is a possible follow-up, tracked separately.
- **Picks apply directly.** A clicked suggestion sends its known name + lat/lng
  straight to the request — no re-geocoding of the name.
- **Tolerance is a user-adjustable filter**, not a fixed constant.

## Architecture

Four units, each independently understandable and testable:

1. A pure geometry/ranking module (`lib/meetingSuggestions.ts`).
2. A new read-only API route that composes that module with Overpass and the
   privacy layer.
3. A small extension to the existing PATCH route + validation schema.
4. A suggestions block added to the detail page.

### 1. Pure logic — `lib/meetingSuggestions.ts`

The testable core. No I/O, no framework.

```ts
export const DEFAULT_OVERLAP_TOLERANCE_STEPS = 1000;

// toleranceMeters = toleranceSteps * STEP_LENGTH_METERS (from lib/searchRadius.ts)

export function circlesOverlap(
  ownOrigin: Coordinates, ownRadiusMeters: number,
  cpOrigin: Coordinates, cpRadiusMeters: number,
  toleranceMeters: number
): boolean;
// haversine(own, cp) <= ownRadius + cpRadius + 2 * toleranceMeters

export interface SuggestionWithDistances extends MeetingPoint {
  distanceOwnMeters: number;
  distanceCounterpartMeters: number;
}

export function suggestionsInIntersection(
  points: MeetingPoint[],
  ownOrigin: Coordinates, ownRadiusMeters: number,
  cpOrigin: Coordinates, cpRadiusMeters: number,
  toleranceMeters: number
): SuggestionWithDistances[];
// keep points within BOTH widened radii
//   (distOwn <= ownRadius + tol) && (distCp <= cpRadius + tol)
// annotate each with distanceOwnMeters / distanceCounterpartMeters
// rank by max(distOwn, distCp) ascending — most comfortably reachable for
//   both first
```

`toleranceMeters` is a parameter, not a hardcoded value; the default lives in
`DEFAULT_OVERLAP_TOLERANCE_STEPS` and is converted to metres by the caller using
`STEP_LENGTH_METERS`.

### 2. New endpoint — `GET /api/match-requests/[id]/meeting-suggestions`

Read-only. Kept separate from the detail `GET` so the (slower, un-throttled)
Overpass call never rides on the detail page's 4 s polling — the same
candidates-vs-meeting-points split already used on the Match-finden screen.

- **Authorisation:** reuse `getAuthorizedMatchRequest(id, session.user.id)`.
  401 if unauthenticated, 404 if not found or the user is not a participant.
- **Inputs it loads:** both users' `lat`, `lng`, `schritteziel`,
  `locationPrecision`.
- **Origins:**
  - `ownOrigin` = the current user's **exact** point.
  - `cpOrigin` = `coarsenCoordinates(counterpartExactPoint,
    counterpart.locationPrecision)` — the counterpart's exact point never leaves
    the server. The intersection is computed against the coarsened point, which
    can make it coarser; that is acceptable and intended.
- **Radii:** `calculateSearchRadiusMeters(schritteziel)` for each user (same
  maths and default as elsewhere).
- **Tolerance:** `toleranceSteps` query param. Validation mirrors the existing
  `radius` param handling: non-finite or negative → `400`; otherwise clamped to
  `0 … 20000` steps. Missing → `DEFAULT_OVERLAP_TOLERANCE_STEPS`. Converted to
  metres via `STEP_LENGTH_METERS`.
- **Candidate points:** one Overpass call via the existing
  `findMeetingPoints(ownOrigin, queryRadiusMeters)` where
  `queryRadiusMeters = min(ownRadius + toleranceMeters, MAX_RADIUS_METERS)`.
  Querying around the current user's origin with the widened radius provably
  contains the whole lens (every intersection point is within
  `ownRadius + tol` of `ownOrigin`), so a single call suffices. No cuisine
  filter (the detail page has none).
- **Filter + rank:** `suggestionsInIntersection(...)`.
- **Response shape:**

  ```jsonc
  {
    "suggestions": [
      { "id": "…", "name": "…", "lat": 0, "lng": 0,
        "distanceOwnMeters": 0, "distanceCounterpartMeters": 0 }
    ],
    "reason": null            // or a string explaining an empty list
  }
  ```

  `reason` ∈
  `null | "counterpart-no-location" | "no-overlap" | "none-found"`:
  - `counterpart-no-location` — the counterpart has no `lat`/`lng` (or the
    current user does not, though that path is already blocked upstream).
  - `no-overlap` — `circlesOverlap(...)` is false; skip Overpass entirely.
  - `none-found` — circles overlap but no POI fell inside both.
  - `null` — one or more suggestions returned.

  `MAX_RADIUS_METERS = 15000` is reused with the same justification as the other
  match routes (kept local, consistent with the existing duplication note there;
  no new shared constant introduced by this work).

### 3. PATCH extension — apply a pick directly

Extend `lib/validation/matchRequest.ts`:

```ts
export const updateMatchRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]).optional(),
  meetingPointQuery: z.string().min(1).max(200).optional(),   // free-text (geocoded)
  meetingPoint: z.object({                                     // structured (direct)
    name: z.string().min(1).max(200),
    lat: z.number().gte(-90).lte(90),
    lng: z.number().gte(-180).lte(180),
  }).optional(),
});
```

In `app/api/match-requests/[id]/route.ts` PATCH:

- If `meetingPoint` is present, write `meetingPointName/Lat/Lng` straight from
  it — no geocoding.
- `meetingPointQuery` keeps its existing geocode path unchanged.
- The two are mutually independent; if both are somehow sent, prefer the
  structured `meetingPoint` (it is already precise). All the existing terminal-
  state (`isClosed`) and status-authorisation guards continue to apply first and
  unchanged.

### 4. Frontend — `app/nachrichten/[id]/page.tsx`

Inside the Treffpunkt card, shown only when the request is **not closed** (same
condition that already gates the free-text form):

- A **"Vorschläge in eurer Nähe"** block.
- A **"Toleranz (Schritte)"** number input, default `1000`, styled like the
  "Suchradius (Meter)" field on Match-finden, with a one-line hint that a higher
  value widens both reaches so more places qualify. Its value is debounced
  (~350 ms, reusing `useDebouncedValue`) and feeds the query key.
- A TanStack `useQuery` against the new endpoint, keyed by `[id, toleranceSteps]`.
- Renders the ranked list: each row shows the name and both walking distances in
  **steps** (`metersToSteps`), and a button that fires a mutation
  `PATCH { meetingPoint: { name, lat, lng } }`, then invalidates
  `["match-request", id]` so the Treffpunkt card and its map update.
- Empty / loading states:
  - loading → "Lädt Vorschläge…"
  - `reason === "counterpart-no-location"` → explain the other person has no
    location set yet.
  - `reason === "no-overlap"` → explain the radii don't overlap; suggest raising
    tolerance or using free text.
  - `reason === "none-found"` → explain no places were found in the overlap.
- The existing free-text field stays below as the fallback.

## Data flow

```
detail page
  ├─ GET /api/match-requests/[id]                (unchanged; 4 s poll)
  ├─ GET /api/match-requests/[id]/messages       (unchanged; 4 s poll)
  └─ GET /api/match-requests/[id]/meeting-suggestions?toleranceSteps=N   (new)
        → getAuthorizedMatchRequest (authz)
        → load both users' location + schritteziel + precision
        → coarsen counterpart origin (locationPrivacy)
        → circlesOverlap? no → { reason: "no-overlap" }
        → findMeetingPoints(ownOrigin, min(ownRadius+tol, MAX))   (Overpass)
        → suggestionsInIntersection(...)  → ranked list
  click suggestion
        → PATCH /api/match-requests/[id] { meetingPoint }         (no geocode)
        → invalidate ["match-request", id]
```

## Error handling

- Endpoint returns `401` (unauthenticated) / `404` (not a participant) via the
  shared authz helper.
- Invalid `toleranceSteps` → `400` with a German message, matching the radius
  param convention.
- Overpass failure is already swallowed by `findMeetingPoints` (returns `[]`),
  which surfaces as `reason: "none-found"` — the core people/matching flow is
  never blocked by a flaky Overpass response.
- PATCH's existing guards (closed request, status authorisation, geocode
  failure) are unchanged and run before any meeting-point write.

## Testing

- **Unit tests** for `lib/meetingSuggestions.ts` (the pure core):
  - `circlesOverlap`: overlapping, exactly touching, disjoint, and the tolerance
    boundary (a disjoint pair that overlaps once tolerance is added).
  - `suggestionsInIntersection`: a point inside both circles kept; a point
    inside only one dropped; correct `distanceOwn`/`distanceCounterpart`
    annotation; ranking by `max(dist)` ascending; a point outside the strict
    intersection that a raised tolerance brings in.
- **API routes and page** are not unit-tested, consistent with the rest of the
  codebase (no route has a test today); the pure module carries the logic worth
  testing. Manual verification: seeded two-account walkthrough on the detail
  page, adjusting tolerance and applying a suggestion.

## Out of scope (possible follow-ups)

- Map visualisation of both radii + intersection points with click-to-pick.
- Cuisine/diet filtering of suggestions.
- Making an applied meeting point negotiable (accept/reject/counter) — already a
  separate P2 backlog item.
