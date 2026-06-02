# Feature Removal Manifest — 2026-06-02

Owner: Adam. Status: awaiting sign-off, then execute.

Eight feature surfaces are being deleted from Estia. This document lists
every file, route, model, button, and test that gets touched. Read it
once, approve, then I execute in one branch with per-feature commits.

## Ground rules

- **No `git push` or tag** until Adam explicitly says so. Local commits only.
- One commit per feature (8 commits + 1 verify commit).
- Prisma migrations are **additive** — new migrations to drop columns/tables;
  don't edit past ones.
- Keep what we said to keep: `Office`/`OfficeInvite`/`User.officeId` (tenant scoping),
  per-lead single-shot wa.me icon buttons in CustomerDetail / Leads list / etc.
- "Property" here = real-estate listing (not "asset" in the CS sense). The user
  uses "assets page" colloquially for the Properties pages.

---

## 1. התאמות פומביות (public matches)

**Frontend deletes**
- `frontend/src/pages/PublicMatches.jsx`
- `frontend/src/components/PropertyPublicMatchBlock.jsx`
- `MatchingList.jsx` — remove "colleagues" mode + `api.listPublicMatches()` call
- `App.jsx` — remove `/public-matches` route + lazy import
- `Layout.jsx` — remove sidebar entry + topbar `publicMatchBadge` state + `estia:public-matches-changed` listener
- `lib/api.js` — remove `listPublicMatches`, `publicMatchesCount`, `publishToPublicMatches`, `unpublishPublicMatch`, `duplicatePublicMatch`, `publicMatchCopies`, `publicMatchSeen`, `publicMatchUnseen`
- `lib/routePreload.js` — remove `/public-matches` preload

**Backend deletes**
- `backend/src/routes/public-matches.ts`
- `backend/src/server.ts` — remove `registerPublicMatchRoutes`
- `backend/src/routes/dashboard.ts` — remove `publicMatches` topbar count
- `backend/src/routes/properties.ts` — strip public-match patch fields

**Prisma migration (new)**
- Drop `Property.isPublicMatch`, `Property.publicMatchAt`, `Property.publicMatchNote`, `Property.publicMatchSourceId`
- Drop `PublicMatchSeen` table

---

## 2. העברות (transfers)

**Frontend deletes**
- `frontend/src/pages/Transfers.jsx`
- `frontend/src/components/TransferPropertyDialog.jsx`
- `frontend/src/pages/AgentTransferView.jsx`
- `App.jsx` — remove `/transfers` and `/t/:id`
- `Layout.jsx` — remove sidebar entry
- `MobileMoreSheet.jsx` — remove `/transfers` link
- `PropertyDetail.jsx` — remove `TransferPropertyDialog` import + open-button
- `Properties.jsx` — remove `TransferPropertyDialog` import + open-button
- `lib/api.js` — remove `searchTransferAgents`, `listTransfers`, `initiateTransfer`, `whatsappTransferShare`, `acceptTransfer`, `declineTransfer`, `cancelTransfer`

**Backend deletes**
- `backend/src/routes/transfers.ts`
- `backend/src/routes/public.ts` — remove `/transfer/property/:id` + asset variant
- `backend/src/server.ts` — remove `registerTransferRoutes`

