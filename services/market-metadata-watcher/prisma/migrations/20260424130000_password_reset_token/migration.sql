-- PasswordResetToken — single-use tokens minted by POST /auth/forgot-password
-- and consumed by POST /auth/reset-password. `token` is a 48-byte hex string
-- (crypto.randomBytes(24).toString('hex')). Rows are kept even after `usedAt`
-- so we can audit abuse later; a cron job (TBD) purges anything >30 days old.
CREATE TABLE "PasswordResetToken" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
