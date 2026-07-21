-- CreateEnum
CREATE TYPE "LocationPrecision" AS ENUM ('EXACT', 'POSTAL_CODE', 'CITY');

-- CreateEnum
CREATE TYPE "Karrierelevel" AS ENUM ('ANGESTELLT', 'MITTLERES_MANAGEMENT', 'LEITEND', 'GESCHAEFTSFUEHRUNG');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('MANUAL', 'MATCH_ME');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "recoveryKeyHash" TEXT NOT NULL,
    "alias" TEXT,
    "locationLabel" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locationPrecision" "LocationPrecision",
    "branche" TEXT,
    "brancheVisible" BOOLEAN NOT NULL DEFAULT false,
    "position" TEXT,
    "karrierelevel" "Karrierelevel",
    "schritteziel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRequest" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "type" "MatchType" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'OPEN',
    "proposedTimeslot" TIMESTAMP(3),
    "meetingPointLat" DOUBLE PRECISION,
    "meetingPointLng" DOUBLE PRECISION,
    "meetingPointName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "matchRequestId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_accountId_key" ON "User"("accountId");

-- CreateIndex
CREATE INDEX "MatchRequest_fromUserId_idx" ON "MatchRequest"("fromUserId");

-- CreateIndex
CREATE INDEX "MatchRequest_toUserId_idx" ON "MatchRequest"("toUserId");

-- CreateIndex
CREATE INDEX "Message_matchRequestId_idx" ON "Message"("matchRequestId");

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRequest" ADD CONSTRAINT "MatchRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_matchRequestId_fkey" FOREIGN KEY ("matchRequestId") REFERENCES "MatchRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
