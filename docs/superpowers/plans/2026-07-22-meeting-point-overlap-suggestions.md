# Meeting-point overlap suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer a ranked, tolerance-adjustable list of meeting points that lie inside both participants' step-radii on the match-request detail page, with one-click apply.

**Architecture:** A pure geometry/ranking module carries all the testable logic. A new read-only API route composes it with Overpass and the privacy layer. The existing PATCH route gains a structured "apply a pick directly" path. The detail page gets a suggestions block that queries the route and applies picks via PATCH.

**Tech Stack:** Next.js (app router) API routes, Prisma, Zod, TanStack Query, Vitest, TypeScript. Overpass via existing `lib/meetingPoints.ts`.

## Global Constraints

- **Step length:** `STEP_LENGTH_METERS = 0.73` (from `lib/searchRadius.ts`) — never redefine; import it.
- **Default tolerance:** `DEFAULT_OVERLAP_TOLERANCE_STEPS = 1000`, converted to metres by the caller.
- **Max radius:** `MAX_RADIUS_METERS = 15000`, kept local to the route (consistent with the existing duplication note in `app/api/match/meeting-points/route.ts`; do not introduce a shared constant).
- **Privacy:** the counterpart's exact point must never leave the server — coarsen it with `coarsenCoordinates` before use.
- **UI copy is German**, matching the rest of the app.
- **Distance maths:** use `haversineDistanceMeters` from `lib/geo.ts`; steps display uses `metersToSteps` from `lib/searchRadius.ts`.
- **Test runner:** `npm run test` (Vitest, `vitest run`). Tests live in `lib/__tests__/`.

---

### Task 1: Pure geometry/ranking module — `lib/meetingSuggestions.ts`

The testable core. No I/O, no framework. This is the only task with unit tests.

**Files:**
- Create: `lib/meetingSuggestions.ts`
- Test: `lib/__tests__/meetingSuggestions.test.ts`

