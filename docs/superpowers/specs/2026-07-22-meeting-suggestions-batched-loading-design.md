# On-demand, batched, closable meeting-point suggestions

**Date:** 2026-07-22
**Status:** Approved, ready for implementation plan
**Builds on:** `2026-07-22-meeting-point-overlap-suggestions-design.md`
(the suggestions feature this refines)

## Problem

Click-testing the shipped suggestions block surfaced two rough edges, both
worst with the Berlin seed data where the overlap can contain hundreds of
places:

1. **Eager, slow load.** The suggestions `useQuery` fires on every detail-page
   open, so an Overpass call runs unprompted and the resulting list can be
   enormous — a wall of rows nobody asked for.
2. **No sense of what's already chosen.** Once a suggestion is applied, the
   list gives no signal which row it was, and there is no way to get the long
   list out of the way.

Note: the suggestions come from **Overpass**, not geocoding — geocoding runs
only for the free-text fallback. Applying a suggestion is already a direct,
un-geocoded write. So the latency to address is the eager Overpass call plus
rendering a huge list, not geocoding.

## Goal

Make the suggestions block **on-demand and paged**: nothing loads until the
user asks, then places are revealed 10 at a time. Mark the applied place in
the list, and let the user close the list away. The API, the PATCH apply path,
the free-text fallback, and the map are all unchanged — this is a
frontend-plus-one-pure-helper change.

Scope decisions (settled during brainstorming):

- **Load on click, page by 10.** A "Lade 10 Vorschläge" button triggers the
  single Overpass fetch; "Weitere 10 laden" reveals the next 10 with no further
  network call.
- **Random draw, ordered within each batch.** The full overlap list is
  shuffled once per load; each revealed batch of 10 is sorted by reachability
  internally.
- **Both close and tolerance-change fully reset** to the initial button state.
- **No server-side size cap** (YAGNI at the seed scale).

## Architecture

Two units:

1. A new pure batching/ordering module (`lib/meetingSuggestionsPaging.ts`),
   independently testable.
2. Frontend changes to the suggestions block in
   `app/nachrichten/[id]/page.tsx`.

The endpoint `GET /api/match-requests/[id]/meeting-suggestions` is **not
changed**: it already returns the full ranked list plus `reason`, which is
exactly the input the client now shuffles and pages.

### 1. Pure logic — `lib/meetingSuggestionsPaging.ts`

No I/O, no framework. Consumes `SuggestionWithDistances` from
`lib/meetingSuggestions.ts`.

```ts
export const SUGGESTION_BATCH_SIZE = 10;

// Deterministic given `seed`: a tiny seeded RNG (e.g. mulberry32) drives a
// Fisher–Yates shuffle, so the function is pure and unit-testable.
export function orderSuggestionsIntoBatches(
  suggestions: SuggestionWithDistances[],
  seed: number,
  visibleCount: number,
  batchSize?: number, // defaults to SUGGESTION_BATCH_SIZE
): SuggestionWithDistances[];
```

Behaviour:

- Seed-shuffle the full `suggestions` list once (Fisher–Yates driven by a
  seeded RNG — pure given `seed`).
- Take the first `min(visibleCount, length)` items.
- Group that visible slice into consecutive chunks of `batchSize`; sort **each
  chunk independently** by `max(distanceOwnMeters, distanceCounterpartMeters)`
  ascending; concatenate the sorted chunks in reveal order.
- Return the concatenation. An empty input returns `[]`; `visibleCount` larger
  than the list is clamped to the list length; a `visibleCount` of 0 returns
  `[]`.

Rationale for batch-internal sorting: the shuffle gives variety across loads
("random draw"), while sorting within a batch keeps each revealed group of 10
tidy (most reachable first). Sorting the whole visible list globally would
defeat the fresh-draw feel between batches.

### 2. Frontend — `app/nachrichten/[id]/page.tsx`

The suggestions block (inside the Treffpunkt card's existing `{!closed && …}`
region) gains three visual states.

**State**

- `suggestionsRequested: boolean` — false initially; the load button sets it
  true.
- `shuffleSeed: number` — set to a fresh value (e.g. `Date.now()`) when the
  load button is clicked; feeds the pure helper so the shuffle is stable across
  re-renders of one load.
