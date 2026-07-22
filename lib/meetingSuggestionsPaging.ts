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
