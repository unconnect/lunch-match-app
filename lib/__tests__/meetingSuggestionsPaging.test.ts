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

  it("does not hang and reveals every item when batchSize is 0", () => {
    const s = makeSuggestions(15);
    const result = orderSuggestionsIntoBatches(s, 3, 15, 0);
    expect(result).toHaveLength(15);
    expect([...result.map((x) => x.id)].sort()).toEqual([...s.map((x) => x.id)].sort());
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
