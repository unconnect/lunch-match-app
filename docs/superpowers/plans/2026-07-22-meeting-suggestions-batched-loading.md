# On-demand batched meeting-point suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the suggestions block load on demand and reveal places 10 at a time (random draw, ordered within each batch), mark the applied place, and let the user close the list.

**Architecture:** A new pure module (`lib/meetingSuggestionsPaging.ts`) does the seeded shuffle + per-batch ordering and is unit-tested. The suggestions block in `app/nachrichten/[id]/page.tsx` gates its query behind a load button, pages via local state, marks the applied row, and resets on close or tolerance change. The API, PATCH apply path, free-text fallback, and map are unchanged.

**Tech Stack:** Next.js (app router, client component), TanStack Query, React state, Vitest, TypeScript.

## Global Constraints

- **Batch size:** `SUGGESTION_BATCH_SIZE = 10`, exported from the new module and used by the frontend (no separate literal).
- **Ordering rule:** shuffle the full list once per load (seeded, deterministic given the seed); reveal `visibleCount` items; sort **each consecutive chunk of `batchSize` independently** by `max(distanceOwnMeters, distanceCounterpartMeters)` ascending; concatenate chunks in reveal order. Do not globally sort the visible list.
- **Reset:** clicking "Schließen" **and** any change to the tolerance input both reset identically — `suggestionsRequested = false`, `visibleCount = SUGGESTION_BATCH_SIZE`. This disables the query.
- **Applied-marking:** a row is applied when `suggestion.lat === matchRequest.meetingPointLat && suggestion.lng === matchRequest.meetingPointLng`.
- **The endpoint is NOT changed.** It already returns `{ suggestions, reason }` with the full ranked list.
- **UI copy is German.**
- **Distances display in steps** via `metersToSteps` (already imported).
- **Test runner:** `npm run test` (Vitest); tests live in `lib/__tests__/`.
- `SuggestionWithDistances` is defined in `lib/meetingSuggestions.ts` (`extends MeetingPoint` with `distanceOwnMeters`, `distanceCounterpartMeters`).

---

### Task 1: Pure batching/ordering module — `lib/meetingSuggestionsPaging.ts`

The only unit-tested task. No I/O, no framework.

**Files:**
- Create: `lib/meetingSuggestionsPaging.ts`
- Test: `lib/__tests__/meetingSuggestionsPaging.test.ts`

