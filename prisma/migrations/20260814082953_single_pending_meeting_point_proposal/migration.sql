-- Enforce "at most one PENDING proposal per match request" in the database.
-- The route handler checks this inside a transaction, but Postgres defaults to
-- READ COMMITTED, which does not serialize that read-then-write: two
-- participants proposing at the same moment both read "no pending row" and both
-- insert. The second row is then invisible to deriveNegotiationState (it takes
-- the first PENDING entry) and resurfaces once the first is resolved.
--
-- Not expressible in schema.prisma: Prisma has no syntax for partial indexes.

-- Existing data may already contain duplicates created before the index. Keep
-- the newest PENDING proposal per match request and mark the rest superseded,
-- which is how the negotiation UI already treated them.
UPDATE "MeetingPointProposal" AS p
SET "status" = 'SUPERSEDED', "resolvedAt" = COALESCE("resolvedAt", NOW())
WHERE p."status" = 'PENDING'
  AND p."id" <> (
    SELECT q."id"
    FROM "MeetingPointProposal" AS q
    WHERE q."matchRequestId" = p."matchRequestId"
      AND q."status" = 'PENDING'
    ORDER BY q."createdAt" DESC, q."id" DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX "MeetingPointProposal_one_pending_per_match_request"
  ON "MeetingPointProposal" ("matchRequestId")
  WHERE "status" = 'PENDING';