**Refactor (don't delete the capability — move it)**
- `PropertyAssigneesPanel.jsx` + `PropertyPipelineBlock.jsx` reuse
  `/transfers/agents/search`. Move that handler into a new
  `backend/src/routes/agents.ts` (`/api/agents/search`) and re-point both
  consumers. Same query, new home.

**Prisma migration (new)**
- Drop `PropertyTransfer` table + `TransferStatus` enum

**Templates kind cleanup**
- `templates.ts` + `MessageTemplate` model: drop `TRANSFER` kind from
  enum/UI. (Templates.jsx is being deleted entirely in §8, so this is
  just a backend cleanup.)

**Tests deleted**
- `tests/integration/api/transfers.test.ts`
- `tests/e2e/transfers/transfers.spec.ts`
- `tests/e2e/transfers/agent-to-agent.spec.ts`

**Seed**
- `backend/prisma/seed.ts` — drop 3 demo transfer rows

---

## 3. תיבת WhatsApp (inbox)

**Frontend deletes**
- `frontend/src/pages/Inbox.jsx`
- `App.jsx` — remove `/inbox` route + import
- `Layout.jsx` — remove sidebar entry (the `comingSoon: true` one)

No backend route exists yet — nothing to delete server-side.

---

## 4. ניהול שיווקי (marketing management)

**Frontend deletes**
- `frontend/src/pages/Marketing.jsx`
- `frontend/src/components/MarketingActionDialog.jsx`
- `App.jsx` — remove `/marketing` route + import
- `Layout.jsx` — remove sidebar entry
- `PropertyDetail.jsx` — remove `MarketingActionDialog` import + the
  per-property action tracker section that uses it

**Backend deletes**
- `backend/src/routes/marketing.ts`
- `backend/src/routes/marketingTrack.ts`
- `backend/src/server.ts` — remove both `register*` calls

**Prisma migration (new)**
- Drop `MarketingAction` table + `Property.marketingActions` relation

**Tests**
- `tests/integration/api/marketing-overview.test.ts`
- `tests/integration/api/marketing-promote-inquiry.test.ts`

---

## 5. הצוות שלי (my team)

**Frontend deletes**
- `frontend/src/pages/Team.jsx`
- `frontend/src/pages/TeamAgentDetail.jsx`
- `frontend/src/components/TeamStatsDashboard.jsx`
- `App.jsx` — remove `/team` and `/team/:agentId` routes + imports
- `Layout.jsx` — remove sidebar entry
- `Office.jsx` — remove `/team` cross-link (Office is deleted next, but
  in case Office.jsx is touched first)
- `NeighborhoodAdmin.jsx` — remove any `/team` link

**Backend deletes**
- `backend/src/routes/team.ts`
- `backend/src/server.ts` — remove `registerTeamRoutes`

**No prisma changes** — Team had no dedicated model.

**Tests**
- `tests/integration/api/team-stats.test.ts`
- `tests/integration/api/team-scoreboard.test.ts`

---

## 6. המשרד שלי (my office UI — DB stays)

**Frontend deletes**
- `frontend/src/pages/Office.jsx`
- `frontend/src/pages/Office.css`
- `App.jsx` — remove `/office` route + import
- `Layout.jsx` — remove sidebar entry
- `Settings.jsx` — remove the OWNER-only "office settings" menu entry

**Backend deletes**
- `backend/src/routes/office.ts`
- `backend/src/server.ts` — remove `registerOfficeRoutes`

**Prisma: KEEP** `Office`, `OfficeInvite`, `User.officeId`. These scope
tenants and removing them would require a much bigger migration.

**Tests**
- `tests/integration/api/office.test.ts`
- `tests/integration/api/office-invites.test.ts`
- `tests/integration/office-cross-tenant-block.test.ts`

---

## 7. Properties-page WhatsApp + landing-page features

**Landing page (fully delete)**
- `frontend/src/pages/PropertyDetail.jsx` — remove "ערוך דף נחיתה",
  "שתף דף נחיתה", "דף נחיתה ללקוחות" copy-link, and the toast/event
  branch around them (lines ~1083, 1245–1275)
- `frontend/src/pages/LandingEditor.jsx` (the editor page)
- `frontend/src/pages/PropertyLandingPage.jsx` (the public landing page)
- `App.jsx` — remove `/properties/:id/landing-editor` and
  `/l/:agentSlug/:propertySlug` routes
- `backend/src/routes/marketingTrack.ts` already deleted in §4
- `lib/api.js` — remove any `landingPage*` methods

**Prisma migration (new)**
- Drop `Property.landingPageConfig` column

**WhatsApp template share to leads (fully delete from PropertyDetail)**
- `frontend/src/pages/PropertyDetail.jsx` — remove `WhatsAppSheet`
  import + render (lines ~2131, 2244), `handleWhatsApp`,
  `buildFullWhatsAppMessage`, template-loading effect, and the
  "WhatsApp לקונים" quick-action
- `frontend/src/pages/Templates.jsx` (the template editor page)
- `App.jsx` — remove `/templates` route + import
- `Layout.jsx` — remove `/templates` sidebar entry (if present)
- `backend/src/routes/templates.ts`
- `backend/src/server.ts` — remove `registerTemplateRoutes`
- `lib/api.js` — remove `listTemplates`, `saveTemplate`, `resetTemplate`
- `frontend/src/lib/templates.js` — delete (or trim to just what's still used by `WhatsAppSheet`'s remaining consumers; if no other consumer remains, delete)

**WhatsApp-to-owner button**
- `PropertyDetail.jsx` — remove the small WhatsApp icon on the owner
  section (lines ~1574, 1792) and any matching block on the right rail
- `Properties.jsx` — remove the per-row WhatsApp icon-button +
  `handleWhatsApp` + `buildWhatsAppMessage` (lines 39, 192, 1356, 1506)
  to honor "no WhatsApp anywhere on the Properties page"

**Prisma migration (new)**
- Drop `MessageTemplate` table

**Tests touching these surfaces**
- `tests/frontend/unit/templates.test.ts` — delete
- Any e2e covering `landing-editor` / `PropertyLandingPage` — delete

---

## 8. Bulk WhatsApp on /customers (מתעניינים)

**Frontend deletes**
- `frontend/src/components/BulkWhatsAppDialog.jsx`
- `Customers.jsx` (or wherever it's rendered) — remove the "send bulk
  WhatsApp" button + dialog wiring + the multi-select-with-WhatsApp
  flow

Per-lead single-shot wa.me icons on individual lead rows / lead detail
remain. (The user's standing line: plain wa.me share stays.)

---

## Order of execution

1. `feat(removal): drop public-matches feature` (§1)
2. `feat(removal): drop transfers, move agent-search to /api/agents/search` (§2)
3. `feat(removal): drop WhatsApp inbox placeholder` (§3)
4. `feat(removal): drop marketing-management page + MarketingAction` (§4)
5. `feat(removal): drop team scoreboard + per-agent view` (§5)
6. `feat(removal): drop office UI; keep models for tenant scoping` (§6)
7. `feat(removal): drop landing pages + WhatsApp template share on PropertyDetail/Properties; drop /templates` (§7)
8. `feat(removal): drop bulk WhatsApp dialog on customers` (§8)
9. `chore(removal): verification — typecheck/lint/build/Vitest unit/Vitest frontend/Vitest integration/Playwright @critical` (§verify)

## Verification gate (per CLAUDE.md)

`npm run lint && npm run typecheck && npm run build` in both `backend/`
and `frontend/`, then Vitest unit + frontend + integration, then
Playwright `@critical`. Any failure rooted in a stale reference to a
removed feature → fix at the reference site, not by re-adding the
feature.

## Risks / open items

- The bulk-customers WhatsApp dialog wiring may share helpers
  (`buildWhatsAppMessage`, lead picker) with single-lead share. I'll
  delete the dialog and only delete helpers that become unused.
- `marketingTrack.ts` is referenced from a public marketing-track
  pixel/endpoint that the landing pages call. Since landing pages are
  also being deleted, both go together cleanly. No external consumers
  are known.
- Notification type `property_transfer` and ActivityLog "transferred"
  verb — leave the historical rows in the DB (harmless), remove only
  emission sites and any UI that hard-codes the verb.

---

## After removal

Next sprint, brainstorm + implement:
- Tag CRUD on assets surfaced in `/market-discovery` (מודעות חדשות בשוק)
- Tag filter UI on that page
- Move city/area filter from settings into the page itself, so the user
  can scope which ads they see inline