**Interfaces:**
- Consumes: `SuggestionWithDistances` from `@/lib/meetingSuggestions`.
- Produces (the frontend relies on these exact names/types):
  - `SUGGESTION_BATCH_SIZE: number` (= 10)
  - `orderSuggestionsIntoBatches(suggestions: SuggestionWithDistances[], seed: number, visibleCount: number, batchSize?: number): SuggestionWithDistances[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/meetingSuggestionsPaging.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  orderSuggestionsIntoBatches,
  SUGGESTION_BATCH_SIZE,
} from "@/lib/meetingSuggestionsPaging";
import type { SuggestionWithDistances } from "@/lib/meetingSuggestions";

// Build N suggestions with distinct, controllable distances. maxDist = i, so a
// pure ascending sort would yield ids "0","1","2",… in order.
function makeSuggestions(n: number): SuggestionWithDistances[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    name: `P${i}`,
    lat: 0,
    lng: 0,
    distanceOwnMeters: i,
    distanceCounterpartMeters: 0, // so max(own, cp) === i
  }));
}

describe("SUGGESTION_BATCH_SIZE", () => {
  it("is 10", () => {
    expect(SUGGESTION_BATCH_SIZE).toBe(10);
  });
});

describe("orderSuggestionsIntoBatches", () => {
  it("returns [] for an empty input", () => {
    expect(orderSuggestionsIntoBatches([], 1, 10)).toEqual([]);
  });

  it("returns [] when visibleCount is 0", () => {
    expect(orderSuggestionsIntoBatches(makeSuggestions(30), 1, 0)).toEqual([]);
  });

  it("is deterministic for a fixed seed", () => {
    const s = makeSuggestions(30);
    const a = orderSuggestionsIntoBatches(s, 12345, 20);
    const b = orderSuggestionsIntoBatches(s, 12345, 20);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it("generally yields a different order for a different seed", () => {
    const s = makeSuggestions(50);
    const a = orderSuggestionsIntoBatches(s, 1, 50).map((x) => x.id);
    const b = orderSuggestionsIntoBatches(s, 2, 50).map((x) => x.id);
    expect(a).not.toEqual(b);
  });

  it("clamps visibleCount above the list length to the whole list", () => {
    const s = makeSuggestions(7);
    const result = orderSuggestionsIntoBatches(s, 99, 100);
    expect(result).toHaveLength(7);
    // every original id present exactly once
    expect([...result.map((x) => x.id)].sort()).toEqual(
      [...s.map((x) => x.id)].sort()
    );
  });

  it("reveals exactly visibleCount items when the list is longer", () => {
    const s = makeSuggestions(30);
    expect(orderSuggestionsIntoBatches(s, 5, 10)).toHaveLength(10);
    expect(orderSuggestionsIntoBatches(s, 5, 20)).toHaveLength(20);
  });

  it("sorts each batch of batchSize independently by max-distance ascending", () => {
    const s = makeSuggestions(30);
    const batchSize = 10;
    const result = orderSuggestionsIntoBatches(s, 777, 20, batchSize);
    const maxDist = (x: SuggestionWithDistances) =>
      Math.max(x.distanceOwnMeters, x.distanceCounterpartMeters);
    // First batch sorted ascending within itself…
    const first = result.slice(0, batchSize).map(maxDist);
    expect(first).toEqual([...first].sort((a, b) => a - b));
    // …second batch sorted ascending within itself…
    const second = result.slice(batchSize, 2 * batchSize).map(maxDist);
    expect(second).toEqual([...second].sort((a, b) => a - b));
    // …but the batches are NOT globally merged: the combined list is not
    // globally sorted (the shuffle splits the low-distance items across
    // batches, so the max of batch 1 exceeds the min of batch 2 for seed 777).
    const combined = result.map(maxDist);
    expect(combined).not.toEqual([...combined].sort((a, b) => a - b));
  });

  it("returns every revealed item from the source with no duplicates", () => {
    const s = makeSuggestions(25);
    const result = orderSuggestionsIntoBatches(s, 42, 20);
    const ids = new Set(result.map((x) => x.id));
    expect(ids.size).toBe(20); // no duplicates
    result.forEach((x) => expect(s.some((o) => o.id === x.id)).toBe(true));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- meetingSuggestionsPaging`
Expected: FAIL — cannot resolve `@/lib/meetingSuggestionsPaging`.

- [ ] **Step 3: Write the implementation**

Create `lib/meetingSuggestionsPaging.ts`:

```ts
import type { SuggestionWithDistances } from "@/lib/meetingSuggestions";

/** How many suggestions are revealed per "load more" step. */
export const SUGGESTION_BATCH_SIZE = 10;

// mulberry32: a tiny, fast, seeded PRNG. Deterministic given the seed, so
// orderSuggestionsIntoBatches stays pure and unit-testable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher–Yates shuffle into a new array, driven by a seeded RNG.
function seededShuffle<T>(items: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function maxDistance(s: SuggestionWithDistances): number {
  return Math.max(s.distanceOwnMeters, s.distanceCounterpartMeters);
}

/**
 * Deterministic given `seed`. Shuffle the full list once, reveal the first
 * `visibleCount` items, then sort each consecutive chunk of `batchSize`
 * independently by the worse of the two distances ascending, and concatenate
 * the sorted chunks in reveal order. This gives variety across loads (the
 * shuffle) while keeping each revealed batch tidy (most reachable first).
 */
export function orderSuggestionsIntoBatches(
  suggestions: SuggestionWithDistances[],
  seed: number,
  visibleCount: number,
  batchSize: number = SUGGESTION_BATCH_SIZE
): SuggestionWithDistances[] {
  const shuffled = seededShuffle(suggestions, seed);
  const visible = shuffled.slice(0, Math.max(0, visibleCount));

  const ordered: SuggestionWithDistances[] = [];
  for (let start = 0; start < visible.length; start += batchSize) {
    const chunk = visible.slice(start, start + batchSize);
    chunk.sort((a, b) => maxDistance(a) - maxDistance(b));
    ordered.push(...chunk);
  }
  return ordered;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- meetingSuggestionsPaging`