**Interfaces:**
- Consumes: `Coordinates` and `haversineDistanceMeters` from `@/lib/geo`; `MeetingPoint` from `@/lib/meetingPoints`.
- Produces (later tasks rely on these exact names/types):
  - `DEFAULT_OVERLAP_TOLERANCE_STEPS: number` (= 1000)
  - `circlesOverlap(ownOrigin: Coordinates, ownRadiusMeters: number, cpOrigin: Coordinates, cpRadiusMeters: number, toleranceMeters: number): boolean`
  - `interface SuggestionWithDistances extends MeetingPoint { distanceOwnMeters: number; distanceCounterpartMeters: number; }`
  - `suggestionsInIntersection(points: MeetingPoint[], ownOrigin: Coordinates, ownRadiusMeters: number, cpOrigin: Coordinates, cpRadiusMeters: number, toleranceMeters: number): SuggestionWithDistances[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/meetingSuggestions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  circlesOverlap,
  suggestionsInIntersection,
  DEFAULT_OVERLAP_TOLERANCE_STEPS,
} from "@/lib/meetingSuggestions";
import type { MeetingPoint } from "@/lib/meetingPoints";

// Two origins ~1.4 km apart in Berlin. At this latitude 0.01° lng ≈ 730 m,
// so lng deltas give predictable, roughly east-west distances.
const own = { lat: 52.52, lng: 13.4 };
const cp = { lat: 52.52, lng: 13.42 }; // ~1360 m east of `own`

describe("DEFAULT_OVERLAP_TOLERANCE_STEPS", () => {
  it("is 1000 steps", () => {
    expect(DEFAULT_OVERLAP_TOLERANCE_STEPS).toBe(1000);
  });
});

describe("circlesOverlap", () => {
  it("returns true when the circles clearly overlap", () => {
    // 1000 + 1000 = 2000 m of combined radius vs ~1360 m apart.
    expect(circlesOverlap(own, 1000, cp, 1000, 0)).toBe(true);
  });

  it("returns true when the circles exactly touch (sum equals distance)", () => {
    const d = 1360; // approx; use small radii that sum to just over the gap
    // 680 + 680 = 1360 ≈ distance → touching counts as overlap (<=).
    expect(circlesOverlap(own, 680, cp, 680, 0)).toBe(true);
  });

  it("returns false when the circles are disjoint", () => {
    expect(circlesOverlap(own, 300, cp, 300, 0)).toBe(false);
  });

  it("becomes true at the tolerance boundary", () => {
    // 300 + 300 = 600 m combined; ~1360 m apart → disjoint without tolerance.
    expect(circlesOverlap(own, 300, cp, 300, 0)).toBe(false);
    // Adding 2 * 400 = 800 m widens combined reach to 1400 m > 1360 → overlap.
    expect(circlesOverlap(own, 300, cp, 300, 400)).toBe(true);
  });
});

describe("suggestionsInIntersection", () => {
  // A point at own+0.01 lng sits ~730 m east of own, ~630 m west of cp.
  const between: MeetingPoint = { id: "mid", name: "Mitte", lat: 52.52, lng: 13.41 };
  // A point at own's location: inside own, but ~1360 m from cp.
  const nearOwn: MeetingPoint = { id: "own", name: "Bei mir", lat: 52.52, lng: 13.4 };

  it("keeps a point inside both widened radii", () => {
    const result = suggestionsInIntersection([between], own, 1000, cp, 1000, 0);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mid");
  });

  it("drops a point inside only one radius", () => {
    // nearOwn is within own's 1000 m but ~1360 m from cp (> 1000 m).
    const result = suggestionsInIntersection([nearOwn], own, 1000, cp, 1000, 0);
    expect(result).toHaveLength(0);
  });

  it("annotates each suggestion with both distances", () => {
    const [s] = suggestionsInIntersection([between], own, 1000, cp, 1000, 0);
    expect(s.distanceOwnMeters).toBeGreaterThan(600);
    expect(s.distanceOwnMeters).toBeLessThan(850);
    expect(s.distanceCounterpartMeters).toBeGreaterThan(500);
    expect(s.distanceCounterpartMeters).toBeLessThan(750);
  });

  it("ranks by max(distOwn, distCp) ascending", () => {
    const balanced: MeetingPoint = { id: "balanced", name: "Ausgewogen", lat: 52.52, lng: 13.41 };
    const lopsided: MeetingPoint = { id: "lopsided", name: "Schief", lat: 52.52, lng: 13.405 };
    const result = suggestionsInIntersection([lopsided, balanced], own, 1000, cp, 1000, 0);
    // balanced is roughly equidistant (max ~730); lopsided is close to own but
    // far from cp (max ~1000) → balanced ranks first.
    expect(result.map((s) => s.id)).toEqual(["balanced", "lopsided"]);
  });

  it("brings in a point that only qualifies once tolerance is raised", () => {
    // nearOwn is ~1360 m from cp; with cpRadius 1000 it fails, but a 400 m
    // tolerance widens cp's reach to 1400 m → it now qualifies.
    const strict = suggestionsInIntersection([nearOwn], own, 2000, cp, 1000, 0);
    expect(strict).toHaveLength(0);
    const loose = suggestionsInIntersection([nearOwn], own, 2000, cp, 1000, 400);
    expect(loose).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- meetingSuggestions`
Expected: FAIL — cannot resolve `@/lib/meetingSuggestions` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/meetingSuggestions.ts`:

```ts
import type { Coordinates } from "@/lib/geo";
import { haversineDistanceMeters } from "@/lib/geo";
import type { MeetingPoint } from "@/lib/meetingPoints";

/**
 * Default extra reach, in steps, added to BOTH participants' radii when
 * looking for meeting points in the overlap of their search circles. A
 * user-adjustable filter on the detail page overrides it. Converted to
 * metres by the caller via STEP_LENGTH_METERS.
 */
export const DEFAULT_OVERLAP_TOLERANCE_STEPS = 1000;

/**
 * Do the two search circles overlap once each is widened by `toleranceMeters`?
 * Touching counts as overlap (<=). Cheap gate so the caller can skip Overpass
 * entirely when there is provably no shared reachable area.
 */
