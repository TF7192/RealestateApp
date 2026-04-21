-- Sprint 1 / MLS parity — Task A1 fill-in: OfficeInvite table.
-- Lets OWNERs invite an email that isn't yet a registered user; the
-- invite is claimed automatically when that email signs up or logs in
-- (see auth.ts). Purely additive; does not touch existing rows.

CREATE TABLE "OfficeInvite" (
  "id"           TEXT          NOT NULL,
  "officeId"     TEXT          NOT NULL,
  "email"        TEXT          NOT NULL,
  "invitedById"  TEXT          NOT NULL,
  "acceptedAt"   TIMESTAMP(3),
  "acceptedById" TEXT,
  "revokedAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "OfficeInvite_pkey" PRIMARY KEY ("id")
);

-- Same email can only have one invite row per office (upsert path).
CREATE UNIQUE INDEX "OfficeInvite_officeId_email_key"
  ON "OfficeInvite"("officeId", "email");

-- Lookup at login/signup time — hot path for auto-accept.
CREATE INDEX "OfficeInvite_email_idx" ON "OfficeInvite"("email");

-- Cascading FKs: deleting the office or inviter removes the invite.
-- The accepter FK is SET NULL so a user deletion doesn't wipe the
-- history of who claimed which invite.
ALTER TABLE "OfficeInvite"
  ADD CONSTRAINT "OfficeInvite_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "Office"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfficeInvite"
  ADD CONSTRAINT "OfficeInvite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfficeInvite"
  ADD CONSTRAINT "OfficeInvite_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