Expected: PASS (all cases). If the "NOT globally sorted" assertion is flaky for the chosen seed (777), pick a different fixed seed that demonstrably splits low-distance items across batches — do not weaken the assertion to `.toEqual`.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: all tests pass (previous 47 + the new ones), output pristine.

- [ ] **Step 6: Commit**

```bash
git add lib/meetingSuggestionsPaging.ts lib/__tests__/meetingSuggestionsPaging.test.ts
git commit -m "feat: seeded batch ordering for meeting-point suggestions"
```

---

### Task 2: Frontend — on-demand, paged, closable suggestions with applied-marking

Modifies only the suggestions block in the detail page. No unit test (consistent with the codebase); verification is `tsc` + lint + build.

**Files:**
- Modify: `app/nachrichten/[id]/page.tsx`

**Interfaces:**
- Consumes: `orderSuggestionsIntoBatches`, `SUGGESTION_BATCH_SIZE` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Add the import**

In `app/nachrichten/[id]/page.tsx`, add after the existing `DEFAULT_OVERLAP_TOLERANCE_STEPS` import (line 20):

```tsx
import { orderSuggestionsIntoBatches, SUGGESTION_BATCH_SIZE } from "@/lib/meetingSuggestionsPaging";
```

- [ ] **Step 2: Add paging state**

In `NachrichtenDetailPage`, right after the existing tolerance state (line 90-91):

```tsx
  const [suggestionsRequested, setSuggestionsRequested] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [visibleCount, setVisibleCount] = useState(SUGGESTION_BATCH_SIZE);
```

- [ ] **Step 3: Gate the query behind the load button**

Change the suggestions `useQuery`'s `enabled` (currently line 160) from:

```tsx
    enabled: !closedForSuggestions,
```

to:

```tsx
    enabled: suggestionsRequested && !closedForSuggestions,
```

Leave the `queryKey` (`["meeting-suggestions", params.id, debouncedToleranceSteps]`) and `queryFn` unchanged.

- [ ] **Step 4: Add the load and reset handlers**

Immediately after the `applySuggestionMutation` block (after line 185), add:

```tsx
  const loadSuggestions = () => {
    setShuffleSeed(Date.now());
    setVisibleCount(SUGGESTION_BATCH_SIZE);
    setSuggestionsRequested(true);
  };

  // Both "Schließen" and any tolerance edit return to the collapsed button
  // state and disable the query; the next load re-fetches with the current
  // tolerance and a fresh shuffle.
  const resetSuggestions = () => {
    setSuggestionsRequested(false);
    setVisibleCount(SUGGESTION_BATCH_SIZE);
  };
```

- [ ] **Step 5: Replace the suggestions block JSX**

Replace the entire suggestions `<div className="flex flex-col gap-2 border-b pb-3"> … </div>` (currently lines 232-284) with:

