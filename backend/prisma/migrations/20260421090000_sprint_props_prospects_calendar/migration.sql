-- ─── Property: new optional columns ────────────────────────────────
-- 1.1 balconyType — sub-option when balconySize > 0. Values: SUNNY | COVERED.
-- 1.3 marketingStartDate — explicit listing-on-market date so "Days on
--     Market" is independent of row createdAt (edits / re-listings).
-- 3.2 commercialZone — free-form tag for commercial properties
--     (e.g. "איזור תעשיה", "מרכז עיר"). Residential rows keep NULL.

ALTER TABLE "Property" ADD COLUMN "balconyType" TEXT;
ALTER TABLE "Property" ADD COLUMN "marketingStartDate" TIMESTAMP(3);
ALTER TABLE "Property" ADD COLUMN "commercialZone" TEXT;

-- ─── Prospect — per-property intake form records ───────────────────
-- 1.5 signed intake form. Agent collects these either in-person (local
-- signature pad) or via a shareable short-lived public link the
-- prospect signs on their own phone.
CREATE TABLE "Prospect" (
    "id"              TEXT NOT NULL,
    "propertyId"      TEXT NOT NULL,
    "agentId"         TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "phone"           TEXT,
    "email"           TEXT,
    "source"          TEXT,
    "notes"           TEXT,
    "signatureDataUrl" TEXT,
    "signedAt"        TIMESTAMP(3),
    "publicToken"     TEXT,
    "tokenExpiresAt"  TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Prospect_publicToken_key" ON "Prospect"("publicToken");
CREATE INDEX "Prospect_propertyId_idx" ON "Prospect"("propertyId");
CREATE INDEX "Prospect_agentId_idx" ON "Prospect"("agentId");

ALTER TABLE "Prospect"
  ADD CONSTRAINT "Prospect_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Prospect"
  ADD CONSTRAINT "Prospect_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── User: Google Calendar OAuth tokens ────────────────────────────
-- 7.1 Store the agent's refresh/access tokens so we can act on the
-- Calendar API without requiring a re-consent on every request.
-- Access token expires ~1h, refresh token is long-lived.
ALTER TABLE "User" ADD COLUMN "googleAccessToken"     TEXT;
ALTER TABLE "User" ADD COLUMN "googleRefreshToken"    TEXT;
ALTER TABLE "User" ADD COLUMN "googleTokenExpiresAt"  TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "googleCalendarEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ─── LeadMeeting — scheduled meetings with a lead ──────────────────
-- 7.2 Each meeting is (optionally) mirrored to the agent's Google
-- Calendar; googleEventId ties the two so edits/deletes propagate.
CREATE TABLE "LeadMeeting" (
    "id"            TEXT NOT NULL,
    "leadId"        TEXT NOT NULL,
    "agentId"       TEXT NOT NULL,
    "title"         TEXT NOT NULL,
    "notes"         TEXT,
    "location"      TEXT,
    "meetLink"      TEXT,
    "startsAt"      TIMESTAMP(3) NOT NULL,
    "endsAt"        TIMESTAMP(3) NOT NULL,
    "googleEventId" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadMeeting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadMeeting_leadId_idx"   ON "LeadMeeting"("leadId");
CREATE INDEX "LeadMeeting_agentId_idx"  ON "LeadMeeting"("agentId");
CREATE INDEX "LeadMeeting_startsAt_idx" ON "LeadMeeting"("startsAt");

ALTER TABLE "LeadMeeting"
  ADD CONSTRAINT "LeadMeeting_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadMeeting"
  ADD CONSTRAINT "LeadMeeting_agentId_fkey"
    FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
