-- Outlook (Microsoft Graph) calendar integration. Mirrors the four
-- googleAccessToken / googleRefreshToken / googleTokenExpiresAt /
-- googleCalendarEnabled columns so an agent can opt into Outlook
-- sync separately from Google. LeadMeeting gains outlookEventId so
-- two-way sync IDs are stored alongside googleEventId.

ALTER TABLE "User" ADD COLUMN "outlookAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "outlookRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "outlookTokenExpiresAt" TIMESTAMPTZ(6);
ALTER TABLE "User" ADD COLUMN "outlookCalendarEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LeadMeeting" ADD COLUMN "outlookEventId" TEXT;
