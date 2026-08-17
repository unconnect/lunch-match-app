import { describe, expect, it } from "vitest";
import {
  buildDeletedUserFields,
  DELETED_RECOVERY_KEY_HASH,
  isCounterpartDeleted,
  partitionMatchRequests,
  type DeletableMatchRequest,
} from "@/lib/accountDeletion";
import { deleteAccountSchema } from "@/lib/validation/accountDeletion";

const ME = "user-me";
const OTHER = "user-other";

function request(overrides: Partial<DeletableMatchRequest> = {}): DeletableMatchRequest {
  return {
    id: "mr-1",
    fromUserId: ME,
    toUserId: OTHER,
    fromUserDeleted: false,
    toUserDeleted: false,
    ...overrides,
  };
}

describe("partitionMatchRequests", () => {
  it("keeps a request whose counterpart is still active, whichever side we are", () => {
    const sent = request({ id: "sent", fromUserId: ME, toUserId: OTHER });
    const received = request({ id: "received", fromUserId: OTHER, toUserId: ME });

    const result = partitionMatchRequests([sent, received], ME);

    expect(result.tombstone).toEqual(["sent", "received"]);
    expect(result.destroy).toEqual([]);
  });

  it("destroys a request whose counterpart already deleted their account", () => {
    const sent = request({ id: "sent", fromUserId: ME, toUserId: OTHER, toUserDeleted: true });
    const received = request({
      id: "received",
      fromUserId: OTHER,
      toUserId: ME,
      fromUserDeleted: true,
    });

    const result = partitionMatchRequests([sent, received], ME);

    expect(result.destroy).toEqual(["sent", "received"]);
    expect(result.tombstone).toEqual([]);
  });

  it("looks at the counterpart's flag, not the deleting user's own", () => {
    // The deleting user's row may already carry deletedAt by the time this
    // runs; that must not make us destroy a conversation someone else can read.
    const stillReadable = request({ id: "keep", fromUserDeleted: true, toUserDeleted: false });

    expect(partitionMatchRequests([stillReadable], ME)).toEqual({
      destroy: [],
      tombstone: ["keep"],
    });
  });

  it("ignores requests the user is not part of", () => {
    const foreign = request({ id: "foreign", fromUserId: "a", toUserId: "b" });

    expect(partitionMatchRequests([foreign], ME)).toEqual({ destroy: [], tombstone: [] });
  });

  it("destroys a self-request, since no counterpart can be left behind", () => {
    const self = request({ id: "self", fromUserId: ME, toUserId: ME });

    expect(partitionMatchRequests([self], ME)).toEqual({ destroy: ["self"], tombstone: [] });
  });

  it("handles an empty list", () => {
    expect(partitionMatchRequests([], ME)).toEqual({ destroy: [], tombstone: [] });
  });
});

describe("buildDeletedUserFields", () => {
  const deletedAt = new Date("2026-08-17T12:00:00Z");
  const fields = buildDeletedUserFields("abc123", deletedAt);

  it("clears every personal field", () => {
    expect(fields.alias).toBeNull();
    expect(fields.locationLabel).toBeNull();
    expect(fields.lat).toBeNull();
    expect(fields.lng).toBeNull();
    expect(fields.locationPrecision).toBeNull();
    expect(fields.branche).toBeNull();
    expect(fields.position).toBeNull();
    expect(fields.karrierelevel).toBeNull();
    expect(fields.schritteziel).toBeNull();
    expect(fields.brancheVisible).toBe(false);
  });

  it("records when the deletion happened", () => {
    expect(fields.deletedAt).toBe(deletedAt);
  });

  it("replaces the Account ID with a value no generator could produce", () => {
    expect(fields.accountId).toBe("deleted-abc123");
    // lib/identity.ts draws Account IDs from an alphabet with no lowercase
    // letters and no hyphen, so a collision with a live account is impossible.
    expect(fields.accountId).toMatch(/[a-z-]/);
  });

  it("makes the recovery key unusable", () => {
    expect(fields.recoveryKeyHash).toBe(DELETED_RECOVERY_KEY_HASH);
    // Not a bcrypt hash: bcrypt.compare returns false for it rather than
    // throwing, so login fails closed.
    expect(fields.recoveryKeyHash.startsWith("$2")).toBe(false);
  });
});

describe("isCounterpartDeleted", () => {
  const past = new Date("2026-08-17T12:00:00Z");

  function thread(fromDeleted: Date | null, toDeleted: Date | null) {
    return {
      fromUserId: ME,
      toUserId: OTHER,
      fromUser: { deletedAt: fromDeleted },
      toUser: { deletedAt: toDeleted },
    };
  }

  it("is true when the other side is deleted", () => {
    expect(isCounterpartDeleted(thread(null, past), ME)).toBe(true);
    expect(isCounterpartDeleted(thread(past, null), OTHER)).toBe(true);
  });

  it("is false when only the viewer's own side is deleted", () => {
    expect(isCounterpartDeleted(thread(past, null), ME)).toBe(false);
    expect(isCounterpartDeleted(thread(null, past), OTHER)).toBe(false);
  });

  it("is false when neither side is deleted", () => {
    expect(isCounterpartDeleted(thread(null, null), ME)).toBe(false);
  });

  it("is false for a viewer who is not a participant", () => {
    // Authorization belongs to getAuthorizedMatchRequest; answering anything
    // else here would confirm the request exists to a stranger.
    expect(isCounterpartDeleted(thread(past, past), "someone-else")).toBe(false);
  });
});

describe("deleteAccountSchema", () => {
  it("accepts a non-empty confirmation", () => {
    expect(deleteAccountSchema.safeParse({ confirmation: "DEMA2KHQXP" }).success).toBe(true);
  });

  it("rejects an empty or missing confirmation", () => {
    expect(deleteAccountSchema.safeParse({ confirmation: "" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
  });
});