```tsx
              <div className="flex flex-col gap-2 border-b pb-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Vorschläge in eurer Nähe</p>
                  {suggestionsRequested && (
                    <Button type="button" variant="ghost" size="sm" onClick={resetSuggestions}>
                      Schließen
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="tolerance-steps">Toleranz (Schritte)</Label>
                  <Input
                    id="tolerance-steps"
                    type="number"
                    min="0"
                    value={toleranceSteps}
                    onChange={(event) => {
                      setToleranceSteps(event.target.value);
                      resetSuggestions();
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ein höherer Wert vergrößert die Reichweite beider Personen, sodass mehr Orte infrage kommen.
                  </p>
                </div>

                {!suggestionsRequested && (
                  <Button type="button" variant="outline" onClick={loadSuggestions}>
                    Lade 10 Vorschläge
                  </Button>
                )}

                {suggestionsRequested && (
                  <>
                    {suggestionsQuery.isLoading && (
                      <p className="text-sm text-muted-foreground">Lädt Vorschläge…</p>
                    )}
                    {suggestionsQuery.isError && (
                      <p className="text-sm text-destructive">
                        Vorschläge konnten nicht geladen werden.
                      </p>
                    )}
                    {suggestionsQuery.data && suggestionsQuery.data.reason && (
                      <p className="text-sm text-muted-foreground">
                        {suggestionEmptyNote[suggestionsQuery.data.reason]}
                      </p>
                    )}
                    {suggestionsQuery.data &&
                      orderSuggestionsIntoBatches(
                        suggestionsQuery.data.suggestions,
                        shuffleSeed,
                        visibleCount
                      ).map((suggestion) => {
                        const isApplied =
                          matchRequest.meetingPointLat === suggestion.lat &&
                          matchRequest.meetingPointLng === suggestion.lng;
                        return (
                          <div
                            key={suggestion.id}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-md px-2 py-1",
                              isApplied && "bg-muted"
                            )}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm">{suggestion.name}</span>
                              <span className="text-xs text-muted-foreground">
                                Du: {metersToSteps(suggestion.distanceOwnMeters)} Schritte · Andere:{" "}
                                {metersToSteps(suggestion.distanceCounterpartMeters)} Schritte
                              </span>
                            </div>
                            {isApplied ? (
                              <span className="text-xs font-medium text-muted-foreground">Übernommen</span>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => applySuggestionMutation.mutate(suggestion)}
                                disabled={applySuggestionMutation.isPending}
                              >
                                Übernehmen
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    {suggestionsQuery.data &&
                      visibleCount < suggestionsQuery.data.suggestions.length && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setVisibleCount((c) => c + SUGGESTION_BATCH_SIZE)}
                        >
                          Weitere 10 laden
                        </Button>
                      )}
                    {applySuggestionMutation.isError && (
                      <p className="text-sm text-destructive">
                        {(applySuggestionMutation.error as Error).message}
                      </p>
                    )}
                  </>
                )}
              </div>
```

Note: `matchRequest`, `cn`, `metersToSteps`, `suggestionEmptyNote`, and `applySuggestionMutation` are all already in scope at this point (past the `if (isLoading || !matchRequest) return` early return, and already imported/defined). `size="sm"` and `variant="ghost"` are standard variants of the existing `Button` component.

- [ ] **Step 6: Verify types, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; build succeeds. If `Button` has no `"ghost"` variant or `size` prop in this project's component, fall back to `variant="outline"` and drop `size` — check `components/ui/button.tsx` and adjust rather than inventing props.

- [ ] **Step 7: Manual verification (seeded two-account walkthrough)**

Run: `npm run dev`
- Open a detail page where both participants have locations: confirm the block shows the tolerance input + "Lade 10 Vorschläge" and **no list loads on its own** (no network call to `meeting-suggestions` until the button is clicked — check the Network tab).
- Click "Lade 10 Vorschläge": up to 10 rows appear; each batch of 10 is ordered by reachability.
- Click "Weitere 10 laden": the next 10 appear with no new network request; the button disappears once all are shown.
- Click "Übernehmen" on a row: the map/name above update; that row now shows "Übernommen" with a highlight and no button.
- Click "Schließen": the list collapses back to the "Lade 10 Vorschläge" button.
- Edit the tolerance: the list also collapses back to the button; reloading uses the new tolerance.

- [ ] **Step 8: Commit**

```bash
git add "app/nachrichten/[id]/page.tsx"
git commit -m "feat: on-demand paged suggestions with close and applied-marking"
```

---

## Self-Review notes

- **Spec coverage:** pure module with seeded shuffle + per-batch ordering (§1) → Task 1, incl. the tested behaviours (determinism, per-batch ordering, clamping, empty). On-demand load, three visual states, "Weitere 10 laden", "Schließen", tolerance-and-close reset, applied-marking (§2) → Task 2. Endpoint unchanged — no task, by design.
- **Type consistency:** `SUGGESTION_BATCH_SIZE` and `orderSuggestionsIntoBatches` defined in Task 1 are imported and used verbatim in Task 2. `SuggestionWithDistances` comes from the existing `lib/meetingSuggestions.ts`.
- **Out of scope (unchanged):** endpoint, PATCH apply path, free-text fallback, map, server-side cap.
