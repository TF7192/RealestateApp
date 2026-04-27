-- Free-form landlord-side commission amount (e.g. "חודש + מע״מ", "2%",
-- "5000 ש״ח"). Companion to the existing tenantSideOnly boolean — when
-- the landlord side DOES pay, this captures how much.

ALTER TABLE "Property"
  ADD COLUMN "landlordCommission" TEXT;