export function circlesOverlap(
  ownOrigin: Coordinates,
  ownRadiusMeters: number,
  cpOrigin: Coordinates,
  cpRadiusMeters: number,
  toleranceMeters: number
): boolean {
  const distance = haversineDistanceMeters(ownOrigin, cpOrigin);
  return distance <= ownRadiusMeters + cpRadiusMeters + 2 * toleranceMeters;
}

export interface SuggestionWithDistances extends MeetingPoint {
  distanceOwnMeters: number;
  distanceCounterpartMeters: number;
}

/**
 * Keep only points that lie inside BOTH widened radii, annotate each with the
 * walking distance to each participant, and rank by the worse of the two
 * distances ascending — the most comfortably reachable for both comes first.
 */
export function suggestionsInIntersection(
  points: MeetingPoint[],
  ownOrigin: Coordinates,
  ownRadiusMeters: number,
  cpOrigin: Coordinates,
  cpRadiusMeters: number,
  toleranceMeters: number
): SuggestionWithDistances[] {
  const ownLimit = ownRadiusMeters + toleranceMeters;
  const cpLimit = cpRadiusMeters + toleranceMeters;

  return points
    .map((point) => ({
      ...point,
      distanceOwnMeters: haversineDistanceMeters(ownOrigin, point),
      distanceCounterpartMeters: haversineDistanceMeters(cpOrigin, point),
    }))
    .filter(
      (point) =>
        point.distanceOwnMeters <= ownLimit && point.distanceCounterpartMeters <= cpLimit
    )
    .sort(
      (a, b) =>
        Math.max(a.distanceOwnMeters, a.distanceCounterpartMeters) -
        Math.max(b.distanceOwnMeters, b.distanceCounterpartMeters)
    );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- meetingSuggestions`
Expected: PASS (all cases green). If a boundary assertion is off by a few metres, adjust the *test's* numeric bounds to match the real haversine result — do not weaken the logic.

- [ ] **Step 5: Commit**

```bash
git add lib/meetingSuggestions.ts lib/__tests__/meetingSuggestions.test.ts
git commit -m "feat: pure meeting-point overlap suggestion logic"
```

---

### Task 2: PATCH extension — apply a structured pick directly

Adds a structured `meetingPoint` path to the schema and route so a clicked suggestion is written with no re-geocoding. No unit test (consistent with the codebase — no route is unit-tested); verification is typecheck + build.

**Files:**
- Modify: `lib/validation/matchRequest.ts:14-17`
- Modify: `app/api/match-requests/[id]/route.ts:96-110`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: PATCH now accepts `{ meetingPoint: { name: string; lat: number; lng: number } }` — Task 4's apply-mutation relies on this.

- [ ] **Step 1: Extend the validation schema**

In `lib/validation/matchRequest.ts`, replace the `updateMatchRequestSchema` (lines 14-17) with:

```ts
export const updateMatchRequestSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]).optional(),
  // Free-text meeting point — geocoded by the route.
  meetingPointQuery: z.string().min(1).max(200).optional(),
  // Structured meeting point — a known name + coordinates, applied directly
  // (no geocode). Used by the overlap-suggestion picks on the detail page.
  meetingPoint: z
    .object({
      name: z.string().min(1).max(200),
      lat: z.number().gte(-90).lte(90),
      lng: z.number().gte(-180).lte(180),
    })
    .optional(),
});
```

Leave the surrounding comment (lines 12-13) and `UpdateMatchRequestInput` export unchanged.

- [ ] **Step 2: Handle the structured pick in the PATCH route**

In `app/api/match-requests/[id]/route.ts`, replace the meeting-point block (lines 96-110) with:

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

The `isClosed` and status-authorisation guards above this block are untouched and still run first.

- [ ] **Step 3: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/validation/matchRequest.ts app/api/match-requests/[id]/route.ts
git commit -m "feat: apply a structured meeting point via PATCH without geocoding"
```

---

