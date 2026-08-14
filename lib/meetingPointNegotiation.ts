export type ProposalStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "SUPERSEDED";

export interface Proposal {
  id: string;
  proposedById: string;
  name: string;
  lat: number;
  lng: number;
  status: ProposalStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export type HeaderState =
  | "none" // no agreed point, no pending proposal
  | "pending-awaiting-you" // a pending proposal the viewer must respond to
  | "pending-awaiting-them" // the viewer's own pending proposal
  | "agreed"; // an agreed point exists, nothing pending

export interface NegotiationState {
  pendingProposal: Proposal | null;
  canPropose: boolean;
  headerState: HeaderState;
}

/**
 * Derive the negotiation UI state from the proposal log. Pure: the single
 * PENDING entry (if any) is the live proposal; everything else follows from
 * who proposed it and whether an agreed point already exists.
 *
 * `viewerId` is null while the session is still loading. Every actor-specific
 * decision below compares against it, so a placeholder id would flip the
 * proposer into the responder role — hence the explicit read-only state
 * instead: no pending proposal surfaced, nothing actionable.
 */
export function deriveNegotiationState(
  proposals: Proposal[],
  hasAgreedPoint: boolean,
  viewerId: string | null
): NegotiationState {
  if (viewerId === null) {
    return {
      pendingProposal: null,
      canPropose: false,
      headerState: hasAgreedPoint ? "agreed" : "none",
    };
  }

  const pendingProposal = proposals.find((p) => p.status === "PENDING") ?? null;

  // No pending proposal → anyone may propose. A pending proposal → only its
  // counterpart may propose (a counter); its proposer may not. The counterpart
  // of a pending proposal is exactly who may respond to it — the UI reads that
  // from `headerState === "pending-awaiting-you"`.
  const canPropose = pendingProposal === null || pendingProposal.proposedById !== viewerId;

  let headerState: HeaderState;
  if (pendingProposal === null) {
    headerState = hasAgreedPoint ? "agreed" : "none";
  } else if (pendingProposal.proposedById === viewerId) {
    headerState = "pending-awaiting-them";
  } else {
    headerState = "pending-awaiting-you";
  }

  return { pendingProposal, canPropose, headerState };
}
