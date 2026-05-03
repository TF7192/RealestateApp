-- 2026-05-03 sprint — additive: chain-of-custody fields for Israeli
-- electronic-signature law (חוק חתימה אלקטרונית, תשס"א-2001) tier-2
-- admissibility. All nullable so existing signed contracts stay valid.
ALTER TABLE "Contract" ADD COLUMN "documentHash" VARCHAR(128);
ALTER TABLE "Contract" ADD COLUMN "signedIp" VARCHAR(64);
ALTER TABLE "Contract" ADD COLUMN "signedUserAgent" VARCHAR(512);
ALTER TABLE "Contract" ADD COLUMN "consentText" TEXT;
ALTER TABLE "Contract" ADD COLUMN "consentAcceptedAt" TIMESTAMPTZ(6);
