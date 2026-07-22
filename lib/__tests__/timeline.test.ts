import { describe, expect, it } from "vitest";
import { mergeTimeline, type MessageItem } from "@/lib/timeline";
import type { Proposal } from "@/lib/meetingPointNegotiation";

const msg = (id: string, createdAt: string): MessageItem => ({
  id,
  text: `m-${id}`,
  senderId: "alice",
  createdAt,
});

const prop = (id: string, createdAt: string): Proposal => ({
  id,
  proposedById: "alice",
  name: `p-${id}`,
  lat: 0,
  lng: 0,
  status: "PENDING",
  createdAt,
  resolvedAt: null,
});

describe("mergeTimeline", () => {
  it("returns [] for two empty lists", () => {
    expect(mergeTimeline([], [])).toEqual([]);
  });

  it("interleaves messages and proposals by createdAt ascending", () => {
    const messages = [msg("m1", "2026-07-22T10:00:00Z"), msg("m2", "2026-07-22T10:02:00Z")];
    const proposals = [prop("p1", "2026-07-22T10:01:00Z")];
    const result = mergeTimeline(messages, proposals);
    expect(result.map((e) => `${e.kind}:${e.id}`)).toEqual([
      "message:m1",
      "proposal:p1",
      "message:m2",
    ]);
  });

  it("uses a stable tiebreak (message before proposal) at equal timestamps", () => {
    const t = "2026-07-22T10:00:00Z";
    const result = mergeTimeline([msg("m1", t)], [prop("p1", t)]);
    expect(result.map((e) => e.kind)).toEqual(["message", "proposal"]);
  });

  it("carries the full underlying objects on each entry", () => {
    const [entry] = mergeTimeline([msg("m1", "2026-07-22T10:00:00Z")], []);
    expect(entry.kind).toBe("message");
    if (entry.kind === "message") expect(entry.message.text).toBe("m-m1");
  });
});
