import { describe, expect, it } from "vitest";
import { deriveNegotiationState, type Proposal } from "@/lib/meetingPointNegotiation";

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    proposedById: "alice",
    name: "Café X",
    lat: 52.5,
    lng: 13.4,
    status: "PENDING",
    createdAt: "2026-07-22T10:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

describe("deriveNegotiationState", () => {
  it("is 'none' with no proposals and no agreed point", () => {
    const s = deriveNegotiationState([], false, "alice");
    expect(s.headerState).toBe("none");
    expect(s.pendingProposal).toBeNull();
    expect(s.canRespond).toBe(false);
    expect(s.canPropose).toBe(true);
  });

  it("is 'agreed' with an agreed point and nothing pending", () => {
    const resolved = proposal({ status: "ACCEPTED", resolvedAt: "2026-07-22T11:00:00.000Z" });
    const s = deriveNegotiationState([resolved], true, "bob");
    expect(s.headerState).toBe("agreed");
    expect(s.pendingProposal).toBeNull();
    expect(s.canPropose).toBe(true);
  });

  it("is 'pending-awaiting-you' for the counterpart of a pending proposal", () => {
    const s = deriveNegotiationState([proposal({ proposedById: "alice" })], false, "bob");
    expect(s.headerState).toBe("pending-awaiting-you");
    expect(s.canRespond).toBe(true);
    expect(s.canPropose).toBe(true); // counterpart may counter
    expect(s.pendingProposal?.id).toBe("p1");
  });

  it("is 'pending-awaiting-them' for the proposer of a pending proposal", () => {
    const s = deriveNegotiationState([proposal({ proposedById: "alice" })], false, "alice");
    expect(s.headerState).toBe("pending-awaiting-them");
    expect(s.canRespond).toBe(false);
    expect(s.canPropose).toBe(false); // proposer can't propose again while pending
  });

  it("ignores non-PENDING proposals when finding the pending one", () => {
    const s = deriveNegotiationState(
      [
        proposal({ id: "old", status: "SUPERSEDED" }),
        proposal({ id: "rej", status: "REJECTED" }),
      ],
      false,
      "bob"
    );
    expect(s.pendingProposal).toBeNull();
    expect(s.headerState).toBe("none");
  });

  it("keeps the agreed point during a reopening (pending + agreed both present)", () => {
    // A new pending proposal exists while an earlier one was accepted.
    const s = deriveNegotiationState(
      [proposal({ id: "acc", status: "ACCEPTED" }), proposal({ id: "new", proposedById: "bob" })],
      true,
      "alice"
    );
    expect(s.pendingProposal?.id).toBe("new");
    expect(s.headerState).toBe("pending-awaiting-you"); // alice must respond to bob's new one
  });
});
