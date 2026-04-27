-- Sprint 10 — per-viewer "seen" state for התאמות פומביות. Allows
-- agents to clear noise on rows they've already triaged so the topbar
-- badge only counts unseen pool matches.
CREATE TABLE "PublicMatchSeen" (
  "viewerId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PublicMatchSeen_pkey" PRIMARY KEY ("viewerId", "propertyId")
);

CREATE INDEX "PublicMatchSeen_viewerId_idx"   ON "PublicMatchSeen"("viewerId");
CREATE INDEX "PublicMatchSeen_propertyId_idx" ON "PublicMatchSeen"("propertyId");

ALTER TABLE "PublicMatchSeen" ADD CONSTRAINT "PublicMatchSeen_viewerId_fkey"
  FOREIGN KEY ("viewerId")   REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublicMatchSeen" ADD CONSTRAINT "PublicMatchSeen_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