- `visibleCount: number` — starts at `SUGGESTION_BATCH_SIZE`; "Weitere 10
  laden" adds `SUGGESTION_BATCH_SIZE`.

**Query gating**

- The existing `useQuery` becomes `enabled: suggestionsRequested &&
  !closedForSuggestions` (today it is `enabled: !closedForSuggestions`).
- The query key keeps `[..., debouncedToleranceSteps]` so a load uses the
  current tolerance.

**Visual states**

1. **Collapsed (initial):** the "Toleranz (Schritte)" input + hint, and a
   **"Lade 10 Vorschläge"** button. No list, no network call.
2. **Loading:** after the click, while the query is fetching → "Lädt
   Vorschläge…".
3. **Open:** the paged list from `orderSuggestionsIntoBatches(
   data.suggestions, shuffleSeed, visibleCount)`, plus:
   - **"Weitere 10 laden"** — shown only while `visibleCount <
     data.suggestions.length`; increments `visibleCount`. No network call.
   - **"Schließen"** — resets to state 1.
   - The empty-state `reason` notes (`counterpart-no-location`, `no-overlap`,
     `none-found`) and the fetch-error note render in this state as they do
     today.

**Reset semantics (both trigger the identical reset)**

- Clicking **"Schließen"**, and **any change to the tolerance input**, both:
  set `suggestionsRequested = false`, reset `visibleCount` to
  `SUGGESTION_BATCH_SIZE`. This disables the query and returns to state 1;
  reopening re-fetches with the then-current tolerance. (A fresh `shuffleSeed`
  is taken on the next load-button click.)

**Applied-marking**

- A row is the applied one when its coordinates equal the request's current
  meeting point: `suggestion.lat === matchRequest.meetingPointLat &&
  suggestion.lng === matchRequest.meetingPointLng`. Applied picks copy
  coordinates verbatim through the PATCH, so exact equality holds.
- The applied row is visually highlighted and shows an **"Übernommen"** badge;
  its "Übernehmen" button is replaced by the disabled/badge state (no re-apply
  of the already-applied place).

## Data flow

```
detail page — suggestions block
  collapsed → user clicks "Lade 10 Vorschläge"
        → suggestionsRequested = true; shuffleSeed = Date.now(); visibleCount = 10
        → useQuery enabled → GET …/meeting-suggestions?toleranceSteps=N  (Overpass, once)
        → orderSuggestionsIntoBatches(suggestions, shuffleSeed, visibleCount) → render
  user clicks "Weitere 10 laden"
        → visibleCount += 10  (re-render only; no network)
  user clicks a row's "Übernehmen"
        → PATCH { meetingPoint }  → invalidate ["match-request", id]
        → applied row now matches meetingPointLat/Lng → "Übernommen" badge
  user clicks "Schließen"  OR  edits tolerance
        → suggestionsRequested = false; visibleCount = 10  → back to collapsed
```

## Error handling

- Unchanged from the base feature: `401`/`404` via the shared authz helper,
  `400` on invalid tolerance, Overpass failure → `reason: "none-found"`, and
  the client's `suggestionsQuery.isError` note (added in the base feature's
  final-review fixes) still renders in the open state.
- The pure helper never throws: empty input → `[]`; out-of-range
  `visibleCount` is clamped.

## Testing

- **Unit tests** for `lib/meetingSuggestionsPaging.ts`:
  - Determinism: same `(suggestions, seed, visibleCount)` yields the same order
    across calls; two different seeds generally yield different orders.
  - Per-batch ordering: within each 10-chunk, rows are sorted by
    `max(distOwn, distCp)` ascending; a later batch is not globally merged with
    an earlier one.
  - `visibleCount` clamping: `visibleCount` beyond the list length returns the
    whole list (no error, no padding); `visibleCount` of 0 returns `[]`.
  - Empty input returns `[]`.
- **Frontend** is not unit-tested, consistent with the codebase. Manual
  verification: on a seeded two-account request, confirm nothing loads until
  the button is clicked; batches of 10 reveal on "Weitere 10 laden"; "Schließen"
  and editing tolerance both collapse to the button; and an applied place shows
  the "Übernommen" badge.

## Out of scope (possible follow-ups)

- Server-side pagination or a size cap on the response.
- Map visualisation of the overlap.
- Configurable batch size in the UI.