### Task 3: New endpoint — `GET /api/match-requests/[id]/meeting-suggestions`

Read-only route composing Task 1's logic with Overpass and the privacy layer. No unit test (consistent with the codebase); verification is typecheck + build.

**Files:**
- Create: `app/api/match-requests/[id]/meeting-suggestions/route.ts`

**Interfaces:**
- Consumes: `circlesOverlap`, `suggestionsInIntersection`, `DEFAULT_OVERLAP_TOLERANCE_STEPS` from Task 1; `getAuthorizedMatchRequest`, `coarsenCoordinates`, `calculateSearchRadiusMeters`, `STEP_LENGTH_METERS`, `findMeetingPoints`.
- Produces: response `{ suggestions: SuggestionWithDistances[]; reason: null | "counterpart-no-location" | "no-overlap" | "none-found" }` — Task 4 consumes this exact shape.

- [ ] **Step 1: Write the route**

Create `app/api/match-requests/[id]/meeting-suggestions/route.ts`:

```ts
// app/api/match-requests/[id]/meeting-suggestions/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthorizedMatchRequest } from "@/lib/getAuthorizedMatchRequest";
import { coarsenCoordinates } from "@/lib/locationPrivacy";
import { calculateSearchRadiusMeters, STEP_LENGTH_METERS } from "@/lib/searchRadius";
import { findMeetingPoints } from "@/lib/meetingPoints";
import {
  circlesOverlap,
  suggestionsInIntersection,
  DEFAULT_OVERLAP_TOLERANCE_STEPS,
} from "@/lib/meetingSuggestions";

// Kept local and identical to the other match routes' cap — see the note in
// app/api/match/meeting-points/route.ts. Not shared, by design.
const MAX_RADIUS_METERS = 15000;

// Bound the tolerance so a crafted or fat-fingered value can't request an
// enormous Overpass area. 20000 steps ≈ 14.6 km, already near MAX_RADIUS.
const MAX_TOLERANCE_STEPS = 20000;

function resolveToleranceSteps(param: string | null): number | { error: string } {
  if (param == null) return DEFAULT_OVERLAP_TOLERANCE_STEPS;
  const parsed = Number(param);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: "Ungültige Toleranz." };
  }
  return Math.min(parsed, MAX_TOLERANCE_STEPS);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const matchRequest = await getAuthorizedMatchRequest(params.id, session.user.id);
  if (!matchRequest) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const toleranceResult = resolveToleranceSteps(new URL(request.url).searchParams.get("toleranceSteps"));
  if (typeof toleranceResult === "object") {
    return NextResponse.json({ error: toleranceResult.error }, { status: 400 });
  }
  const toleranceMeters = toleranceResult * STEP_LENGTH_METERS;

  const currentUser = matchRequest.fromUserId === session.user.id ? matchRequest.fromUser : matchRequest.toUser;
  const counterpart = matchRequest.fromUserId === session.user.id ? matchRequest.toUser : matchRequest.fromUser;

  // Either side missing a location means no intersection can be computed.
  // The current user missing one is already blocked upstream, but guard both.
  if (currentUser.lat == null || currentUser.lng == null || counterpart.lat == null || counterpart.lng == null) {
    return NextResponse.json({ suggestions: [], reason: "counterpart-no-location" });
  }

  const ownOrigin = { lat: currentUser.lat, lng: currentUser.lng };
  // The counterpart's exact point must never leave the server — coarsen to
  // their chosen precision. The intersection is computed against the coarser
  // point; that may widen it, which is acceptable and intended.
  const cpOrigin = coarsenCoordinates(
    { lat: counterpart.lat, lng: counterpart.lng },
    counterpart.locationPrecision
  );

  const ownRadiusMeters = calculateSearchRadiusMeters(currentUser.schritteziel);
  const cpRadiusMeters = calculateSearchRadiusMeters(counterpart.schritteziel);

  if (!circlesOverlap(ownOrigin, ownRadiusMeters, cpOrigin, cpRadiusMeters, toleranceMeters)) {
    return NextResponse.json({ suggestions: [], reason: "no-overlap" });
  }

  // Query around the current user's origin with the widened own-radius. Every
  // point in the lens is within (ownRadius + tolerance) of ownOrigin, so this
  // single call provably contains the whole intersection. No cuisine filter —
  // the detail page has none.
  const queryRadiusMeters = Math.min(ownRadiusMeters + toleranceMeters, MAX_RADIUS_METERS);
  const candidates = await findMeetingPoints(ownOrigin, queryRadiusMeters);

  const suggestions = suggestionsInIntersection(
    candidates,
    ownOrigin,
    ownRadiusMeters,
    cpOrigin,
    cpRadiusMeters,
    toleranceMeters
  );

  return NextResponse.json({
    suggestions,
    reason: suggestions.length > 0 ? null : "none-found",
  });
}
```

