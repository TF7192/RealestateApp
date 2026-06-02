-- Drop the message-template system (per-agent WhatsApp templates).
-- See docs/removal-2026-06-02-feature-cull.md §7.
--
-- The Templates settings page, the property-detail "WhatsApp לקונים"
-- share, and every template-render call site are gone. The
-- MessageTemplateKind enum is dropped wholesale (the TRANSFER value
-- was already removed when transfers shipped in §2).

DROP TABLE IF EXISTS "MessageTemplate" CASCADE;
DROP TYPE IF EXISTS "MessageTemplateKind";
