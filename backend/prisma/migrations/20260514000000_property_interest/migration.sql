-- 2026-05-10 — PropertyInterest (per-(lead, property) activity log) +
-- OwnerActivity (per-property seller-side interaction log).
-- Captures the buyer↔owner negotiation triangle that an Israeli broker
-- routinely mediates: buyer offers, agent relays a shaved version to
-- owner, owner counters, both sides discuss commission separately, etc.

-- ── 1. Enums ────────────────────────────────────────────────────
CREATE TYPE "PropertyInterestStatus" AS ENUM (
  'IN_PROGRESS',
  'CLOSED',
  'FELL',
  'PAUSED'
);

CREATE TYPE "PropertyOfferDirection" AS ENUM (
  'BUYER_TO_SELLER',
  'SELLER_TO_BUYER'
);

CREATE TYPE "OwnerActivityKind" AS ENUM (
  'COMMISSION_TALK',
  'PRICE_TALK',
  'FEEDBACK_ON_LEAD',
  'TOUR_PERMISSION',
  'MARKETING_UPDATE',
  'OBJECTION',
  'CONTRACT_TALK',
  'GENERAL_UPDATE',
  'OTHER'
);

CREATE TYPE "OwnerCommissionResponse" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'COUNTER',
  'REJECTED'
);

