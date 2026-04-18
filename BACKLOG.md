# Estia — Backlog

Items found during Phase 0 + 0.5 that **did not** make the Ship list. Ranked by rough value ÷ effort within each bucket, so the top of each section is what I'd pull into a future sprint first.

---

## Deferred per user direction (security)

### BL-SEC-01 — Admin allowlist duplication across 4 client files → consolidate via `user.isAdmin`
- **Bug ID:** BUG-001
- **Severity:** Critical (client-drift risk; server enforces correctly so no breach)
- **Why deferred:** User asked to ignore security items for now.
- **Fix sketch:** Add `isAdmin: boolean` to `/api/me` response (derived from `ADMIN_EMAILS` env on server). Delete `new Set(['talfuks1234@gmail.com'])` from `ChatWidget.jsx`, `AdminChats.jsx`, `Layout.jsx`, `MobileMoreSheet.jsx`. Use `user.isAdmin`.
- **Effort:** S · **Risk:** Low

### BL-SEC-02 — No CSP header
- **Bug ID:** BUG-002
- **Severity:** Critical
- **Why deferred:** Deferred with security bucket.
- **Fix sketch:** Add `Content-Security-Policy` to nginx.conf; allowlist self, posthog, unsplash CDN, S3 origin.
- **Effort:** S · **Risk:** Medium — needs a staging pass to verify nothing breaks.

---

## Deferred — need real device / TestFlight

### BL-DEV-01 — `scroll-snap` gallery jitter on iOS
- **Bug ID:** BUG-014
- **Severity:** Medium
- **Why deferred:** Can't diagnose in emulation; need a real device to confirm and tune.

### BL-DEV-02 — Clipboard silently blocked on catalog share
- **Bug ID:** BUG-021
- **Severity:** Medium
- **Why deferred:** Needs device to reproduce; likely fine because code path is a direct click handler.

### BL-DEV-03 — `position: sticky` inside scroll-container
- **Bug ID:** BUG-023
- **Severity:** Medium
- **Why deferred:** iOS-specific historical bug; verify on device first.

### BL-DEV-04 — SwipeRow threshold too high in emulation
- **Bug ID:** BUG-029
- **Severity:** Low
- **Why deferred:** Needs real finger to calibrate. 56px may already be right; don't tune blindly.

### BL-DEV-05 — Dynamic Type / VoiceOver
- **Source:** QA §6 Accessibility
- **Severity:** Medium
- **Why deferred:** Simulator VO unreliable; needs real iOS for a proper pass.

---

## Deferred — cosmetic / low-value-per-effort

### BL-LOW-01 — ChipEditor pill count vs used-fields-picker highlight
- **Bug ID:** BUG-012
- **Severity:** Low

### BL-LOW-02 — `-webkit-backdrop-filter` fallback on OfflineBanner + AdminChats
- **Bug ID:** BUG-022
- **Severity:** Low (only iOS 15; diminishing population)

### BL-LOW-03 — Remaining `text-align: left/right` literals
- **Bug ID:** BUG-024
- **Severity:** Low (most covered by Ship S6 sweep; this is the residual)

### BL-LOW-04 — Autocomplete attrs on email / signup inputs
- **Bug ID:** BUG-025
- **Severity:** Low (ergonomic)

### BL-LOW-05 — Lucide directional icons in RTL (soft mirror)
- **Bug ID:** BUG-026
- **Severity:** Low
- **Note:** Partially covered by Ship S25 — this is the residual for cases S25 decides not to flip.

---

## Deferred — larger scope than a single ship item

### BL-SCOPE-01 — Push notifications (APNs + web-push) for new chat messages
- **Source:** QA Q3
- **Why deferred:** Substantial — needs Apple Developer push certs, service worker for web-push, backend worker to fan out. User signaled it's important but to scope separately.

### BL-SCOPE-02 — No-JS customer-facing page
- **Source:** QA Q2
- **Why deferred:** Requires SSR or prerender for `/agents/:slug/:prop-slug`. Not a small change. Mitigation today: WhatsApp in-app browser supports JS; failure mode is narrow.

### BL-SCOPE-03 — Multi-select / bulk actions on customers
- **Source:** Parity gap §4
- **Why deferred:** UX design work (selection mode affordance, bulk-action sheet) + backend bulk endpoint. Sprint on its own.

### BL-SCOPE-04 — Customers list table view on iPhone
- **Source:** Parity gap §3
- **Why deferred:** iPhone table at 375px is awkward by nature; better investment is search (Ship S21) and stale-lead pill (Ship S11).

### BL-SCOPE-05 — Virtualized long-list rendering
- **Source:** QA §5 (500-lead sim)
- **Why deferred:** `content-visibility: auto` already bought most of the win. True virtualization (react-window) is an L-effort and only pays off above ~1000 items.

### BL-SCOPE-06 — Share-with-photos max 5 photos → configurable
- **Source:** Audit "Share with WhatsApp" gap
- **Why deferred:** iOS share sheet can become unreliable > 5 attachments. Needs an A/B on real device first.

### BL-SCOPE-07 — CSP + rate-limit audit on chat / native-exchange routes
- **Source:** QA §7
- **Why deferred:** Security bucket.

---

## New items discovered during Phase 0 / 0.5 (not in QA_REPORT explicitly)

### BL-NEW-01 — Lighthouse perf score < 90 on CustomerPropertyView
- **Source:** QA §5 performance
- **Severity:** Medium
- **Why deferred:** Bulk of the win is in Ship items (S13 lazy split, S14 image dimensions). Re-measure after those ship; if still <90, this becomes an actionable item.

### BL-NEW-02 — Empty-state CTAs are decent but not actionable enough
- **Source:** Phase 0 audit
- **Severity:** Low
- **Sketch:** `/customers` empty state says "אין לקוחות" — add a big "+" and "איך מוסיפים ליד?" 30-sec walk-through link.

### BL-NEW-03 — No explicit "snooze / remind me tomorrow" on a lead
- **Source:** Phase 0 audit
- **Severity:** Medium (but scope creeps into net-new)
- **Why deferred:** Overlaps with Ship S11 (stale pill) + S12 (today strip). If those land and the pain persists, revisit.

### BL-NEW-04 — Server-side chat message retention policy
- **Source:** Architecture health
- **Severity:** Low (today); grows over time
- **Sketch:** Cron prune messages > N months unless conversation status = 'OPEN'. Small.

### BL-NEW-05 — WebSocket hub won't scale horizontally
- **Source:** Architecture health
- **Severity:** Low (single-node deploy today)
- **Sketch:** Swap in Redis pub/sub when we ever run > 1 backend.
