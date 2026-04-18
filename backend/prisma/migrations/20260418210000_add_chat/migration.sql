-- In-app chat (Conversation + Message) + admin panel routes.

CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'ARCHIVED');

CREATE TABLE "Conversation" (
  "id"            TEXT                NOT NULL,
  "userId"        TEXT                NOT NULL,
  "status"        "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt"     TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMessageAt" TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Conversation_userId_key"        ON "Conversation"("userId");
CREATE        INDEX "Conversation_status_lastMessageAt_idx"
                                                   ON "Conversation"("status", "lastMessageAt");
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Message" (
  "id"             TEXT         NOT NULL,
  "conversationId" TEXT         NOT NULL,
  "senderId"       TEXT         NOT NULL,
  "senderRole"     TEXT         NOT NULL,
  "body"           TEXT         NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt"         TIMESTAMP(3),
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_conversationId_createdAt_idx"
  ON "Message"("conversationId", "createdAt");
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
