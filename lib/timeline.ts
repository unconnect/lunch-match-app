import type { Proposal } from "@/lib/meetingPointNegotiation";

export interface MessageItem {
  id: string;
  text: string;
  senderId: string;
  createdAt: string;
}

export interface TimelineMessageEntry {
  kind: "message";
  id: string;
  createdAt: string;
  message: MessageItem;
}

export interface TimelineProposalEntry {
  kind: "proposal";
  id: string;
  createdAt: string;
  proposal: Proposal;
}

export type TimelineEntry = TimelineMessageEntry | TimelineProposalEntry;

/**
 * Merge chat messages and meeting-point proposals into one time-ordered feed.
 * Sorted by `createdAt` ascending; at an equal timestamp a message sorts
 * before a proposal, then by id, so the order is deterministic. ISO-8601
 * timestamps compare correctly as strings.
 */
export function mergeTimeline(messages: MessageItem[], proposals: Proposal[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...messages.map(
      (m): TimelineMessageEntry => ({ kind: "message", id: m.id, createdAt: m.createdAt, message: m })
    ),
    ...proposals.map(
      (p): TimelineProposalEntry => ({ kind: "proposal", id: p.id, createdAt: p.createdAt, proposal: p })
    ),
  ];

  return entries.sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "message" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