-- ── 2. PropertyInterest table ──────────────────────────────────
CREATE TABLE "PropertyInterest" (
  "id"                      TEXT PRIMARY KEY,
  "agentId"                 TEXT NOT NULL,
  "propertyId"              TEXT NOT NULL,
  "leadId"                  TEXT NOT NULL,
  "status"                  "PropertyInterestStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "notes"                   TEXT,
  "lostReason"              TEXT,
  -- Buyer-side commission (agent's fee from this buyer)
  "buyerCommissionPct"      DOUBLE PRECISION,
  "buyerCommissionBase"     INTEGER,
  "buyerCommissionFlat"     INTEGER,
  "buyerCommissionDiscount" INTEGER,
  "buyerCommissionNotes"    TEXT,
  -- Agreed deal terms (payment schedule, handover date, …)
  "dealNotes"               TEXT,
  "lastActionAt"            TIMESTAMPTZ(6),
  "createdAt"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "PropertyInterest_agent_fk"    FOREIGN KEY ("agentId")    REFERENCES "User"("id")     ON DELETE CASCADE,
  CONSTRAINT "PropertyInterest_property_fk" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE,
  CONSTRAINT "PropertyInterest_lead_fk"     FOREIGN KEY ("leadId")     REFERENCES "Lead"("id")     ON DELETE CASCADE
);

CREATE UNIQUE INDEX "PropertyInterest_property_lead_unique"
  ON "PropertyInterest" ("propertyId", "leadId");
CREATE INDEX "PropertyInterest_agentId_idx"          ON "PropertyInterest" ("agentId");
CREATE INDEX "PropertyInterest_property_status_idx"  ON "PropertyInterest" ("propertyId", "status");
CREATE INDEX "PropertyInterest_lead_status_idx"      ON "PropertyInterest" ("leadId", "status");
CREATE INDEX "PropertyInterest_lastActionAt_idx"     ON "PropertyInterest" ("lastActionAt");

-- ── 3. OwnerActivity table ────────────────────────────────────
CREATE TABLE "OwnerActivity" (
  "id"                  TEXT PRIMARY KEY,
  "agentId"             TEXT NOT NULL,
  "propertyId"          TEXT NOT NULL,
  "kind"                "OwnerActivityKind" NOT NULL,
  "title"               TEXT NOT NULL,
  "notes"               TEXT,
  -- Commission-talk specific
  "commissionPct"       DOUBLE PRECISION,
  "commissionFlat"      INTEGER,
  "commissionResponse"  "OwnerCommissionResponse",
  -- Optional cross-ref to a buyer-side lead this conversation was about
  "relatedLeadId"       TEXT,
  "occurredAt"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "createdAt"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "OwnerActivity_agent_fk"      FOREIGN KEY ("agentId")        REFERENCES "User"("id")     ON DELETE CASCADE,
  CONSTRAINT "OwnerActivity_property_fk"   FOREIGN KEY ("propertyId")     REFERENCES "Property"("id") ON DELETE CASCADE,
  CONSTRAINT "OwnerActivity_lead_fk"       FOREIGN KEY ("relatedLeadId")  REFERENCES "Lead"("id")     ON DELETE SET NULL
);

CREATE INDEX "OwnerActivity_agentId_idx"          ON "OwnerActivity" ("agentId");
CREATE INDEX "OwnerActivity_propertyId_idx"       ON "OwnerActivity" ("propertyId");
CREATE INDEX "OwnerActivity_property_occurred_idx"
  ON "OwnerActivity" ("propertyId", "occurredAt" DESC);
CREATE INDEX "OwnerActivity_relatedLeadId_idx"    ON "OwnerActivity" ("relatedLeadId");

-- ── 4. Back-link columns + offer-thread fields ────────────────
ALTER TABLE "PropertyViewing" ADD COLUMN "interestId" TEXT;
ALTER TABLE "PropertyViewing" ADD CONSTRAINT "PropertyViewing_interest_fk"
  FOREIGN KEY ("interestId") REFERENCES "PropertyInterest"("id") ON DELETE SET NULL;
CREATE INDEX "PropertyViewing_interestId_idx" ON "PropertyViewing" ("interestId");

ALTER TABLE "PropertyOffer" ADD COLUMN "interestId"     TEXT;
ALTER TABLE "PropertyOffer" ADD COLUMN "relayedAmount"  INTEGER;
ALTER TABLE "PropertyOffer" ADD COLUMN "direction"      "PropertyOfferDirection" NOT NULL DEFAULT 'BUYER_TO_SELLER';
ALTER TABLE "PropertyOffer" ADD COLUMN "replyToOfferId" TEXT;
ALTER TABLE "PropertyOffer" ADD COLUMN "paymentTerms"   TEXT;
ALTER TABLE "PropertyOffer" ADD COLUMN "handoverNotes"  TEXT;
ALTER TABLE "PropertyOffer" ADD CONSTRAINT "PropertyOffer_interest_fk"
  FOREIGN KEY ("interestId") REFERENCES "PropertyInterest"("id") ON DELETE SET NULL;
ALTER TABLE "PropertyOffer" ADD CONSTRAINT "PropertyOffer_reply_fk"
  FOREIGN KEY ("replyToOfferId") REFERENCES "PropertyOffer"("id") ON DELETE SET NULL;
CREATE INDEX "PropertyOffer_interestId_idx" ON "PropertyOffer" ("interestId");
CREATE INDEX "PropertyOffer_replyTo_idx"    ON "PropertyOffer" ("replyToOfferId");

ALTER TABLE "Agreement" ADD COLUMN "interestId" TEXT;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_interest_fk"
  FOREIGN KEY ("interestId") REFERENCES "PropertyInterest"("id") ON DELETE SET NULL;
CREATE INDEX "Agreement_interestId_idx" ON "Agreement" ("interestId");

ALTER TABLE "Contract" ADD COLUMN "interestId" TEXT;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_interest_fk"
  FOREIGN KEY ("interestId") REFERENCES "PropertyInterest"("id") ON DELETE SET NULL;
CREATE INDEX "Contract_interestId_idx" ON "Contract" ("interestId");

ALTER TABLE "LeadMeeting" ADD COLUMN "propertyId" TEXT;
ALTER TABLE "LeadMeeting" ADD COLUMN "interestId" TEXT;
ALTER TABLE "LeadMeeting" ADD CONSTRAINT "LeadMeeting_property_fk"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL;
ALTER TABLE "LeadMeeting" ADD CONSTRAINT "LeadMeeting_interest_fk"
  FOREIGN KEY ("interestId") REFERENCES "PropertyInterest"("id") ON DELETE SET NULL;
CREATE INDEX "LeadMeeting_propertyId_idx" ON "LeadMeeting" ("propertyId");
CREATE INDEX "LeadMeeting_interestId_idx" ON "LeadMeeting" ("interestId");
