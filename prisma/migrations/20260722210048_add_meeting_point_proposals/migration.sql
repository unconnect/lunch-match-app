-- CreateEnum
CREATE TYPE "MeetingPointProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "MeetingPointProposal" (
    "id" TEXT NOT NULL,
    "matchRequestId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" "MeetingPointProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MeetingPointProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingPointProposal_matchRequestId_idx" ON "MeetingPointProposal"("matchRequestId");

-- AddForeignKey
ALTER TABLE "MeetingPointProposal" ADD CONSTRAINT "MeetingPointProposal_matchRequestId_fkey" FOREIGN KEY ("matchRequestId") REFERENCES "MatchRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPointProposal" ADD CONSTRAINT "MeetingPointProposal_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