- [ ] **Step 2: Verify types and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`getAuthorizedMatchRequest` includes `fromUser`/`toUser`, which carry `lat`, `lng`, `schritteziel`, `locationPrecision`.)

- [ ] **Step 3: Commit**

```bash
git add "app/api/match-requests/[id]/meeting-suggestions/route.ts"
git commit -m "feat: meeting-suggestions endpoint for the radius overlap"
```

---

### Task 4: Frontend — suggestions block on the detail page

Adds the "Vorschläge in eurer Nähe" block with a tolerance input, ranked list, and one-click apply. No unit test (consistent with the codebase); verification is typecheck + build + manual walkthrough.

**Files:**
- Modify: `app/nachrichten/[id]/page.tsx`

**Interfaces:**
- Consumes: the endpoint from Task 3 and the structured PATCH from Task 2.
- Produces: nothing downstream.

- [ ] **Step 1: Add imports and types**

In `app/nachrichten/[id]/page.tsx`, add to the imports (after the existing `Input` import on line 14):

```tsx
import { Label } from "@/components/ui/label";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { metersToSteps } from "@/lib/searchRadius";
import { DEFAULT_OVERLAP_TOLERANCE_STEPS } from "@/lib/meetingSuggestions";
```

Add these types just below the `MessageItem` interface (after line 41):

```tsx
interface MeetingSuggestion {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceOwnMeters: number;
  distanceCounterpartMeters: number;
}

type SuggestionReason = null | "counterpart-no-location" | "no-overlap" | "none-found";

interface MeetingSuggestionsResponse {
  suggestions: MeetingSuggestion[];
  reason: SuggestionReason;
}

const suggestionEmptyNote: Record<Exclude<SuggestionReason, null>, string> = {
  "counterpart-no-location": "Die andere Person hat noch keinen Standort hinterlegt.",
  "no-overlap":
    "Eure Radien überlappen sich nicht. Erhöhe die Toleranz oder gib einen Treffpunkt frei ein.",
  "none-found": "Im gemeinsamen Bereich wurden keine Orte gefunden.",
};
```

- [ ] **Step 2: Add tolerance state, debounced query, and apply mutation**

Inside `NachrichtenDetailPage`, after the `statusError` state (line 62), add:

```tsx
  const [toleranceSteps, setToleranceSteps] = useState(String(DEFAULT_OVERLAP_TOLERANCE_STEPS));
  const debouncedToleranceSteps = useDebouncedValue(toleranceSteps, 350);
```

After the `meetingPointMutation` block (after line 126), add the suggestions query and the apply mutation:

```tsx
  const closedForSuggestions = matchRequest ? isClosed(matchRequest.status) : true;
  const suggestionsQuery = useQuery<MeetingSuggestionsResponse>({
    queryKey: ["meeting-suggestions", params.id, debouncedToleranceSteps],
    enabled: !closedForSuggestions,
    queryFn: async () => {
      const res = await fetch(
        `/api/match-requests/${params.id}/meeting-suggestions?toleranceSteps=${encodeURIComponent(debouncedToleranceSteps)}`
      );
      if (!res.ok) throw new Error("Vorschläge konnten nicht geladen werden.");
      return res.json();
    },
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async (suggestion: MeetingSuggestion) => {
      const res = await fetch(`/api/match-requests/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingPoint: { name: suggestion.name, lat: suggestion.lat, lng: suggestion.lng },
        }),
      });
      if (!res.ok) throw new Error("Treffpunkt konnte nicht übernommen werden.");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-request", params.id] });
    },
  });
