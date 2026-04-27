-- Agents can set their own brokerage intake terms (the legal text that
-- appears on the prospect-sign form). Plus header identity fields used
-- on the formal "הזמנת שירותי תיווך" layout: ת.ז., address.
-- All nullable, additive.

ALTER TABLE "AgentProfile"
  ADD COLUMN "personalId"         TEXT,
  ADD COLUMN "businessAddress"    TEXT,
  ADD COLUMN "brokerageTermsHtml" TEXT;
