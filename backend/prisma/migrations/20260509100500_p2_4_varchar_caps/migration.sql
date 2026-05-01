-- P2-4 from the DB audit (binary-sleeping-mist).
-- VARCHAR caps on contact PII. Email = 255 (RFC 5321 + 1), phone = 32
-- (E.164 max + extension). Existing values are well below these caps,
-- so the conversion is data-preserving.

ALTER TABLE "User" ALTER COLUMN "email" TYPE VARCHAR(255);
ALTER TABLE "User" ALTER COLUMN "phone" TYPE VARCHAR(32);

ALTER TABLE "Office" ALTER COLUMN "phone" TYPE VARCHAR(32);

ALTER TABLE "OfficeInvite" ALTER COLUMN "email" TYPE VARCHAR(255);

ALTER TABLE "Owner" ALTER COLUMN "phone" TYPE VARCHAR(32);
ALTER TABLE "Owner" ALTER COLUMN "email" TYPE VARCHAR(255);

ALTER TABLE "OwnerPhone" ALTER COLUMN "phone" TYPE VARCHAR(32);

ALTER TABLE "Lead" ALTER COLUMN "phone" TYPE VARCHAR(32);
ALTER TABLE "Lead" ALTER COLUMN "email" TYPE VARCHAR(255);
ALTER TABLE "Lead" ALTER COLUMN "primaryPhone" TYPE VARCHAR(32);
ALTER TABLE "Lead" ALTER COLUMN "phone1" TYPE VARCHAR(32);
ALTER TABLE "Lead" ALTER COLUMN "phone2" TYPE VARCHAR(32);
