// lib/accountDeletion.ts
//
// The decisions behind deleting an account, kept free of Prisma so they can be
// unit-tested in Node (see the testing-scope rule in CLAUDE.md). The route
// handler is the only place that talks to the database; everything that could
// be got *wrong* lives here.
//
// The shape of the feature: a deletion erases every personal field and every
// message the user wrote, but leaves the `User` row itself in place. That is
// not a soft delete — nothing about the person survives it. The row exists
// purely because `MatchRequest.fromUserId`/`toUserId` are non-nullable foreign
// keys, and dropping it would take the counterpart's whole conversation with
// it. Keeping an empty shell lets the surviving participant see "Gelöschtes
// Konto" and their own messages, instead of a thread that silently vanished.

/** The fields of a match request this module needs in order to classify it. */
export interface DeletableMatchRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  /** Whether each participant's account is *already* deleted. */
  fromUserDeleted: boolean;
  toUserDeleted: boolean;
}

export interface MatchRequestPartition {
  /** Remove entirely — no living participant is left to read them. */
  destroy: string[];
  /** Keep for the surviving counterpart, minus the deleted user's messages. */
  tombstone: string[];
}

/**
 * Split a user's match requests into the ones that outlive them and the ones
 * that should go with them.
 *
 * A request is only worth keeping if someone is left who can read it. Once both
 * participants have deleted their accounts, the row is unreachable by anyone
 * and retaining it would just be data nobody asked us to keep.
 */
export function partitionMatchRequests(
  requests: DeletableMatchRequest[],
  deletingUserId: string
): MatchRequestPartition {
  const partition: MatchRequestPartition = { destroy: [], tombstone: [] };

  for (const request of requests) {
    const isFrom = request.fromUserId === deletingUserId;
    const isTo = request.toUserId === deletingUserId;

    // Not this user's request at all — the caller queried too widely. Leave it
    // alone rather than guessing.
    if (!isFrom && !isTo) continue;

    // A request from someone to themselves should not exist, but if one ever
    // did there is no counterpart to preserve it for.
    if (isFrom && isTo) {
      partition.destroy.push(request.id);
      continue;
    }

    const counterpartAlreadyDeleted = isFrom ? request.toUserDeleted : request.fromUserDeleted;
    if (counterpartAlreadyDeleted) {
      partition.destroy.push(request.id);
    } else {
      partition.tombstone.push(request.id);
    }
  }

  return partition;
}

/**
 * The update payload that empties a user row.
 *
 * `accountId` is derived from the (already unique) row id rather than nulled,
 * because the column carries a unique constraint and is not nullable. The
 * `deleted-` prefix makes it impossible to collide with a generated Account ID,
 * which only ever contains characters from the unambiguous alphabet in
 * lib/identity.ts — no lowercase letters and no hyphen.
 *
 * `recoveryKeyHash` is replaced with a marker that is not a valid bcrypt hash.
 * `bcrypt.compare` returns false for a malformed hash rather than throwing, so
 * this fails closed even if the `deletedAt` check in auth.ts were ever removed.
 */
export function buildDeletedUserFields(userId: string, deletedAt: Date) {
  return {
    deletedAt,
    accountId: `deleted-${userId}`,
    recoveryKeyHash: DELETED_RECOVERY_KEY_HASH,
    alias: null,
    locationLabel: null,
    lat: null,
    lng: null,
    locationPrecision: null,
    branche: null,
    brancheVisible: false,
    position: null,
    karrierelevel: null,
    schritteziel: null,
  } as const;
}

export const DELETED_RECOVERY_KEY_HASH = "deleted-account-no-login";

/**
 * Whether the *other* participant of a match request has deleted their account,
 * from the point of view of the given viewer.
 *
 * Every write path into a conversation consults this, so the rule lives in one
 * place: a tombstoned thread is readable but frozen. A viewer who is not a
 * participant gets `false` — authorization is `getAuthorizedMatchRequest`'s job,
 * and answering "deleted" here would leak that the request exists.
 */
export function isCounterpartDeleted(
  matchRequest: {
    fromUserId: string;
    toUserId: string;
    fromUser: { deletedAt: Date | null };
    toUser: { deletedAt: Date | null };
  },
  viewerId: string
): boolean {
  if (matchRequest.fromUserId === viewerId) return matchRequest.toUser.deletedAt != null;
  if (matchRequest.toUserId === viewerId) return matchRequest.fromUser.deletedAt != null;
  return false;
}

/** German error returned by every write path into a tombstoned conversation. */
export const COUNTERPART_DELETED_ERROR =
  "Diese Person hat ihr Konto gelöscht. Die Unterhaltung kann nicht fortgesetzt werden.";

/** What the UI shows where a deleted user's alias used to be. */
export const DELETED_USER_ALIAS = "Gelöschtes Konto";