```

Note: `isClosed` is a module-level function (line 48) and `matchRequest` is in scope here, so `closedForSuggestions` is safe to compute before the early return on line 145.

- [ ] **Step 3: Render the suggestions block**

In the Treffpunkt `CardContent`, inside the existing `{!closed && ( … )}` block, add the suggestions UI directly above the free-text `<form>` (before line 173's `<form`):

```tsx
              <div className="flex flex-col gap-2 border-b pb-3">
                <p className="font-medium">Vorschläge in eurer Nähe</p>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tolerance-steps">Toleranz (Schritte)</Label>
                  <Input
                    id="tolerance-steps"
                    type="number"
                    min="0"
                    value={toleranceSteps}
                    onChange={(event) => setToleranceSteps(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ein höherer Wert vergrößert die Reichweite beider Personen, sodass mehr Orte infrage kommen.
                  </p>
                </div>
                {suggestionsQuery.isLoading && (
                  <p className="text-sm text-muted-foreground">Lädt Vorschläge…</p>
                )}
                {suggestionsQuery.data && suggestionsQuery.data.reason && (
                  <p className="text-sm text-muted-foreground">
                    {suggestionEmptyNote[suggestionsQuery.data.reason]}
                  </p>
                )}
                {suggestionsQuery.data?.suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm">{suggestion.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Du: {metersToSteps(suggestion.distanceOwnMeters)} Schritte · Andere:{" "}
                        {metersToSteps(suggestion.distanceCounterpartMeters)} Schritte
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => applySuggestionMutation.mutate(suggestion)}
                      disabled={applySuggestionMutation.isPending}
                    >
                      Übernehmen
                    </Button>
                  </div>
                ))}
                {applySuggestionMutation.isError && (
                  <p className="text-sm text-destructive">
                    {(applySuggestionMutation.error as Error).message}
                  </p>
                )}
              </div>
```

The existing free-text form stays below it, unchanged, as the fallback.

- [ ] **Step 4: Verify types, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 5: Manual verification (seeded two-account walkthrough)**

Run: `npm run dev`
- Open a match-request detail page where both participants have locations set.
- Confirm the "Vorschläge in eurer Nähe" block lists ranked places with both step distances.
- Raise "Toleranz (Schritte)"; after ~350 ms the list widens (more places appear).
- Click "Übernehmen" on one; confirm the Treffpunkt name + map above update to that place (no geocode round-trip).
- Set tolerance to a value with no overlap (or use a request whose radii are far apart) and confirm the "no-overlap" note appears.

- [ ] **Step 6: Commit**

```bash
git add "app/nachrichten/[id]/page.tsx"
git commit -m "feat: meeting-point suggestions block on the request detail page"
```

---

## Self-Review notes

- **Spec coverage:** pure module (§1) → Task 1; endpoint (§2) incl. all four `reason` values, coarsening, single Overpass call, tolerance validation/clamp → Task 3; PATCH extension (§3) → Task 2; frontend block, tolerance input, debounce, ranked list in steps, apply-mutation + invalidation, empty/loading states → Task 4. Testing plan (§Testing) → Task 1's cases (overlap: overlapping/touching/disjoint/tolerance-boundary; intersection: kept/dropped/annotated/ranked/tolerance-widened).
- **Type consistency:** `circlesOverlap`, `suggestionsInIntersection`, `SuggestionWithDistances`, `DEFAULT_OVERLAP_TOLERANCE_STEPS` are defined in Task 1 and used verbatim in Tasks 3–4. PATCH `meetingPoint: { name, lat, lng }` defined in Task 2, sent identically in Task 4.
- **Out of scope (unchanged):** no map of the intersection, no cuisine filter, no negotiable meeting point.
